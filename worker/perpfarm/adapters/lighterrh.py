"""Lighter on Robinhood Chain -- public market-data adapter.

Lighter runs a separate deployment on Robinhood Chain (chain id 466324) with its
own order books, markets and API, documented at apidocs.rh.lighter.xyz. Every
figure below was checked against the live API on 2026-09-11:

* ``orderBookDetails`` answers every market in one call: ``market_type``
  (``perp`` or ``spot`` -- only perps are collected), ``status``, ``mark_price``,
  ``daily_quote_token_volume`` in dollars, ``open_interest`` in BASE units, and
  each market's ``maker_fee`` / ``taker_fee``, which the docs state are "in
  percentage".
* ``orderBookOrders?market_id=&limit=`` returns resting ORDERS, not price
  levels, up to 250 per side (500 is refused). Orders at one price are summed
  into a level before the walk.
* Funding settles HOURLY: ``fundings?resolution=1h`` lists one entry per hour.
  ``funding-rates`` returns the current rate for every market in one call,
  beside Binance, Bybit and Hyperliquid rows, and quotes every row over EIGHT
  hours: its Hyperliquid BTC row read 0.0001 while Hyperliquid's own feed gave
  0.0000125 an hour, and its Lighter NVDA row read 0.000032 while ``fundings``
  showed NVDA at 0.0004 PERCENT an hour (0.000004 x 8). The per-hour fraction
  is therefore the row divided by eight.

Fees: a standard account -- the one a farmer opens by default -- pays 0% maker
and 0% taker (apidocs.rh.lighter.xyz/docs/account-types), which is also what
every market's own fee fields report. Premium accounts pay more for latency.

Rate limit: an unauthenticated IP gets 60 requests per rolling minute. A run
makes one ``orderBookDetails``, one ``funding-rates`` and one
``orderBookOrders`` per market (57 today), so book calls are spaced to stay
under it and a refused call is retried after a pause.

Not confirmed, and so not claimed: how Lighter's "RH live points" are awarded.
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
    VenueTotals,
    VolumeData,
)

API_URL = "https://api.rh.lighter.xyz/api/v1"
FEE_SOURCE_URL = "https://apidocs.rh.lighter.xyz/docs/account-types"
_HOURS_PER_YEAR = 8760.0
#: Funding settles every hour (one `fundings` entry per hour).
_FUNDING_INTERVAL_HOURS = 1.0
#: `funding-rates` quotes each rate over eight hours (module docstring).
_FUNDING_RATE_QUOTED_HOURS = 8.0
#: The most resting orders `orderBookOrders` returns per side.
_BOOK_ORDERS_LIMIT = 250
#: 60 requests per rolling minute for an unauthenticated IP. One book call every
#: 1.1 s is at most 55 a minute, leaving room for the two catalog calls.
_BOOK_CALL_SPACING_SECONDS = 1.1
#: Answers worth another try: the rate limit, or a gateway blip.
_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 3
#: Long enough for a rolling-minute window to shed requests.
_BACKOFF_SECONDS = 5.0
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
        numeric = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return numeric if numeric == numeric else None


def _levels(orders: object, *, descending: bool) -> list[tuple[float, float]]:
    """Resting orders summed into (price, size) levels, best price first."""

    if not isinstance(orders, Sequence) or isinstance(orders, (str, bytes)):
        return []
    by_price: dict[float, float] = {}
    for order in orders:
        if not isinstance(order, Mapping):
            continue
        price = _float(order.get("price"))
        size = _float(order.get("remaining_base_amount"))
        if price is not None and size is not None and price > 0 and size > 0:
            by_price[price] = by_price.get(price, 0.0) + size
    return sorted(by_price.items(), key=lambda level: level[0], reverse=descending)


def _vwap(levels: Sequence[tuple[float, float]], notional_usd: float) -> float | None:
    """Average fill price for `notional_usd` walked through `levels`.

    None when the book cannot reach that size: a partial fill must never be
    recorded as if the whole order had gone through at that price.
    """

    remaining = notional_usd
    spent = 0.0
    quantity = 0.0
    for price, size in levels:
        take = min(remaining, price * size)
        if take <= 0:
            continue
        spent += take
        quantity += take / price
        remaining -= take
        if remaining <= 1e-6:
            return spent / quantity
    return None


def _pct_to_bps(value: object) -> float | None:
    """`"0.0350"` percent -> 3.5 bps."""

    percent = _float(value)
    return None if percent is None else percent * 100.0


class LighterRhAdapter(VenueAdapter):
    slug = "lighterrh"

    def __init__(self) -> None:
        self._details: dict[str, Mapping[str, object]] | None = None
        self._rates: dict[str, float] | None = None
        self._last_book_call: float | None = None

    def _get(self, path: str, params: Mapping[str, object] | None = None) -> Mapping[str, object]:
        """One public REST call, retried briefly when refused."""

        for attempt in range(_MAX_ATTEMPTS):
            response = httpx.get(
                f"{API_URL}/{path}", params=dict(params or {}), timeout=25, headers={"Accept": "application/json"}
            )
            if response.status_code in _RETRY_STATUSES and attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_BACKOFF_SECONDS * (attempt + 1))
                continue
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, Mapping):
                raise ValueError(f"lighterrh: {path} returned {type(payload).__name__}, not an object")
            return payload
        raise AssertionError("unreachable: the last attempt always returns or raises")

    def _pace(self) -> None:
        """Space book calls so a whole run stays under the per-minute limit."""

        now = time.monotonic()
        if self._last_book_call is not None:
            wait = _BOOK_CALL_SPACING_SECONDS - (now - self._last_book_call)
            if wait > 0:
                time.sleep(wait)
        self._last_book_call = time.monotonic()

    def _perps(self) -> dict[str, Mapping[str, object]]:
        """Every perp market with its details, fetched once per instance."""

        if self._details is None:
            rows = self._get("orderBookDetails").get("order_book_details")
            if not isinstance(rows, list):
                raise ValueError("lighterrh: orderBookDetails returned no order_book_details")
            self._details = {
                str(row["symbol"]): row
                for row in rows
                if isinstance(row, Mapping) and row.get("market_type") == "perp" and row.get("symbol")
            }
        return self._details

    def _market(self, symbol: str) -> Mapping[str, object]:
        market = self._perps().get(symbol)
        if market is None:
            raise MarketUnavailable(f"lighterrh: unknown market {symbol}")
        return market

    def _lighter_rates(self) -> dict[str, float]:
        """Lighter's own rows from `funding-rates`, eight-hour fractions by symbol."""

        if self._rates is None:
            rows = self._get("funding-rates").get("funding_rates")
            if not isinstance(rows, list):
                raise ValueError("lighterrh: funding-rates returned no funding_rates")
            rates: dict[str, float] = {}
            for row in rows:
                if not isinstance(row, Mapping) or row.get("exchange") != "lighter":
                    continue
                rate = _float(row.get("rate"))
                if rate is not None and row.get("symbol"):
                    rates[str(row["symbol"])] = rate
            self._rates = rates
        return self._rates

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for symbol, market in self._perps().items():
            config = market.get("market_config")
            hidden = isinstance(config, Mapping) and config.get("hidden") is True
            markets.append(
                MarketInfo(
                    symbol=symbol,
                    symbol_canonical=symbol.upper(),
                    base_asset=symbol.upper(),
                    is_active=market.get("status") == "active" and not hidden,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        self._market(symbol)  # an unknown symbol fails before the rates are read
        quoted = self._lighter_rates().get(symbol)
        if quoted is None:
            raise MarketUnavailable(f"lighterrh: no funding rate for {symbol}")
        per_hour = quoted / _FUNDING_RATE_QUOTED_HOURS
        return FundingData(
            funding_rate_raw=per_hour,
            interval_hours=_FUNDING_INTERVAL_HOURS,
            funding_rate_annualized=per_hour * _HOURS_PER_YEAR,
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        market_id = self._market(symbol).get("market_id")
        if not isinstance(market_id, int):
            raise MarketUnavailable(f"lighterrh: {symbol} has no market id")
        self._pace()
        payload = self._get("orderBookOrders", {"market_id": market_id, "limit": _BOOK_ORDERS_LIMIT})
        bids = _levels(payload.get("bids"), descending=True)
        asks = _levels(payload.get("asks"), descending=False)
        if not bids or not asks:
            raise MarketUnavailable(f"lighterrh: empty book for {symbol}")

        best_bid, best_ask = bids[0][0], asks[0][0]
        mid = (best_bid + best_ask) / 2.0
        points = [QuoteCurvePoint(notional_usd=0.0, bid=best_bid, ask=best_ask)]
        for notional in _QUOTE_BUCKETS:
            sell = _vwap(bids, notional)
            buy = _vwap(asks, notional)
            if sell is None or buy is None:
                break
            points.append(QuoteCurvePoint(notional_usd=notional, bid=sell, ask=buy))
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
            spread_bps=(best_ask - best_bid) / mid * 10_000.0,
            impact_bps_10k=impact_at(10_000.0),
            impact_bps_50k=impact_at(50_000.0),
            impact_bps_100k=impact_at(100_000.0),
            depth_usd_10k=10_000.0 if impact_at(10_000.0) is not None else None,
            depth_usd_50k=50_000.0 if impact_at(50_000.0) is not None else None,
            depth_usd_100k=100_000.0 if impact_at(100_000.0) is not None else None,
            quote_curve=curve,
        )

    def get_volume(self, symbol: str) -> VolumeData:
        """24h volume in dollars, and open interest converted from base units."""

        market = self._market(symbol)
        mark = _float(market.get("mark_price"))
        open_interest = _float(market.get("open_interest"))
        return VolumeData(
            volume_24h_usd=_float(market.get("daily_quote_token_volume")),
            open_interest_usd=mark * open_interest if mark is not None and open_interest is not None else None,
        )

    def get_venue_totals(self) -> VenueTotals:
        """Perps only, summed from the one details call a run already makes.

        `exchangeStats` publishes a venue-wide 24h volume, but it counts the
        spot books too, and this site prices perp routes.
        """

        volume = 0.0
        open_interest = 0.0
        for market in self._perps().values():
            if market.get("status") != "active":
                continue
            market_volume = _float(market.get("daily_quote_token_volume"))
            if market_volume is not None:
                volume += market_volume
            mark = _float(market.get("mark_price"))
            size = _float(market.get("open_interest"))
            if mark is not None and size is not None:
                open_interest += mark * size
        return VenueTotals(volume_24h_usd=volume, open_interest_usd=open_interest)

    def get_fees(self) -> FeeData:
        """The dearest maker and taker any active perp reports -- 0 and 0 today.

        Each market states its own fee; the venue row takes the highest, so a
        market added with a fee is never priced as if it were free.
        """

        makers: list[float] = []
        takers: list[float] = []
        for market in self._perps().values():
            if market.get("status") != "active":
                continue
            maker = _pct_to_bps(market.get("maker_fee"))
            taker = _pct_to_bps(market.get("taker_fee"))
            if maker is not None:
                makers.append(maker)
            if taker is not None:
                takers.append(taker)
        if not makers or not takers:
            raise MarketUnavailable("lighterrh: no market reports its fees")
        return FeeData(maker_bps=max(makers), taker_bps=max(takers), source_url=FEE_SOURCE_URL)
