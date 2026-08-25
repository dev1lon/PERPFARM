"""Abstract venue adapter interface.

Every exchange integration (real or fixture) implements this interface. Real
adapters are added one file per venue in this package; see the venue stub
files for the current TODO(verify) list of endpoints to confirm against each
venue's docs before wiring anything real.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


class MarketUnavailable(Exception):
    """A listed market is temporarily not quotable.

    Note what this is NOT: these are perpetuals, and they do not close. A
    TradFi perp trades 24/7 like a crypto one -- Variational's own docs say
    "TradFi perps largely mirror crypto perps (e.g., cross margin, 24/7
    trading)". What changes outside the underlying's session is the pricing
    behind it: the venue smooths its index while the real market is shut, and
    the market makers who hedge on that real market widen or withdraw. So the
    quote can be missing even though the market is open.

    Expected and transient either way (not a bug and not "unwired"), so
    snapshot jobs should SKIP it rather than record a hard error that fails the
    whole run."""


@dataclass(frozen=True)
class MarketInfo:
    symbol: str  # native ticker as reported by the venue, e.g. "kPEPE-PERP"
    symbol_canonical: str  # normalized cross-venue key, e.g. "PEPE"
    base_asset: str
    is_active: bool


@dataclass(frozen=True)
class FundingData:
    funding_rate_raw: float  # rate for one funding interval, as the API reports it
    interval_hours: float
    funding_rate_annualized: float


@dataclass(frozen=True)
class QuoteCurvePoint:
    """One native venue quote/depth point at a USD notional size."""

    notional_usd: float
    bid: float
    ask: float


@dataclass(frozen=True)
class QuoteCurve:
    """Native execution curve observed from a venue's public market data.

    The point at notional 0 is the touch/base quote. Later points can come
    from an RFQ quote curve or a VWAP walk over a CLOB. We keep the venue's
    actual points instead of imposing a universal list of USD buckets.
    """

    reference_price: float
    points: tuple[QuoteCurvePoint, ...]


@dataclass(frozen=True)
class OrderbookTop:
    best_bid: float
    best_ask: float
    spread_bps: float
    # VWAP-walk price impact in bps at each notional bucket, beyond the touch
    impact_bps_10k: float | None = None
    impact_bps_50k: float | None = None
    impact_bps_100k: float | None = None
    # USD notional actually reachable within each walk (may be less than the
    # nominal bucket size on a thin book) -- drives the maker fill_risk flag
    depth_usd_10k: float | None = None
    depth_usd_50k: float | None = None
    depth_usd_100k: float | None = None
    # Optional native quote/depth curve. The legacy fixed buckets above remain
    # for historical rows and adapters that do not expose a curve yet.
    quote_curve: QuoteCurve | None = None


@dataclass(frozen=True)
class VolumeData:
    volume_24h_usd: float | None
    open_interest_usd: float | None


@dataclass(frozen=True)
class VenueTotals:
    """The venue's OWN protocol-wide figures, as it publishes them.

    Not a sum of our per-market snapshots: where a venue states its own 24h
    volume and open interest, that statement is the authority on it, and the
    daily rollup stores it instead of re-deriving one. Open interest is in the
    venue's reported convention (gross where it reports gross).
    """

    volume_24h_usd: float | None
    open_interest_usd: float | None


@dataclass(frozen=True)
class FeeData:
    maker_bps: float  # can be negative (maker rebate)
    taker_bps: float
    source_url: str | None = None  # fee-schedule page/doc this was read from


class VenueAdapter(ABC):
    """One instance per venue. Implementations must not raise on transient
    network errors inside job loops -- callers are responsible for retry/skip
    logic; adapters should raise so failures are visible, not swallow them.
    """

    slug: str

    @abstractmethod
    def get_markets(self) -> list[MarketInfo]:
        """Return all perp markets currently listed on this venue."""
        raise NotImplementedError

    @abstractmethod
    def get_funding(self, symbol: str) -> FundingData:
        """Return the current funding rate for a native market symbol."""
        raise NotImplementedError

    @abstractmethod
    def get_orderbook_top(self, symbol: str) -> OrderbookTop:
        """Return top-of-book + estimated price impact for a native market symbol."""
        raise NotImplementedError

    @abstractmethod
    def get_volume(self, symbol: str) -> VolumeData:
        """Return 24h volume and open interest for a native market symbol."""
        raise NotImplementedError

    def get_venue_totals(self) -> VenueTotals | None:
        """The venue's own protocol-wide 24h volume and open interest.

        Optional: returns None for venues that publish no such figure, and the
        daily rollup then sums our snapshots instead. Not abstract for that
        reason -- most adapters have nothing to say here.
        """

        return None

    @abstractmethod
    def get_fees(self) -> FeeData:
        """Return the venue's current (non-tiered) maker/taker fee schedule.

        Venue-wide, not per-market -- fee schedules on these venues are not
        keyed by symbol. Tiered/VIP fee schedules are out of scope; this
        should return the base tier.
        """
        raise NotImplementedError
