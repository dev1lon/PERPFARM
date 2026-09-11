"""Ondo Perps public market-data adapter.

Ondo Perps (app.ondoperps.xyz, docs.ondoperps.xyz) is a central limit order book
for stock, ETF, index, commodity, FX and crypto perpetuals. TrueNorth, the AI
trading agent, executes on it, which is why it is collected. Every figure below
was checked against the live, unauthenticated API on 2026-09-11:

* ``GET /v1/perps/contracts`` answers every contract in one call: ``market``
  (``NVDA-USD.P``), ``baseCurrency``, ``disabled``, ``usdVolume`` and
  ``openInterestUsd`` in dollars, ``fundingRate``, ``makerFee`` / ``takerFee``
  as fractions, and the venue's own class in ``tags`` (``Stock``, ``ETF``,
  ``Index``, ``Commodity``, ``FX``, ``Crypto``). Every answer is wrapped as
  ``{success, result}``.
* ``GET /v1/perps/depth?market=&depth=100`` gives the book as ``[price, size]``
  string pairs (a depth of 500 is refused).
* Funding settles HOURLY: ``funding_rate_history`` lists one entry per hour and
  ``nextFundingRateTimestamp`` is always the next full hour. ``fundingRate`` is
  the fraction for that hour.

Fees: 0.01% maker / 0.025% taker on every enabled contract, matching the
promotional schedule in docs.ondoperps.xyz ("Fees"). A few contracts carry the
dearer 0.015% / 0.035%, but all of them are disabled today; the venue row takes
the highest fee among enabled contracts so a dearer one, once enabled, is never
priced as the cheaper. A builder fee of up to 0.1% can be added on top by an
interface; TrueNorth publishes none, so none is added here.

Rate limit: the public beta states one request per second by default, so book
calls are spaced and a refused call is retried after a pause.

Tickers are the venue's own base currency. Where Ondo names an instrument
differently from the other venues (WTI for CL, US500 for SP500) the rename lives
in data/manual/symbol_overrides.yaml, checked by price, never here.
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

API_URL = "https://api.ondoperps.xyz"
FEE_SOURCE_URL = "https://docs.ondoperps.xyz/"
_HOURS_PER_YEAR = 8760.0
#: Funding settles every hour (module docstring).
_FUNDING_INTERVAL_HOURS = 1.0
#: The deepest book `depth` accepts.
_BOOK_DEPTH = 100
#: One request per second in the public beta; a little slower to be safe.
_BOOK_CALL_SPACING_SECONDS = 1.1
#: Answers worth another try: the rate limit, or a gateway blip.
_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = 2.0
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


def _levels(rows: object, *, descending: bool) -> list[tuple[float, float]]:
    """`[price, size]` pairs as (price, size) levels, best price first."""

    if not isinstance(rows, Sequence) or isinstance(rows, (str, bytes)):
        return []
    levels: list[tuple[float, float]] = []
    for row in rows:
        if not isinstance(row, Sequence) or isinstance(row, (str, bytes)) or len(row) < 2:
            continue
        price = _float(row[0])
        size = _float(row[1])
        if price is not None and size is not None and price > 0 and size > 0:
            levels.append((price, size))
    return sorted(levels, key=lambda level: level[0], reverse=descending)


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


class OndoAdapter(VenueAdapter):
    slug = "ondo"

    def __init__(self) -> None:
        self._rows: dict[str, Mapping[str, object]] | None = None
        self._last_book_call: float | None = None

    def _get(self, path: str, params: Mapping[str, object] | None = None) -> object:
        """One public REST call, unwrapped from `{success, result}`, retried when refused."""

        for attempt in range(_MAX_ATTEMPTS):
            response = httpx.get(
                f"{API_URL}{path}", params=dict(params or {}), timeout=25, headers={"Accept": "application/json"}
            )
            if response.status_code in _RETRY_STATUSES and attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_BACKOFF_SECONDS * (attempt + 1))
                continue
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, Mapping) or payload.get("success") is not True:
                raise ValueError(f"ondo: {path} did not answer successfully")
            return payload.get("result")
        raise AssertionError("unreachable: the last attempt always returns or raises")

    def _pace(self) -> None:
        """Space book calls to the public beta's one request per second."""

        now = time.monotonic()
        if self._last_book_call is not None:
            wait = _BOOK_CALL_SPACING_SECONDS - (now - self._last_book_call)
            if wait > 0:
                time.sleep(wait)
        self._last_book_call = time.monotonic()

    def _contracts(self) -> dict[str, Mapping[str, object]]:
        """Every contract by market, fetched once per instance."""

        if self._rows is None:
            rows = self._get("/v1/perps/contracts")
            if not isinstance(rows, list):
                raise ValueError("ondo: contracts returned no list")
            self._rows = {
                str(row["market"]): row for row in rows if isinstance(row, Mapping) and row.get("market")
            }
        return self._rows

    def _enabled(self) -> list[Mapping[str, object]]:
        return [row for row in self._contracts().values() if row.get("disabled") is not True]

    def _contract(self, symbol: str) -> Mapping[str, object]:
        row = self._contracts().get(symbol)
        if row is None:
            raise MarketUnavailable(f"ondo: unknown market {symbol}")
        return row

    def get_markets(self) -> list[MarketInfo]:
        markets: list[MarketInfo] = []
        for symbol, row in self._contracts().items():
            base = row.get("baseCurrency")
            base_asset = (base if isinstance(base, str) and base else symbol.partition("-")[0]).upper()
            tags = row.get("tags")
            tag = tags[0] if isinstance(tags, list) and tags and isinstance(tags[0], str) else None
            markets.append(
                MarketInfo(
                    symbol=symbol,
                    symbol_canonical=base_asset,
                    base_asset=base_asset,
                    is_active=row.get("disabled") is not True,
                    # The venue's own class, verbatim in upper case (base.MarketInfo).
                    asset_class=tag.upper() if tag else None,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """A FRACTION per hour: `0.0000063` is 0.00063% an hour, ~5.5% a year."""

        rate_per_hour = _float(self._contract(symbol).get("fundingRate"))
        if rate_per_hour is None:
            raise MarketUnavailable(f"ondo: funding unavailable for {symbol}")
        return FundingData(
            funding_rate_raw=rate_per_hour,
            interval_hours=_FUNDING_INTERVAL_HOURS,
            funding_rate_annualized=rate_per_hour * _HOURS_PER_YEAR,
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        self._contract(symbol)  # an unknown symbol fails before any network call
        self._pace()
        payload = self._get("/v1/perps/depth", {"market": symbol, "depth": _BOOK_DEPTH})
        if not isinstance(payload, Mapping):
            raise MarketUnavailable(f"ondo: book unavailable for {symbol}")
        bids = _levels(payload.get("bids"), descending=True)
        asks = _levels(payload.get("asks"), descending=False)
        if not bids or not asks:
            raise MarketUnavailable(f"ondo: empty book for {symbol}")

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
        """Both already in dollars."""

        row = self._contract(symbol)
        return VolumeData(
            volume_24h_usd=_float(row.get("usdVolume")),
            open_interest_usd=_float(row.get("openInterestUsd")),
        )

    def get_venue_totals(self) -> VenueTotals:
        """Enabled contracts, summed from the one call a run already makes."""

        volume = 0.0
        open_interest = 0.0
        for row in self._enabled():
            market_volume = _float(row.get("usdVolume"))
            if market_volume is not None:
                volume += market_volume
            market_oi = _float(row.get("openInterestUsd"))
            if market_oi is not None:
                open_interest += market_oi
        return VenueTotals(volume_24h_usd=volume, open_interest_usd=open_interest)

    def get_fees(self) -> FeeData:
        """The dearest maker and taker any enabled contract reports (module docstring)."""

        makers = [fee for row in self._enabled() if (fee := _float(row.get("makerFee"))) is not None]
        takers = [fee for row in self._enabled() if (fee := _float(row.get("takerFee"))) is not None]
        if not makers or not takers:
            raise MarketUnavailable("ondo: no enabled contract reports its fees")
        return FeeData(maker_bps=max(makers) * 10_000.0, taker_bps=max(takers) * 10_000.0, source_url=FEE_SOURCE_URL)
