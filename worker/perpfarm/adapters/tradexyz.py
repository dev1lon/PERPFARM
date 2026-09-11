"""trade.xyz public market-data adapter.

trade[XYZ] (docs.trade.xyz) deploys perpetuals on Hyperliquid through HIP-3:
stocks, equity indices, commodities, currencies and pre-IPO names, margined and
settled in USDC. Its dex is `xyz` in Hyperliquid's own `perpDexs` list, and
every symbol it lists carries that prefix (`xyz:TSLA`). Verified live against
api.hyperliquid.xyz on 2026-09-10:

* ``metaAndAssetCtxs`` with ``dex: "xyz"`` answers the catalog, funding, open
  interest and 24-hour notional volume for all 120 markets in one call;
* ``l2Book`` gives the public CLOB depth, so impact is a real VWAP walk;
* ``fundingHistory`` on xyz:TSLA and xyz:GOLD showed one entry per hour, so
  funding settles hourly, quoted as a FRACTION per hour -- the same convention
  as Entropy's `io` dex.

Fees are the one thing that differs per MARKET here. trade.xyz publishes two
schedules (docs.trade.xyz/perpetuals/mechanics, "Trading Fees"): Standard Mode
at 0.030% maker / 0.090% taker, and Growth Mode at a tenth of that, 0.0030% /
0.0090%, "only available on certain assets". The docs do not list which, but
Hyperliquid's meta states it per market (`growthMode: "enabled"`) -- 113 of 120
on the day this was written. So a market in growth mode is stored with
``asset_class = GROWTH_MODE_CLASS``: `markets.asset_class` is the per-market
field the site already prices by (see web/lib/venue-fees.ts), and pricing every
xyz market at the standard rate would overstate most of them tenfold.

That field carries no instrument class for this venue -- trade.xyz publishes
none -- so the site classifies xyz markets from its curated map
(web/lib/tradfi.ts), exactly as for any venue whose feed states no class.

Crypto is the other half of what trade.xyz's interface trades, and it is NOT on
the xyz dex: BTC, ETH and the rest are Hyperliquid's own core perps, the same
`metaAndAssetCtxs` call without a `dex` (bare names, no prefix). They are
collected here too, stored with ``asset_class = CORE_CRYPTO_CLASS`` so the site
prices them at Hyperliquid's core schedule, tier 0: 0.015% maker / 0.045%
taker (docs.hyperliquid.xyz, "Fees") -- half the HIP-3 rate the xyz markets
pay. Two things stay out on purpose: a delisted core market (it never traded
under this venue here, so it gets no row at all), and core volume in the venue
totals -- that is Hyperliquid's activity, not trade.xyz's.

Not confirmed, and so not claimed: a points programme, and whether trade.xyz's
interface adds a builder fee on core crypto (it publishes none).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import httpx

from perpfarm.adapters.base import (
    FeeData,
    FundingData,
    MarketInfo,
    MarketUnavailable,
    OrderbookTop,
    QuoteCurve,
    QuoteCurvePoint,
    VenueAdapter,
    VenueTotals,
    VolumeData,
)

INFO_URL = "https://api.hyperliquid.xyz/info"
FEE_SOURCE_URL = "https://docs.trade.xyz/perpetuals/mechanics"
#: trade.xyz's HIP-3 dex on Hyperliquid.
XYZ_DEX = "xyz"
#: Stored as `asset_class` on a market Hyperliquid reports in growth mode, so
#: the site prices it at the Growth Mode schedule. Keep in lockstep with
#: ASSET_CLASS_FEES in web/lib/venue-fees.ts and jobs/hedge_recommendations.py.
GROWTH_MODE_CLASS = "GROWTH_MODE"
#: Stored as `asset_class` on a Hyperliquid core crypto perp, priced at the
#: core schedule. Also a class the site reads as crypto (web/lib/tradfi.ts).
CORE_CRYPTO_CLASS = "CRYPTO"
_HOURS_PER_YEAR = 8760.0
#: Hyperliquid settles funding every hour (checked on the xyz dex itself).
_FUNDING_INTERVAL_HOURS = 1.0
#: Same geometric ladder as the other CLOB adapters.
_QUOTE_BUCKETS = (
    500.0,
    1_000.0,
    2_500.0,
    5_000.0,
    10_000.0,
    25_000.0,
    50_000.0,
    100_000.0,
)


def _float(value: object | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric == numeric else None


def _vwap(levels: Sequence[tuple[float, float]], notional_usd: float) -> tuple[float, float] | None:
    """Walk one side of the book until `notional_usd` is filled.

    None when the book cannot reach that size: a partial fill must never be
    recorded as if the whole order had gone through at that price.
    """

    remaining = notional_usd
    spent = 0.0
    quantity = 0.0
    for price, size in levels:
        level_notional = price * size
        take_notional = min(remaining, level_notional)
        if take_notional <= 0:
            continue
        spent += take_notional
        quantity += take_notional / price
        remaining -= take_notional
        if remaining <= 1e-6:
            return spent / quantity, spent
    return None


def _parse_levels(raw_levels: object) -> list[tuple[float, float]]:
    if not isinstance(raw_levels, Sequence) or isinstance(raw_levels, (str, bytes)):
        return []
    levels: list[tuple[float, float]] = []
    for row in raw_levels:
        if not isinstance(row, Mapping):
            continue
        price = _float(row.get("px"))
        size = _float(row.get("sz"))
        if price is not None and size is not None and price > 0 and size > 0:
            levels.append((price, size))
    return levels


def canonical_symbol(symbol: str) -> str:
    """`xyz:TSLA` -> `TSLA`. The prefix is the dex, not the instrument."""

    _, _, base = symbol.partition(":")
    return (base or symbol).upper()


def is_core_market(symbol: str) -> bool:
    """Hyperliquid's own perps carry no dex prefix; every xyz market does."""

    return ":" not in symbol


class TradexyzAdapter(VenueAdapter):
    slug = "tradexyz"

    def __init__(self) -> None:
        self._contexts: dict[str, tuple[Mapping[str, object], Mapping[str, object]]] | None = None

    def _post(self, payload: Mapping[str, object]) -> object:
        response = httpx.post(INFO_URL, json=payload, timeout=25, headers={"Accept": "application/json"})
        response.raise_for_status()
        return response.json()

    def _dex(self, dex: str | None) -> list[tuple[Mapping[str, object], Mapping[str, object]]]:
        """One dex's markets with their live contexts; `None` is Hyperliquid's core."""

        request: dict[str, object] = {"type": "metaAndAssetCtxs"}
        if dex is not None:
            request["dex"] = dex
        name = dex or "core"
        payload = self._post(request)
        if not isinstance(payload, Sequence) or len(payload) < 2:
            raise ValueError(f"tradexyz: metaAndAssetCtxs ({name}) returned an unexpected shape")
        meta, contexts = payload[0], payload[1]
        universe = meta.get("universe") if isinstance(meta, Mapping) else None
        if not isinstance(universe, list) or not isinstance(contexts, list):
            raise ValueError(f"tradexyz: metaAndAssetCtxs ({name}) returned no universe")
        return [
            (market, context)
            for market, context in zip(universe, contexts)
            if isinstance(market, Mapping) and isinstance(context, Mapping)
        ]

    def _all(self) -> dict[str, tuple[Mapping[str, object], Mapping[str, object]]]:
        """Every listed market with its live context, fetched once per instance.

        Both calls or neither: a run that listed the xyz markets alone would
        retire every crypto market for the hour (sync_markets deactivates what a
        venue stops listing), so a failed core call fails the run instead.
        """

        if self._contexts is None:
            paired: dict[str, tuple[Mapping[str, object], Mapping[str, object]]] = {}
            for market, context in self._dex(XYZ_DEX):
                symbol = market.get("name")
                if isinstance(symbol, str) and symbol:
                    paired[symbol] = (market, context)
            for market, context in self._dex(None):
                symbol = market.get("name")
                # A delisted core market never traded under this venue here, so
                # it gets no row at all (module docstring).
                if isinstance(symbol, str) and symbol and market.get("isDelisted") is not True:
                    paired.setdefault(symbol, (market, context))
            self._contexts = paired
        return self._contexts

    def _context(self, symbol: str) -> tuple[Mapping[str, object], Mapping[str, object]]:
        pair = self._all().get(symbol)
        if pair is None:
            raise MarketUnavailable(f"tradexyz: unknown market {symbol}")
        return pair

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for symbol, (market, _context) in self._all().items():
            base_asset = canonical_symbol(symbol)
            if not base_asset:
                continue
            markets.append(
                MarketInfo(
                    symbol=symbol,
                    symbol_canonical=base_asset,
                    base_asset=base_asset,
                    # A delisted market keeps its row and its history; it just
                    # stops being collected and routed to.
                    is_active=market.get("isDelisted") is not True,
                    # The fee schedule this market is charged -- see the
                    # module docstring. On the xyz dex that is a fee mode,
                    # not an instrument class; a core market is crypto.
                    asset_class=(
                        CORE_CRYPTO_CLASS
                        if is_core_market(symbol)
                        else GROWTH_MODE_CLASS
                        if market.get("growthMode") == "enabled"
                        else None
                    ),
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """A FRACTION per hour: `0.00000625` is 0.000625% an hour, ~5.5% a year."""

        _market, context = self._context(symbol)
        rate_per_hour = _float(context.get("funding"))
        if rate_per_hour is None:
            raise MarketUnavailable(f"tradexyz: funding unavailable for {symbol}")
        return FundingData(
            funding_rate_raw=rate_per_hour,
            interval_hours=_FUNDING_INTERVAL_HOURS,
            funding_rate_annualized=rate_per_hour * _HOURS_PER_YEAR,
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        self._context(symbol)  # an unknown symbol fails before any network call
        payload = self._post({"type": "l2Book", "coin": symbol})
        raw_sides = payload.get("levels") if isinstance(payload, Mapping) else None
        if not isinstance(raw_sides, Sequence) or len(raw_sides) < 2:
            raise MarketUnavailable(f"tradexyz: book unavailable for {symbol}")

        bids = _parse_levels(raw_sides[0])
        asks = _parse_levels(raw_sides[1])
        if not bids or not asks:
            raise MarketUnavailable(f"tradexyz: empty book for {symbol}")
        best_bid, best_ask = bids[0][0], asks[0][0]
        mid = (best_bid + best_ask) / 2.0
        spread_bps = (best_ask - best_bid) / mid * 10_000.0

        points = [QuoteCurvePoint(notional_usd=0.0, bid=best_bid, ask=best_ask)]
        for notional in _QUOTE_BUCKETS:
            sell = _vwap(bids, notional)
            buy = _vwap(asks, notional)
            if sell is None or buy is None:
                break
            points.append(QuoteCurvePoint(notional_usd=notional, bid=sell[0], ask=buy[0]))
        curve = QuoteCurve(reference_price=mid, points=tuple(points))

        def impact_at(notional: float) -> float | None:
            point = next((item for item in curve.points if item.notional_usd == notional), None)
            if point is None:
                return None
            buy_impact = max(point.ask - best_ask, 0.0) / mid * 10_000.0
            sell_impact = max(best_bid - point.bid, 0.0) / mid * 10_000.0
            return (buy_impact + sell_impact) / 2.0

        return OrderbookTop(
            best_bid=best_bid,
            best_ask=best_ask,
            spread_bps=spread_bps,
            impact_bps_10k=impact_at(10_000.0),
            impact_bps_50k=impact_at(50_000.0),
            impact_bps_100k=impact_at(100_000.0),
            depth_usd_10k=10_000.0 if impact_at(10_000.0) is not None else None,
            depth_usd_50k=50_000.0 if impact_at(50_000.0) is not None else None,
            depth_usd_100k=100_000.0 if impact_at(100_000.0) is not None else None,
            quote_curve=curve,
        )

    def get_volume(self, symbol: str) -> VolumeData:
        """24h notional volume, and open interest converted from base units to USD."""

        _market, context = self._context(symbol)
        price = _float(context.get("markPx"))
        open_interest_base = _float(context.get("openInterest"))
        return VolumeData(
            volume_24h_usd=_float(context.get("dayNtlVlm")),
            open_interest_usd=(
                price * open_interest_base if price is not None and open_interest_base is not None else None
            ),
        )

    def get_venue_totals(self) -> VenueTotals:
        """The xyz dex totalled from the call a run already makes.

        Hyperliquid publishes no aggregate for a HIP-3 dex, so this sums the
        venue's own per-market figures over every live market. Core crypto is
        left out: that volume is Hyperliquid's, whichever interface sent it, and
        counting it would print Hyperliquid's billions as trade.xyz's activity.
        """

        volume = 0.0
        open_interest = 0.0
        for symbol, (market, context) in self._all().items():
            if market.get("isDelisted") is True or is_core_market(symbol):
                continue
            market_volume = _float(context.get("dayNtlVlm"))
            if market_volume is not None:
                volume += market_volume
            price = _float(context.get("markPx"))
            size = _float(context.get("openInterest"))
            if price is not None and size is not None:
                open_interest += price * size
        return VenueTotals(volume_24h_usd=volume, open_interest_usd=open_interest)

    def get_fees(self) -> FeeData:
        """Standard Mode, tier 0: 0.030% maker, 0.090% taker.

        The venue-wide row is the standard schedule; a market in growth mode is
        priced at a tenth of it through its stored `asset_class` (module
        docstring). Volume tiers only take either lower, so tier 0 is the honest
        end to price a route at.
        """

        return FeeData(maker_bps=3.0, taker_bps=9.0, source_url=FEE_SOURCE_URL)
