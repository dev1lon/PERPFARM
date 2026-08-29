"""Entropy public market-data adapter.

Entropy (entropy.io) trades perpetuals on private-market assets -- Anthropic,
Sandisk, Nebius today. Its own listing endpoint, `entropy.io/api/markets`,
shows SIX venues at once: `default` is Hyperliquid's main perp dex, and `xyz`,
`para`, `mkts`, `hyna` belong to other builders. Only `io` ("EntropyIO") is
Entropy's, and that is the only one collected here -- publishing Hyperliquid's
177 markets under Entropy's name would be another protocol's data wearing this
one's label.

The dex is deployed on Hyperliquid (HIP-3), so its public market data comes
from Hyperliquid's own unauthenticated `/info` endpoint:

* ``metaAndAssetCtxs`` with ``dex: "io"`` for the catalog, funding, open
  interest and 24-hour notional volume;
* ``l2Book`` for the public CLOB depth, which gives a real VWAP walk rather
  than a guess from the displayed spread.

TODO(verify): the fee schedule. A HIP-3 dex pays Hyperliquid's base fees plus
whatever the deployer adds, and Entropy's docs sit behind Cloudflare. Until
someone reads it off the venue, `get_fees` raises -- so PerpFarm collects the
market data but prices no Entropy route, which is the honest order to do it in.
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
    VolumeData,
)

INFO_URL = "https://api.hyperliquid.xyz/info"
#: Entropy's own HIP-3 dex. Every symbol it lists carries it as a prefix.
ENTROPY_DEX = "io"
_HOURS_PER_YEAR = 8760.0
#: Hyperliquid settles funding every hour.
_FUNDING_INTERVAL_HOURS = 1.0
#: Same ladder as the other CLOB adapters: geometric, because interpolation
#: error scales with the ratio between neighbouring points, not their gap.
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

    Returns None when the book cannot reach that size: a partial fill must
    never be recorded as if the whole order had gone through at that price.
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
    """`io:ANTH` -> `ANTH`.

    The prefix is the dex, not the instrument. Stripping it is what lets NBIS
    here match NBIS on Variational -- a cross-venue route cannot be found
    between two spellings of the same asset.
    """

    _, _, base = symbol.partition(":")
    return (base or symbol).upper()


class EntropyAdapter(VenueAdapter):
    slug = "entropy"

    def __init__(self) -> None:
        self._contexts: dict[str, tuple[Mapping[str, object], Mapping[str, object]]] | None = None

    def _post(self, payload: Mapping[str, object]) -> object:
        response = httpx.post(INFO_URL, json=payload, timeout=25, headers={"Accept": "application/json"})
        response.raise_for_status()
        return response.json()

    def _all(self) -> dict[str, tuple[Mapping[str, object], Mapping[str, object]]]:
        """Every listed market with its live context, fetched once per instance.

        One request answers the catalog, funding, volume and open interest for
        the whole dex, so a run costs one call plus one book per market.
        """

        if self._contexts is None:
            payload = self._post({"type": "metaAndAssetCtxs", "dex": ENTROPY_DEX})
            if not isinstance(payload, Sequence) or len(payload) < 2:
                raise ValueError("entropy: metaAndAssetCtxs returned an unexpected shape")
            meta, contexts = payload[0], payload[1]
            universe = meta.get("universe") if isinstance(meta, Mapping) else None
            if not isinstance(universe, list) or not isinstance(contexts, list):
                raise ValueError("entropy: metaAndAssetCtxs returned no universe")
            paired: dict[str, tuple[Mapping[str, object], Mapping[str, object]]] = {}
            for market, context in zip(universe, contexts):
                if not isinstance(market, Mapping) or not isinstance(context, Mapping):
                    continue
                symbol = market.get("name")
                if isinstance(symbol, str) and symbol:
                    paired[symbol] = (market, context)
            self._contexts = paired
        return self._contexts

    def _context(self, symbol: str) -> tuple[Mapping[str, object], Mapping[str, object]]:
        pair = self._all().get(symbol)
        if pair is None:
            raise MarketUnavailable(f"entropy: unknown market {symbol}")
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
                    # stops being collected and stops being routed to.
                    is_active=market.get("isDelisted") is not True,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """Hyperliquid quotes funding as a FRACTION per hour.

        `0.0000129219` on NBIS is 0.0013% an hour, ~11.3% annualized -- not a
        percent figure like TxFlow's, and reading it as one would divide every
        Entropy rate by a hundred.
        """

        _market, context = self._context(symbol)
        rate_per_hour = _float(context.get("funding"))
        if rate_per_hour is None:
            raise MarketUnavailable(f"entropy: funding unavailable for {symbol}")
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
            raise MarketUnavailable(f"entropy: book unavailable for {symbol}")

        bids = _parse_levels(raw_sides[0])
        asks = _parse_levels(raw_sides[1])
        if not bids or not asks:
            raise MarketUnavailable(f"entropy: empty book for {symbol}")
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
        """24h notional volume, and open interest converted to USD.

        `openInterest` is in BASE units (2,439.9 contracts of ANTH), so it is
        multiplied by the mark price -- storing the raw figure would show a
        $4.7M market as 2.4K.
        """

        _market, context = self._context(symbol)
        price = _float(context.get("markPx"))
        open_interest_base = _float(context.get("openInterest"))
        return VolumeData(
            volume_24h_usd=_float(context.get("dayNtlVlm")),
            open_interest_usd=(
                price * open_interest_base if price is not None and open_interest_base is not None else None
            ),
        )

    def get_fees(self) -> FeeData:
        raise NotImplementedError(
            "TODO(verify): Entropy's fee schedule. A HIP-3 dex pays Hyperliquid's "
            "base maker/taker plus the deployer's own share, and docs.entropy.io "
            "is not reachable from a non-browser client."
        )
