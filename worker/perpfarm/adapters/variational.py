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

STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats"
FEE_SOURCE_URL = "https://docs.variational.io/omni/trading/fees"
_HOURS_PER_YEAR = 8760.0


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


def _quote_curve_impact_bps(listing: Mapping[str, object]) -> dict[str, float | None]:
    """Estimate impact beyond Omni's base quote from its public RFQ curve.

    Omni exposes a base quote plus $1k, $100k, and (for majors) $1m quotes,
    rather than individual book levels.  We use the base quote as the touch,
    linearly interpolate the displayed quote prices for $10k/$50k, and use
    the displayed $100k quote directly.  A missing side means no estimate.
    """
    quotes = listing.get("quotes")
    if not isinstance(quotes, Mapping):
        return {key: None for key in ("impact_bps_10k", "impact_bps_50k", "impact_bps_100k")}

    base = _quote_pair(quotes.get("base")) or _quote_pair(quotes.get("size_1k"))
    one_k = _quote_pair(quotes.get("size_1k"))
    hundred_k = _quote_pair(quotes.get("size_100k"))
    if base is None or one_k is None or hundred_k is None:
        return {key: None for key in ("impact_bps_10k", "impact_bps_50k", "impact_bps_100k")}

    mark = _float(listing.get("mark_price"))
    if mark is None or mark <= 0:
        return {key: None for key in ("impact_bps_10k", "impact_bps_50k", "impact_bps_100k")}

    def impact_at(notional: float) -> float:
        # Both $10k and $50k lie between the documented $1k and $100k quote
        # buckets. $100k uses the observed quote, not an extrapolation.
        position = (notional - 1_000.0) / 99_000.0
        bid = _lerp(one_k[0], hundred_k[0], position)
        ask = _lerp(one_k[1], hundred_k[1], position)
        buy_impact = max(ask - base[1], 0.0) / mark * 10_000.0
        sell_impact = max(base[0] - bid, 0.0) / mark * 10_000.0
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
        quotes = listing.get("quotes")
        if not isinstance(quotes, Mapping):
            raise MarketUnavailable(f"variational: quotes unavailable for {symbol}")
        base = _quote_pair(quotes.get("base")) or _quote_pair(quotes.get("size_1k"))
        if base is None:
            raise MarketUnavailable(f"variational: incomplete base quote for {symbol}")

        impact = _quote_curve_impact_bps(listing)
        spread_bps = _float(listing.get("base_spread_bps"))
        if spread_bps is None:
            mid = (base[0] + base[1]) / 2.0
            spread_bps = (base[1] - base[0]) / mid * 10_000.0

        def depth(key: str, notional: float) -> float | None:
            return notional if impact[key] is not None else None

        return OrderbookTop(
            best_bid=base[0],
            best_ask=base[1],
            spread_bps=spread_bps,
            impact_bps_10k=impact["impact_bps_10k"],
            impact_bps_50k=impact["impact_bps_50k"],
            impact_bps_100k=impact["impact_bps_100k"],
            depth_usd_10k=depth("impact_bps_10k", 10_000.0),
            depth_usd_50k=depth("impact_bps_50k", 50_000.0),
            depth_usd_100k=depth("impact_bps_100k", 100_000.0),
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

    def get_fees(self) -> FeeData:
        # https://docs.variational.io/omni/trading/fees: no trading fees.
        return FeeData(maker_bps=0.0, taker_bps=0.0, source_url=FEE_SOURCE_URL)
