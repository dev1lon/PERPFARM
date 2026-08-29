"""Polymarket Perps public market-data adapter.

Polymarket's perpetuals are a separate exchange from its prediction markets,
with its own unauthenticated REST API (docs.polymarket.com/perps):

* ``/v1/info/instruments`` -- the catalog: symbol, base asset, funding interval;
* ``/v1/info/tickers`` -- mark/index/mid price, open interest and the current
  funding rate for every instrument in one request;
* ``/v1/info/book?instrument_id=N`` -- the public book, for a real VWAP walk;
* ``/v1/info/klines`` -- hourly candles, which is the ONLY place 24h volume is
  published: no ticker field carries it.

Unlike Entropy and RiseX, Polymarket documents a plain venue-wide fee schedule,
so its routes can be priced as soon as its data has been collected.
"""

from __future__ import annotations

import time
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

API_BASE = "https://api.perpetuals.polymarket.com/v1/info"
FEE_SOURCE_URL = "https://docs.polymarket.com/perps/learn-about-trading/fees"
_HOURS_PER_YEAR = 8760.0
_VOLUME_WINDOW_HOURS = 24
_MS_PER_HOUR = 3_600_000
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
#: The funding intervals this venue publishes, as hours.
_FUNDING_INTERVAL_HOURS = {"1h": 1.0, "8h": 8.0}


def _float(value: object | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric == numeric else None


def _vwap(levels: Sequence[tuple[float, float]], notional_usd: float) -> tuple[float, float] | None:
    """Walk one side of the book until `notional_usd` is filled, or give up."""

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
        if not isinstance(row, Sequence) or isinstance(row, (str, bytes)) or len(row) < 2:
            continue
        price = _float(row[0])
        size = _float(row[1])
        if price is not None and size is not None and price > 0 and size > 0:
            levels.append((price, size))
    return levels


def notional_from_candles(candles: object) -> float | None:
    """Sum `base volume x close` over the hourly candles of the last day.

    Polymarket publishes volume in BASE units per candle, so the dollar figure
    has to be built here. No candles at all returns None rather than 0 -- a
    market we could not read is unknown, not idle.
    """

    if not isinstance(candles, Sequence) or isinstance(candles, (str, bytes)):
        return None
    total = 0.0
    counted = 0
    for row in candles:
        if not isinstance(row, Sequence) or isinstance(row, (str, bytes)) or len(row) < 6:
            continue
        close = _float(row[4])
        base_volume = _float(row[5])
        if close is None or base_volume is None:
            continue
        total += close * base_volume
        counted += 1
    return total if counted else None


class PolymarketAdapter(VenueAdapter):
    slug = "polymarket"

    def __init__(self) -> None:
        self._instruments: dict[str, Mapping[str, object]] | None = None
        self._tickers: dict[str, Mapping[str, object]] | None = None

    def _get(self, path: str, params: Mapping[str, object] | None = None) -> object:
        response = httpx.get(
            f"{API_BASE}{path}", params=params, timeout=30, headers={"Accept": "application/json"}
        )
        response.raise_for_status()
        return response.json()

    def _all(self) -> dict[str, Mapping[str, object]]:
        if self._instruments is None:
            rows = self._get("/instruments")
            if not isinstance(rows, list):
                raise ValueError("polymarket: /instruments returned no list")
            self._instruments = {
                symbol: row
                for row in rows
                if isinstance(row, Mapping)
                and isinstance((symbol := row.get("symbol")), str)
                and symbol
            }
        return self._instruments

    def _ticker(self, symbol: str) -> Mapping[str, object]:
        """The live figures for one symbol, from one request for all of them."""

        if self._tickers is None:
            rows = self._get("/tickers")
            if not isinstance(rows, list):
                raise ValueError("polymarket: /tickers returned no list")
            self._tickers = {
                ticker_symbol: row
                for row in rows
                if isinstance(row, Mapping)
                and isinstance((ticker_symbol := row.get("symbol")), str)
                and ticker_symbol
            }
        ticker = self._tickers.get(symbol)
        if ticker is None:
            raise MarketUnavailable(f"polymarket: no ticker for {symbol}")
        return ticker

    def _instrument(self, symbol: str) -> Mapping[str, object]:
        instrument = self._all().get(symbol)
        if instrument is None:
            raise MarketUnavailable(f"polymarket: unknown market {symbol}")
        return instrument

    def _instrument_id(self, symbol: str) -> str:
        instrument_id = self._instrument(symbol).get("instrument_id")
        if not isinstance(instrument_id, (str, int)):
            raise MarketUnavailable(f"polymarket: missing instrument id for {symbol}")
        return str(instrument_id)

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for symbol, row in self._all().items():
            base_asset = row.get("base_asset")
            if not isinstance(base_asset, str) or not base_asset:
                continue
            if row.get("instrument_type") not in (None, "perpetual"):
                continue
            markets.append(
                MarketInfo(
                    symbol=symbol,
                    symbol_canonical=base_asset.upper(),
                    base_asset=base_asset.upper(),
                    is_active=True,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """`funding_rate` is a fraction per the instrument's funding interval.

        The interval is published per instrument ("1h"), so it is read rather
        than assumed -- a rate quoted hourly and annualized as if it were
        eight-hourly is off by a factor of eight.
        """

        instrument = self._instrument(symbol)
        ticker = self._ticker(symbol)
        rate = _float(ticker.get("funding_rate"))
        interval = instrument.get("funding_interval")
        interval_hours = _FUNDING_INTERVAL_HOURS.get(interval) if isinstance(interval, str) else None
        if rate is None or interval_hours is None:
            raise MarketUnavailable(f"polymarket: funding unavailable for {symbol}")
        return FundingData(
            funding_rate_raw=rate,
            interval_hours=interval_hours,
            funding_rate_annualized=rate * (_HOURS_PER_YEAR / interval_hours),
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        payload = self._get("/book", {"instrument_id": self._instrument_id(symbol)})
        if not isinstance(payload, Mapping):
            raise MarketUnavailable(f"polymarket: book unavailable for {symbol}")

        bids = _parse_levels(payload.get("bids"))
        asks = _parse_levels(payload.get("asks"))
        if not bids or not asks:
            raise MarketUnavailable(f"polymarket: empty book for {symbol}")
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
        """Open interest from the ticker; 24h volume summed from the candles.

        `open_interest` is in BASE units, so it is multiplied by the mark price.
        Volume has no ticker field at all on this venue -- the hourly candles
        are where it is published, and their timestamps are milliseconds.
        """

        ticker = self._ticker(symbol)
        price = _float(ticker.get("mark_price")) or _float(ticker.get("mid_price"))
        open_interest_base = _float(ticker.get("open_interest"))

        end_ms = int(time.time() * 1000)
        start_ms = end_ms - _VOLUME_WINDOW_HOURS * _MS_PER_HOUR
        try:
            candles = self._get(
                "/klines",
                {
                    "instrument_id": self._instrument_id(symbol),
                    "interval": "1h",
                    "start_timestamp": start_ms,
                    "end_timestamp": end_ms,
                },
            )
        except Exception:  # noqa: BLE001 -- volume is optional; OI still counts
            candles = None
        rows = candles.get("data") if isinstance(candles, Mapping) else candles

        return VolumeData(
            volume_24h_usd=notional_from_candles(rows),
            open_interest_usd=(
                price * open_interest_base if price is not None and open_interest_base is not None else None
            ),
        )

    def get_fees(self) -> FeeData:
        # Entry tier of the published schedule (docs.polymarket.com/perps,
        # "Fees"): 0.0400% taker, 0.0125% maker for an account under $1M of
        # trailing 30-day volume. Higher tiers pay less, so pricing at this one
        # is the conservative end for a new farmer.
        return FeeData(maker_bps=1.25, taker_bps=4.0, source_url=FEE_SOURCE_URL)
