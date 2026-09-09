"""Nado public market-data adapter.

Verified against Nado's public REST API and its docs on 2026-09-09:

    GET https://api.prod.nado.xyz/archive/v2/contracts
    GET https://api.prod.nado.xyz/gateway/v2/orderbook?ticker_id=&depth=

Nado is a CLOB DEX on Ink L2, so unlike Variational's RFQ curve there is a real
orderbook and the impact figures below are a VWAP walk over it rather than an
interpolation between quoted sizes.

Two things were confirmed rather than assumed, because both change the numbers:

  * `funding_rate` on /contracts is the **24-hour** rate, not the per-interval
    one. Nado's own formula page states it outright ("The API returns the
    24-hour (daily) funding rate", rate_1y = daily_rate x 365), and the live
    values agree: JUP-PERP read -0.000607, which annualises to -22% and sits
    inside the venue's published +/-2%-per-day cap. Read as an hourly rate it
    would have annualised to -531%.
  * Funding SETTLES hourly (docs.nado.xyz/core/funding-rates: "funding is
    settled every hour"), and every contract in the live response carried the
    same `next_funding_rate_timestamp`, on an exact hour boundary. So the
    interval is one hour while the quoted rate covers twenty-four of them.

Fees are the venue's base tier. Nado's schedule is volume-tiered and the tier
table is published as an IMAGE, so the only rates stated in text are the worked
example's 3.5 bps taker and the "as little as 1.5 bps" floor for the top tier.
`get_fees` therefore returns a base-tier taker of 3.5 bps with a maker of 0:
the docs describe maker REBATES as a benefit of higher tiers, so a base-tier
maker is not paid. If Nado ever publishes the schedule as JSON, that endpoint
should replace this constant.

Not confirmed, and so not claimed anywhere: the points programme. Nado
documents Points, Referrals and Trading Competitions, but publishes no
points-per-volume emission, so any cost-per-point here would be invented.
"""

from collections.abc import Mapping

import httpx

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    MarketUnavailable,
    OrderbookTop,
    VenueAdapter,
    VolumeData,
)

CONTRACTS_URL = "https://api.prod.nado.xyz/archive/v2/contracts"
ORDERBOOK_URL = "https://api.prod.nado.xyz/gateway/v2/orderbook"
FEE_SOURCE_URL = "https://docs.nado.xyz/core/fees-and-rebates"

_DAYS_PER_YEAR = 365.0
_FUNDING_INTERVAL_HOURS = 1.0
_HOURS_PER_DAY = 24.0
_IMPACT_BUCKETS_USD = (10_000.0, 50_000.0, 100_000.0)
_ORDERBOOK_DEPTH = 100  # price levels per side to request for the impact walk


def _float(value: object | None) -> float | None:
    try:
        if value is None:
            return None
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _walk_side(levels: list[tuple[float, float]], bucket_usd: float) -> tuple[float, float] | None:
    """VWAP-walk one book side for `bucket_usd` of notional.

    `levels` must be ordered best-first (asks ascending, bids descending).
    Returns (vwap, reachable_usd) where reachable_usd <= bucket_usd on a thin
    book, or None for an empty side.
    """
    if not levels:
        return None
    remaining = bucket_usd
    cost = 0.0  # sum of price * base_qty actually consumed
    filled = 0.0  # base qty consumed
    for price, qty in levels:
        level_notional = price * qty
        take_notional = min(remaining, level_notional)
        cost += take_notional
        filled += take_notional / price
        remaining -= take_notional
        if remaining <= 0:
            break
    if filled == 0.0:
        return None
    return cost / filled, bucket_usd - max(remaining, 0.0)


def _impact_from_book(
    asks: list[tuple[float, float]], bids: list[tuple[float, float]], mid: float
) -> dict[str, float | None]:
    """Mid-referenced impact (bps) + reachable depth (USD) per notional bucket,
    averaged across the buy (ask-walk) and sell (bid-walk) sides; depth is the
    conservative min of the two sides -- the same semantics the scoring engine
    expects from every other venue (see docs/scoring.md)."""
    out: dict[str, float | None] = {}
    for bucket in _IMPACT_BUCKETS_USD:
        label = f"{int(bucket / 1000)}k"
        ask_walk = _walk_side(asks, bucket)
        bid_walk = _walk_side(bids, bucket)
        if ask_walk is None or bid_walk is None or mid <= 0:
            out[f"impact_bps_{label}"] = None
            out[f"depth_usd_{label}"] = None
            continue
        ask_vwap, ask_reach = ask_walk
        bid_vwap, bid_reach = bid_walk
        out[f"impact_bps_{label}"] = (
            (ask_vwap - mid) / mid * 10_000.0 + (mid - bid_vwap) / mid * 10_000.0
        ) / 2.0
        out[f"depth_usd_{label}"] = min(ask_reach, bid_reach)
    return out


def parse_levels(side: object) -> list[tuple[float, float]]:
    """`[[price, qty], ...]`, skipping anything unparseable.

    Kept defensive on purpose: a market with no resting orders must read as no
    liquidity, never as a crash inside the collector's batch.
    """
    if not isinstance(side, list):
        return []
    levels: list[tuple[float, float]] = []
    for level in side:
        if not isinstance(level, (list, tuple)) or len(level) < 2:
            continue
        price, qty = _float(level[0]), _float(level[1])
        if price is None or qty is None or price <= 0 or qty <= 0:
            continue
        levels.append((price, qty))
    return levels


def canonical_symbol(base_currency: str, ticker_id: str) -> str:
    """The cross-venue key for a Nado market.

    Nado names a perp `BTC-PERP_USDT0` and reports `base_currency` as `BTC-PERP`
    on /contracts but plain `BTC` on /tickers, so neither field can be trusted
    alone. The canonical form strips both the `-PERP` suffix and the quote, so
    a Nado market matches the same instrument on every other venue -- which is
    the whole point of the cross-protocol comparison.
    """
    base = base_currency or ticker_id.split("_")[0]
    return base.removesuffix("-PERP").upper()


class NadoAdapter(VenueAdapter):
    slug = "nado"

    def __init__(self) -> None:
        self._contracts: dict[str, Mapping[str, object]] | None = None

    def _get_contracts(self) -> dict[str, Mapping[str, object]]:
        """One cached call per instance: /contracts answers for every market at
        once, so per-symbol lookups must not each hit the network."""
        if self._contracts is None:
            response = httpx.get(CONTRACTS_URL, timeout=25, headers={"Accept": "application/json"})
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("nado: /archive/v2/contracts did not return an object")
            self._contracts = {
                ticker: contract
                for ticker, contract in payload.items()
                if isinstance(contract, Mapping)
            }
        return self._contracts

    def _contract(self, symbol: str) -> Mapping[str, object]:
        contract = self._get_contracts().get(symbol)
        if contract is None:
            raise MarketUnavailable(f"nado: no current contract data for {symbol}")
        return contract

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for ticker_id, contract in self._get_contracts().items():
            # Nado runs spot and margin lending on the same engine. Only
            # perpetuals are comparable with the rest of the table, and the
            # venue labels them itself rather than leaving it to the suffix.
            if contract.get("product_type") != "perpetual":
                continue
            base = contract.get("base_currency")
            canonical = canonical_symbol(base if isinstance(base, str) else "", ticker_id)
            # A listing with no mark price is catalogued but not quotable.
            mark = _float(contract.get("mark_price"))
            markets.append(
                MarketInfo(
                    symbol=ticker_id,
                    symbol_canonical=canonical,
                    base_asset=canonical,
                    is_active=mark is not None and mark > 0,
                    # Nado publishes no instrument class of its own. Not
                    # invented here: classification for venues that state none
                    # lives in the site's curated map (web/lib/tradfi.ts).
                    asset_class=None,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        contract = self._contract(symbol)
        daily = _float(contract.get("funding_rate"))
        if daily is None:
            raise MarketUnavailable(f"nado: funding unavailable for {symbol}")
        # Quoted daily, settled hourly -- see the module docstring. The stored
        # raw figure is the rate for ONE interval, so a column of raw rates
        # means the same thing whatever cadence each venue settles on.
        return FundingData(
            funding_rate_raw=daily / _HOURS_PER_DAY,
            interval_hours=_FUNDING_INTERVAL_HOURS,
            funding_rate_annualized=daily * _DAYS_PER_YEAR,
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        response = httpx.get(
            ORDERBOOK_URL,
            params={"ticker_id": symbol, "depth": _ORDERBOOK_DEPTH},
            timeout=25,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, Mapping):
            raise MarketUnavailable(f"nado: orderbook unavailable for {symbol}")
        asks = parse_levels(payload.get("asks"))
        bids = parse_levels(payload.get("bids"))
        if not asks or not bids:
            raise MarketUnavailable(f"nado: one-sided or empty book for {symbol}")
        best_ask, best_bid = asks[0][0], bids[0][0]
        mid = (best_ask + best_bid) / 2.0
        if mid <= 0:
            raise MarketUnavailable(f"nado: non-positive mid for {symbol}")
        impact = _impact_from_book(asks, bids, mid)
        return OrderbookTop(
            best_bid=best_bid,
            best_ask=best_ask,
            spread_bps=(best_ask - best_bid) / mid * 10_000.0,
            impact_bps_10k=impact["impact_bps_10k"],
            impact_bps_50k=impact["impact_bps_50k"],
            impact_bps_100k=impact["impact_bps_100k"],
            depth_usd_10k=impact["depth_usd_10k"],
            depth_usd_50k=impact["depth_usd_50k"],
            depth_usd_100k=impact["depth_usd_100k"],
        )

    def get_volume(self, symbol: str) -> VolumeData:
        contract = self._contract(symbol)
        # `quote_volume` is already quote-currency (USDT0 ~ USD) turnover, and
        # `open_interest_usd` is the venue's own USD conversion. Both are taken
        # as published rather than recomputed from `base_volume` x price, which
        # would disagree with the venue's own interface.
        return VolumeData(
            volume_24h_usd=_float(contract.get("quote_volume")),
            open_interest_usd=_float(contract.get("open_interest_usd")),
        )

    def get_fees(self) -> FeeData:
        # Base tier. See the module docstring for why this is a constant and
        # not a read: the tier table is published as an image.
        return FeeData(maker_bps=0.0, taker_bps=3.5, source_url=FEE_SOURCE_URL)
