"""TxFlow public market-data adapter.

TxFlow's documentation labels its Platform API as coming soon, but the live
trading application exposes the read-only ``/info`` endpoint used by its own
market screens.  This adapter uses only those unauthenticated requests:

* ``perpMeta`` for the listed market catalog;
* ``marketTicker`` for funding, 24-hour notional volume and OI;
* ``l2Book`` for the public CLOB depth.

The native L2 levels let PerpFarm record an actual VWAP walk, rather than
guessing execution cost from the displayed spread.
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

INFO_URL = "https://api.txflow.com/info"
FEE_SOURCE_URL = "https://docs.txflow.com/perp/trading-fees"
_HOURS_PER_YEAR = 8760.0
# Geometric ladder, ~2-2.5x between neighbours. Interpolation error scales with
# the RATIO of adjacent points, not their dollar gap, so even spacing would
# waste points up top and still leave a wide hole at the bottom. Measured on
# production curves, the old 1k/10k/50k/100k ladder was off by up to 1.6 bps in
# the middle of its widest span; these sizes close that. The book is already in
# memory, so extra points cost one more walk each, not another request.
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
    """Walk one side of a CLOB until ``notional_usd`` is filled.

    Returns the execution VWAP and the actually consumed USD notional.  A
    partial book must never masquerade as a fillable target, hence ``None``
    when the requested size cannot be reached.
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


class TxflowAdapter(VenueAdapter):
    slug = "txflow"

    def __init__(self) -> None:
        self._markets_by_symbol: dict[str, Mapping[str, object]] | None = None
        self._tickers: dict[str, Mapping[str, object]] = {}

    def _post(self, payload: Mapping[str, object]) -> Mapping[str, object]:
        response = httpx.post(INFO_URL, json=payload, timeout=25, headers={"Accept": "application/json"})
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, Mapping) or isinstance(data.get("message"), str):
            raise ValueError(f"txflow: invalid /info response for {payload.get('type')}")
        return data

    def _markets(self) -> dict[str, Mapping[str, object]]:
        if self._markets_by_symbol is None:
            payload = self._post({"type": "perpMeta", "dex": ""})
            universe = payload.get("universe")
            if not isinstance(universe, list):
                raise ValueError("txflow: perpMeta returned no universe")
            self._markets_by_symbol = {
                symbol: row
                for row in universe
                if isinstance(row, Mapping)
                and isinstance((symbol := row.get("name")), str)
                and symbol
            }
        return self._markets_by_symbol

    def _market(self, symbol: str) -> Mapping[str, object]:
        market = self._markets().get(symbol)
        if market is None:
            raise MarketUnavailable(f"txflow: unknown market {symbol}")
        return market

    def _ticker(self, symbol: str) -> Mapping[str, object]:
        if symbol not in self._tickers:
            market = self._market(symbol)
            instrument_id = market.get("index")
            if not isinstance(instrument_id, int):
                raise MarketUnavailable(f"txflow: missing instrument id for {symbol}")
            self._tickers[symbol] = self._post({"type": "marketTicker", "instrumentId": instrument_id})
        return self._tickers[symbol]

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for symbol, row in self._markets().items():
            base_asset = row.get("baseCurrency")
            if not isinstance(base_asset, str) or not base_asset:
                continue
            halted = row.get("haltTrading") is True
            delisted = row.get("delisted") is True
            markets.append(
                MarketInfo(
                    symbol=symbol,
                    symbol_canonical=base_asset,
                    base_asset=base_asset,
                    is_active=not halted and not delisted,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """Convert TxFlow's per-interval funding into this app's schema.

        ``fundingRate`` is quoted in PERCENT per settlement interval, not as a
        fraction: BTC reads ``0.00247934`` on an hourly interval, i.e. 0.0025%
        per hour (~22% annualized), and the venue's own ``rateCap`` of ``0.03``
        is a 0.03%/h ceiling. Reading it as a fraction inflates every rate a
        hundredfold, which our schema then carries as ``funding_rate_annualized``
        — a FRACTION everywhere else (Variational stores 0.1095 for 10.95%).
        """
        ticker = self._ticker(symbol)
        raw_percent = _float(ticker.get("fundingRate"))
        interval_ms = _float(ticker.get("settlementIntervalMs"))
        if raw_percent is None or interval_ms is None or interval_ms <= 0:
            raise MarketUnavailable(f"txflow: funding unavailable for {symbol}")
        interval_hours = interval_ms / 3_600_000.0
        rate_per_interval = raw_percent / 100.0
        return FundingData(
            funding_rate_raw=rate_per_interval,
            interval_hours=interval_hours,
            funding_rate_annualized=rate_per_interval * (_HOURS_PER_YEAR / interval_hours),
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        market = self._market(symbol)
        instrument_id = market.get("index")
        if not isinstance(instrument_id, int):
            raise MarketUnavailable(f"txflow: missing instrument id for {symbol}")
        payload = self._post({"type": "l2Book", "coin": str(instrument_id)})
        raw_sides = payload.get("levels")
        if not isinstance(raw_sides, Sequence) or len(raw_sides) < 2:
            raise MarketUnavailable(f"txflow: book unavailable for {symbol}")

        bids = _parse_levels(raw_sides[0])
        asks = _parse_levels(raw_sides[1])
        if not bids or not asks:
            raise MarketUnavailable(f"txflow: empty book for {symbol}")
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
        ticker = self._ticker(symbol)
        price = _float(ticker.get("markPx"))
        open_interest_base = _float(ticker.get("openInterest"))
        return VolumeData(
            volume_24h_usd=_float(ticker.get("dayNtlVlm")),
            open_interest_usd=(price * open_interest_base) if price is not None and open_interest_base is not None else None,
        )

    def get_fees(self) -> FeeData:
        # TxFlow's public VIP 0 schedule is 0.0150% maker / 0.0450% taker.
        # Signing up through a referral takes 5% off, which is what a new
        # account actually pays, so that is what routes are priced at. Higher
        # VIP tiers pay less, making this the conservative end of the range.
        return FeeData(maker_bps=1.5 * 0.95, taker_bps=4.5 * 0.95, source_url=FEE_SOURCE_URL)
