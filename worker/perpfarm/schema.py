"""SQLAlchemy Core table definitions — the single source of truth for the schema.

Alembic's env.py autogenerates migrations against `metadata`. We use Core (not
the ORM) because this project is dominated by bulk snapshot inserts and
analytical reads, not object-graph manipulation.
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP

metadata = MetaData()

# ========== automated tables (written by worker) ==========

venues = Table(
    "venues",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("slug", Text, nullable=False, unique=True),
    Column("name", Text, nullable=False),
    Column("api_status", Text, nullable=False, server_default="stub"),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("api_status IN ('live', 'stub')", name="ck_venues_api_status"),
)

markets = Table(
    "markets",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    # native ticker as the exchange reports it, e.g. 'kPEPE-PERP'
    Column("symbol", Text, nullable=False),
    # normalized cross-venue key, e.g. 'PEPE'
    Column("symbol_canonical", Text, nullable=False),
    Column("base_asset", Text, nullable=False),
    Column("is_active", Boolean, nullable=False, server_default="true"),
    UniqueConstraint("venue_id", "symbol", name="uq_markets_venue_symbol"),
)
Index("idx_markets_canonical", markets.c.symbol_canonical)

funding_snapshots = Table(
    "funding_snapshots",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("market_id", Integer, ForeignKey("markets.id"), nullable=False),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    # raw per-interval rate as reported by the venue API (pre-annualization)
    Column("funding_rate_raw", Numeric),
    Column("interval_hours", Numeric, nullable=False),
    Column("funding_rate_annualized", Numeric, nullable=False),
    UniqueConstraint("market_id", "ts", name="uq_funding_market_ts"),
)
Index("idx_funding_market_ts", funding_snapshots.c.market_id, funding_snapshots.c.ts.desc())

book_snapshots = Table(
    "book_snapshots",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("market_id", Integer, ForeignKey("markets.id"), nullable=False),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    Column("best_bid", Numeric, nullable=False),
    Column("best_ask", Numeric, nullable=False),
    Column("spread_bps", Numeric, nullable=False),
    # VWAP-walk price impact in bps at each notional bucket, beyond the touch;
    # semantics (mid-referenced, book-walk method) fixed in docs/scoring.md
    Column("impact_bps_10k", Numeric),
    Column("impact_bps_50k", Numeric),
    Column("impact_bps_100k", Numeric),
    # USD notional actually reachable within each walk -- may be less than
    # the nominal bucket size on a thin book; drives the maker fill_risk flag
    Column("depth_usd_10k", Numeric),
    Column("depth_usd_50k", Numeric),
    Column("depth_usd_100k", Numeric),
    # Native quote/depth points supplied by an adapter. The JSON shape is
    # {reference_price, points: [{notional_usd, bid, ask}, ...]} so every
    # venue can retain its own real curve without new fixed-size columns.
    Column("quote_curve_json", JSONB),
    UniqueConstraint("market_id", "ts", name="uq_book_market_ts"),
)
Index("idx_book_market_ts", book_snapshots.c.market_id, book_snapshots.c.ts.desc())

volume_snapshots = Table(
    "volume_snapshots",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("market_id", Integer, ForeignKey("markets.id"), nullable=False),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    Column("volume_24h_usd", Numeric),
    Column("open_interest_usd", Numeric),
    UniqueConstraint("market_id", "ts", name="uq_volume_market_ts"),
)

# Legacy table retained in metadata because migration 0005 was applied in
# production. The web app now reads Polymarket directly and no worker writes it.
variational_fdv_market_snapshots = Table(
    "variational_fdv_market_snapshots",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    Column("threshold", Text, nullable=False),
    Column("probability_pct", Numeric, nullable=False),
    Column("volume_usd", Numeric, nullable=False),
    Column("event_volume_usd", Numeric),
    UniqueConstraint("ts", "threshold", name="uq_variational_fdv_market_snapshot"),
)
Index("idx_variational_fdv_market_snapshots_ts", variational_fdv_market_snapshots.c.ts.desc())

# One published recommendation per home venue and hourly snapshot run.  The
# website reads this table directly: loading a page must never kick off a
# route-wide calculation or a market API crawl.
hedge_route_recommendations = Table(
    "hedge_route_recommendations",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    Column("partner_venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    Column("cycle_cost_usd", Numeric, nullable=False),
    UniqueConstraint("venue_id", "ts", name="uq_hedge_route_recommendations_venue_ts"),
)
Index(
    "idx_hedge_route_recommendations_venue_ts",
    hedge_route_recommendations.c.venue_id,
    hedge_route_recommendations.c.ts.desc(),
)

fee_schedules = Table(
    "fee_schedules",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    # can be negative (maker rebate)
    Column("maker_bps", Numeric, nullable=False),
    Column("taker_bps", Numeric, nullable=False),
    Column("effective_from", Date, nullable=False),
    Column("source_url", Text),
    # hash of the fetched fee page, for diff detection (Phase 4 watcher)
    Column("raw_hash", Text),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
)

# ========== manual tables (YAML -> CLI ingest) ==========

venue_meta = Table(
    "venue_meta",
    metadata,
    Column("venue_id", Integer, ForeignKey("venues.id"), primary_key=True),
    Column("raised_usd", Numeric),
    Column("investors", Text),
    Column("community_supply_pct", Numeric),
    Column("otc_point_price_usd", Numeric),
    Column("season_name", Text),
    Column("season_end_date", Date),
    Column("twitter_url", Text),
    Column("docs_url", Text),
    Column("referral_link", Text),
    Column("notes_md", Text),
    Column("updated_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
)

execution_rules = Table(
    "execution_rules",
    metadata,
    Column("venue_id", Integer, ForeignKey("venues.id"), primary_key=True),
    Column("maker_counts_for_points", Boolean, nullable=False),
    Column("taker_counts_for_points", Boolean, nullable=False),
    Column("maker_boost_multiplier", Numeric, nullable=False, server_default="1"),
    Column("notes", Text),
    Column("updated_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
)

# ========== alerts (written starting Phase 4, table exists from Phase 1) ==========

alerts = Table(
    "alerts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("venue_id", Integer, ForeignKey("venues.id")),
    Column("kind", Text, nullable=False),
    Column("payload_json", JSONB, nullable=False),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
    Column("notified_at", TIMESTAMP(timezone=True)),
)
