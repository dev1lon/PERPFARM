"""Variational Omni public market-data adapter.

Verified against Variational's public read-only API and its API, fees, and
funding documentation on 2026-07-16:

    GET https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats

The API gives one cached platform snapshot containing the listed markets,
funding interval/rate, 24h volume, OI, and RFQ quotes at $1k/$100k/$1m.
It does *not* expose an orderbook, so the impact fields below are quote-curve
estimates, never presented as a VWAP book walk.  The public points
documentation also does not publish a points-per-volume emission formula;
that missing input deliberately keeps route scores incomplete rather than
manufacturing a cost-per-point number.
"""

from collections.abc import Mapping
import re

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

STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats"
FEE_SOURCE_URL = "https://docs.variational.io/omni/trading/fees"
_HOURS_PER_YEAR = 8760.0
_QUOTE_SIZE_KEY = re.compile(r"^size_(\d+)([km])$")


def _float(value: object | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _quote_pair(quote: object | None) -> tuple[float, float] | None:
    if not isinstance(quote, Mapping):
        return None
    bid = _float(quote.get("bid"))
    ask = _float(quote.get("ask"))
    if bid is None or ask is None or bid <= 0 or ask <= 0:
        return None
    return bid, ask


def _lerp(left: float, right: float, position: float) -> float:
    return left + (right - left) * position


def _funding_from_annualized_rate(annualized_rate: float, interval_hours: float) -> FundingData:
    """Convert Omni's displayed annualized funding rate to this app's schema.

    The public stats API's common ``0.1095`` value is 10.95% annualized: it
    exactly matches Omni's documented base interest of 0.00125% per hour
    multiplied by 8,760. ``funding_rate_raw`` is stored per interval by our
    schema, so convert it at the adapter boundary and preserve the API value
    as ``funding_rate_annualized``.
    """
    return FundingData(
        funding_rate_raw=annualized_rate * (interval_hours / _HOURS_PER_YEAR),
        interval_hours=interval_hours,
        funding_rate_annualized=annualized_rate,
    )


def _quote_curve_from_listing(listing: Mapping[str, object]) -> QuoteCurve | None:
    """Return every real public RFQ point exposed by Omni for this market."""
    quotes = listing.get("quotes")
    if not isinstance(quotes, Mapping):
        return None

    base = _quote_pair(quotes.get("base")) or _quote_pair(quotes.get("size_1k"))
    mark = _float(listing.get("mark_price"))
    if base is None or mark is None or mark <= 0:
        return None

    points: dict[float, QuoteCurvePoint] = {0.0: QuoteCurvePoint(0.0, *base)}
    for key, value in quotes.items():
        if not isinstance(key, str):
            continue
        match = _QUOTE_SIZE_KEY.fullmatch(key)
        quote = _quote_pair(value)
        if match is None or quote is None:
            continue
        multiplier = 1_000.0 if match.group(2) == "k" else 1_000_000.0
        notional = float(match.group(1)) * multiplier
        points[notional] = QuoteCurvePoint(notional, *quote)

    return QuoteCurve(reference_price=mark, points=tuple(points[key] for key in sorted(points)))


def _interpolate_quote(curve: QuoteCurve, notional: float) -> tuple[float, float] | None:
    points = curve.points
    if not points or notional < 0 or notional > points[-1].notional_usd:
        return None
    if notional <= points[0].notional_usd:
        return points[0].bid, points[0].ask
    for index in range(1, len(points)):
        left, right = points[index - 1], points[index]
        if notional <= right.notional_usd:
            position = (notional - left.notional_usd) / (right.notional_usd - left.notional_usd)
            return _lerp(left.bid, right.bid, position), _lerp(left.ask, right.ask, position)
    return None


def _quote_curve_impact_bps(listing: Mapping[str, object]) -> dict[str, float | None]:
    """Estimate average impact from Omni's real RFQ anchors.

    The standardized $10k/$50k/$100k fields remain for compatibility with
    older snapshots. The full native curve is stored separately and is what
    newer calculations use for arbitrary fill sizes.
    """
    curve = _quote_curve_from_listing(listing)
    if curve is None or len(curve.points) < 2:
        return {key: None for key in ("impact_bps_10k", "impact_bps_50k", "impact_bps_100k")}

    def impact_at(notional: float) -> float | None:
        quote = _interpolate_quote(curve, notional)
        if quote is None:
            return None
        base = curve.points[0]
        bid, ask = quote
        buy_impact = max(ask - base.ask, 0.0) / curve.reference_price * 10_000.0
        sell_impact = max(base.bid - bid, 0.0) / curve.reference_price * 10_000.0
        return (buy_impact + sell_impact) / 2.0

    return {
        "impact_bps_10k": impact_at(10_000.0),
        "impact_bps_50k": impact_at(50_000.0),
        "impact_bps_100k": impact_at(100_000.0),
    }


class VariationalAdapter(VenueAdapter):
    slug = "variational"

    def __init__(self) -> None:
        self._stats: dict[str, object] | None = None

    def _get_stats(self) -> dict[str, object]:
        if self._stats is None:
            response = httpx.get(STATS_URL, timeout=25, headers={"Accept": "application/json"})
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("listings"), list):
                raise ValueError("variational: /metadata/stats returned no listings array")
            self._stats = payload
        return self._stats

    def _listing(self, symbol: str) -> Mapping[str, object]:
        listings = self._get_stats()["listings"]
        assert isinstance(listings, list)  # validated in _get_stats
        for listing in listings:
            if isinstance(listing, Mapping) and listing.get("ticker") == symbol:
                return listing
        raise MarketUnavailable(f"variational: no current stats for {symbol}")

    def get_markets(self) -> list[MarketInfo]:
        listings = self._get_stats()["listings"]
        assert isinstance(listings, list)  # validated in _get_stats
        markets: list[MarketInfo] = []
        for listing in listings:
            if not isinstance(listing, Mapping):
                continue
            ticker = listing.get("ticker")
            if not isinstance(ticker, str) or not ticker:
                continue
            # The read-only API returns currently quoted listings only. A
            # missing quote remains in the catalog but is marked inactive.
            quoted = isinstance(listing.get("quotes"), Mapping)
            markets.append(
                MarketInfo(
                    symbol=ticker,
                    symbol_canonical=ticker,
                    base_asset=ticker,
                    is_active=quoted,
                )
            )
        return markets

    def get_funding(self, symbol: str) -> FundingData:
        listing = self._listing(symbol)
        raw = _float(listing.get("funding_rate"))
        interval_seconds = _float(listing.get("funding_interval_s"))
        if raw is None or interval_seconds is None or interval_seconds <= 0:
            raise MarketUnavailable(f"variational: funding unavailable for {symbol}")
        interval_hours = interval_seconds / 3600.0
        return _funding_from_annualized_rate(raw, interval_hours)

    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        listing = self._listing(symbol)
        curve = _quote_curve_from_listing(listing)
        if curve is None:
            raise MarketUnavailable(f"variational: incomplete base quote for {symbol}")
        base = curve.points[0]

        impact = _quote_curve_impact_bps(listing)
        spread_bps = _float(listing.get("base_spread_bps"))
        if spread_bps is None:
            mid = (base.bid + base.ask) / 2.0
            spread_bps = (base.ask - base.bid) / mid * 10_000.0

        def depth(key: str, notional: float) -> float | None:
            return notional if impact[key] is not None else None

        return OrderbookTop(
            best_bid=base.bid,
            best_ask=base.ask,
            spread_bps=spread_bps,
            impact_bps_10k=impact["impact_bps_10k"],
            impact_bps_50k=impact["impact_bps_50k"],
            impact_bps_100k=impact["impact_bps_100k"],
            depth_usd_10k=depth("impact_bps_10k", 10_000.0),
            depth_usd_50k=depth("impact_bps_50k", 50_000.0),
            depth_usd_100k=depth("impact_bps_100k", 100_000.0),
            quote_curve=curve,
        )

    def get_volume(self, symbol: str) -> VolumeData:
        listing = self._listing(symbol)
        open_interest = listing.get("open_interest")
        long_oi = _float(open_interest.get("long_open_interest")) if isinstance(open_interest, Mapping) else None
        short_oi = _float(open_interest.get("short_open_interest")) if isinstance(open_interest, Mapping) else None
        return VolumeData(
            volume_24h_usd=_float(listing.get("volume_24h")),
            open_interest_usd=(long_oi + short_oi) if long_oi is not None and short_oi is not None else None,
        )

    def get_venue_totals(self) -> VenueTotals:
        """Variational's own protocol-wide figures, from the same stats payload.

        `/metadata/stats` states both at the top level, so this costs no extra
        request during a run -- the payload is already cached on the instance.
        Both are in the venue's own convention (gross open interest), which is
        what the activity chart has always drawn.
        """

        stats = self._get_stats()
        return VenueTotals(
            volume_24h_usd=_float(stats.get("total_volume_24h")),
            open_interest_usd=_float(stats.get("open_interest")),
        )

    def get_fees(self) -> FeeData:
        # https://docs.variational.io/omni/trading/fees: no trading fees.
        return FeeData(maker_bps=0.0, taker_bps=0.0, source_url=FEE_SOURCE_URL)
