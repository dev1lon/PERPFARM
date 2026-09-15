"""QFEX public market-data adapter.

QFEX lists perpetuals on single stocks, indices, commodities and FX. Its REST
market-data endpoints need no key -- the published OpenAPI marks them
`security: []`, and they answer without one:

* ``/md/contracts`` -- every symbol with its last price, 24h volume, open
  interest in USD, index price and current funding rate, in one request;
* ``/md/orderbook/{ticker_id}`` -- the public book, which is what turns
  "spread" into a real VWAP walk at the size being priced.

Two conventions of theirs matter here. `open_interest_usd` is already in
dollars, unlike every other venue we read, so it is taken as published rather
than multiplied by a price. And funding is settled hourly but only while a
symbol's underlier venue is open -- outside those hours QFEX publishes a rate
of exactly 0, which is a real reading, not a missing one.

Fees are the published entry tier for SINGLE STOCKS, which is what nearly
every QFEX market is: 0.05% maker, 0.10% taker, no discount applied.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone

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

API_BASE = "https://api.qfex.com"
#: QFEX's aggregate feed takes its interval in NANOSECONDS -- an hour is
#: 3_600_000_000_000, and every smaller-looking number is rejected with
#: "interval must be a whole number of minutes".
_METRICS_INTERVAL_NS = 3_600_000_000_000
_METRICS_WINDOW_HOURS = 24
FEE_SOURCE_URL = "https://docs.qfex.com/qfex/fees"
#: Stored as `asset_class` on a market QFEX has put in Growth Mode, so the site
#: prices it at that schedule. Keep in lockstep with ASSET_CLASS_FEES in
#: web/lib/venue-fees.ts and jobs/hedge_recommendations.py.
GROWTH_MODE_CLASS = "GROWTH_MODE"
#: The dearest taker rate Growth Mode has charged (0.015% on the equities;
#: crude oil pays 0.006%). A zero maker alone is not enough to call it Growth
#: Mode -- a venue-wide maker rebate would look the same and cost ten times
#: more on the taker side.
GROWTH_MODE_MAX_TAKER_BPS = 1.5
_HOURS_PER_YEAR = 8760.0
#: QFEX settles funding every 60 minutes (docs.qfex.com/qfex/funding).
_FUNDING_INTERVAL_HOURS = 1.0
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
    """`[["320.53", "53.77"], ["320.51", "0"], ...]` -> usable levels.

    QFEX publishes empty price points as size `0`; they are ticks on the grid,
    not liquidity, and walking through them as if they were fillable would
    understate impact.
    """

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


class QfexAdapter(VenueAdapter):
    slug = "qfex"

    def __init__(self) -> None:
        self._contracts: dict[str, Mapping[str, object]] | None = None
        self._refdata: dict[str, Mapping[str, object]] | None = None
        self._fee_table: dict[str, tuple[float, float]] | None = None

    def _get(self, path: str) -> object:
        response = httpx.get(
            f"{API_BASE}{path}",
            timeout=30,
            headers={"Accept": "application/json", "User-Agent": "perpfarm/1.0"},
        )
        response.raise_for_status()
        return response.json()

    def _all(self) -> dict[str, Mapping[str, object]]:
        """Every contract with its current market data, fetched once."""

        if self._contracts is None:
            payload = self._get("/md/contracts")
            rows = payload.get("data") if isinstance(payload, Mapping) else None
            if not isinstance(rows, list):
                raise ValueError("qfex: /md/contracts returned no data")
            self._contracts = {
                ticker: row
                for row in rows
                if isinstance(row, Mapping)
                and isinstance((ticker := row.get("ticker_id")), str)
                and ticker
            }
        return self._contracts

    def _fees(self) -> dict[str, tuple[float, float]]:
        """Each symbol's own maker/taker, in bps, from `/fees`.

        QFEX prices PER MARKET, not per venue: `/fees` answered 5/10 bps on 189
        equities, 2/5 on indices and commodities, 1/2 on the four FX pairs and
        0/1.5 or 0/0.6 on the three markets it put in Growth Mode (checked
        2026-09-15). Reading it is what keeps a discount the venue announces in
        its Discord from having to be typed in here.
        """

        if self._fee_table is None:
            payload = self._get("/fees")
            rows = payload.get("fees") if isinstance(payload, Mapping) else None
            if not isinstance(rows, Mapping):
                raise ValueError("qfex: /fees returned no fees")
            table: dict[str, tuple[float, float]] = {}
            for symbol, row in rows.items():
                if not isinstance(symbol, str) or not isinstance(row, Mapping):
                    continue
                maker = _float(row.get("maker_fee"))
                taker = _float(row.get("taker_fee"))
                if maker is not None and taker is not None:
                    table[symbol] = (maker * 10_000.0, taker * 10_000.0)
            self._fee_table = table
        return self._fee_table

    def _reference(self) -> dict[str, Mapping[str, object]]:
        """Per-symbol reference data: the venue's own status and asset class.

        `/md/contracts` carries neither, and both matter -- an INACTIVE symbol
        must stop being collected, and the class sets the fee.
        """

        if self._refdata is None:
            payload = self._get("/refdata")
            rows = payload.get("data") if isinstance(payload, Mapping) else None
            self._refdata = {
                symbol: row
                for row in (rows if isinstance(rows, list) else [])
                if isinstance(row, Mapping)
                and isinstance((symbol := row.get("symbol")), str)
                and symbol
            }
        return self._refdata

    def _contract(self, symbol: str) -> Mapping[str, object]:
        contract = self._all().get(symbol)
        if contract is None:
            raise MarketUnavailable(f"qfex: unknown market {symbol}")
        return contract

    def _fee_class(self, ticker: str, category: object) -> str | None:
        """Which schedule this market is charged on.

        `asset_class` is the field the site prices by, so it carries the fee
        bucket rather than the instrument's kind: a market QFEX has put in
        GROWTH MODE pays 0 bps maker and 0.6-1.5 bps taker, which is a tenth of
        its category's rate, and pricing SNDK as an ordinary equity would
        overstate it sevenfold. The bucket is read from the venue's own fee
        table, not from a list typed in here, so the next market it discounts
        needs no code change.

        The instrument's kind is not lost: the site classifies QFEX markets
        from its own curated map (web/lib/tradfi.ts), which answers first.
        """

        maker, taker = self._fees().get(ticker, (None, None))
        if maker == 0.0 and taker is not None and taker <= GROWTH_MODE_MAX_TAKER_BPS:
            return GROWTH_MODE_CLASS
        return category if isinstance(category, str) else None

    def get_markets(self) -> list[MarketInfo]:
        reference = self._reference()
        markets: list[MarketInfo] = []
        for ticker, row in self._all().items():
            base_asset = row.get("base_currency")
            if not isinstance(base_asset, str) or not base_asset:
                continue
            # Only perpetuals: the same feed can carry other product types, and
            # a dated future priced as a perp would be a different instrument
            # wearing the same ticker.
            if row.get("product_type") not in (None, "Perpetual"):
                continue
            details = reference.get(ticker, {})
            status = details.get("status")
            category = details.get("product_category")
            markets.append(
                MarketInfo(
                    symbol=ticker,
                    symbol_canonical=base_asset.upper(),
                    base_asset=base_asset.upper(),
                    # QFEX publishes ACTIVE / INACTIVE / DELISTED. A symbol
                    # missing from refdata keeps collecting rather than being
                    # retired on the strength of one endpoint's silence.
                    is_active=status in (None, "ACTIVE"),
                    asset_class=self._fee_class(ticker, category),
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        """A fraction per hour, and legitimately 0 outside the underlier's hours.

        QFEX only funds a symbol while the venue it tracks is open; a zero at
        3am on a US equity is the published rate, not a gap in the data.
        """

        contract = self._contract(symbol)
        rate = _float(contract.get("funding_rate"))
        if rate is None:
            raise MarketUnavailable(f"qfex: funding unavailable for {symbol}")
        return FundingData(
            funding_rate_raw=rate,
            interval_hours=_FUNDING_INTERVAL_HOURS,
            funding_rate_annualized=rate * _HOURS_PER_YEAR,
        )

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        self._contract(symbol)  # an unknown symbol fails before any network call
        payload = self._get(f"/md/orderbook/{symbol}")
        if not isinstance(payload, Mapping):
            raise MarketUnavailable(f"qfex: book unavailable for {symbol}")

        bids = _parse_levels(payload.get("bids"))
        asks = _parse_levels(payload.get("asks"))
        if not bids or not asks:
            raise MarketUnavailable(f"qfex: empty book for {symbol}")
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
        """`target_volume` is the 24h figure in the quote currency (USD), and
        `open_interest_usd` is already converted -- both taken as published."""

        contract = self._contract(symbol)
        return VolumeData(
            volume_24h_usd=_float(contract.get("target_volume")),
            open_interest_usd=_float(contract.get("open_interest_usd")),
        )

    def get_venue_totals(self) -> VenueTotals | None:
        """QFEX's OWN protocol-wide figures, not our sum of its markets.

        `/defillama/metrics` is the aggregate feed the venue publishes for
        DefiLlama: one row per hour with that hour's volume and the open
        interest at its end. The day's volume is the sum of those hours, and
        open interest is a level, so it is the newest row's -- never a sum.
        """

        end = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        start = end - timedelta(hours=_METRICS_WINDOW_HOURS)
        payload = self._get(
            "/defillama/metrics"
            f"?fromISO={start.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&toISO={end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&interval={_METRICS_INTERVAL_NS}"
        )
        rows = payload.get("data") if isinstance(payload, Mapping) else None
        if not isinstance(rows, list) or not rows:
            return None
        volume = 0.0
        counted = 0
        open_interest: float | None = None
        for row in rows:
            if not isinstance(row, Mapping):
                continue
            hourly = _float(row.get("dailyVolumeUSD"))
            if hourly is not None:
                volume += hourly
                counted += 1
            level = _float(row.get("openInterestAtEndUSD"))
            if level is not None:
                open_interest = level
        return VenueTotals(
            volume_24h_usd=volume if counted else None,
            open_interest_usd=open_interest,
        )

    def get_fees(self) -> FeeData:
        """The dearest schedule any QFEX market is on, read from `/fees`.

        The venue-wide row is one pair, and QFEX charges five different ones, so
        this row takes the highest -- 0.05% maker / 0.10% taker on a single
        stock today. A market on a cheaper schedule (indices and commodities at
        0.02% / 0.05%, FX at 0.01% / 0.02%, Growth Mode at 0% / 0.015%) is
        priced per market through its stored `asset_class`, so nothing is
        charged less here than it costs.
        """

        table = self._fees()
        if not table:
            raise MarketUnavailable("qfex: /fees returned no schedule")
        return FeeData(
            maker_bps=max(maker for maker, _ in table.values()),
            taker_bps=max(taker for _, taker in table.values()),
            source_url=FEE_SOURCE_URL,
        )
