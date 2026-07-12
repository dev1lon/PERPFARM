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

points_distributions = Table(
    "points_distributions",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    Column("points_distributed_week", Numeric),
    # nullable: not every venue publishes total outstanding
    Column("total_points_outstanding", Numeric),
    UniqueConstraint("venue_id", "ts", name="uq_points_dist_venue_ts"),
)

# ========== manual tables (YAML -> CLI ingest) ==========

points_programs = Table(
    "points_programs",
    metadata,
    Column("venue_id", Integer, ForeignKey("venues.id"), primary_key=True),
    Column("description_md", Text, nullable=False),
    Column("points_per_usd_volume_estimate", Numeric),
    Column("weight_notes", Text),
    Column("confidence", Text, nullable=False),
    Column("last_verified", Date, nullable=False),
    Column("source", Text),
    Column("updated_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint(
        "confidence IN ('confirmed', 'estimated', 'rumor')", name="ck_points_programs_confidence"
    ),
)

pair_weights = Table(
    "pair_weights",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    # keyed by canonical symbol, not the venue's native ticker
    Column("symbol_canonical", Text, nullable=False),
    Column("weight_multiplier", Numeric, nullable=False, server_default="1"),
    Column("confidence", Text, nullable=False),
    Column("last_verified", Date, nullable=False),
    UniqueConstraint("venue_id", "symbol_canonical", name="uq_pair_weights_venue_symbol"),
    CheckConstraint(
        "confidence IN ('confirmed', 'estimated', 'rumor')", name="ck_pair_weights_confidence"
    ),
)

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

# ========== computed table (nightly) ==========

route_scores = Table(
    "route_scores",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("symbol_canonical", Text, nullable=False),
    Column("long_venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    Column("short_venue_id", Integer, ForeignKey("venues.id"), nullable=False),
    Column("ts", TIMESTAMP(timezone=True), nullable=False),
    # false if manual data is missing/stale for either leg; cost_per_point_usd
    # must be NULL in that case -- never silently score with placeholders
    Column("is_complete", Boolean, nullable=False, server_default="false"),
    Column("cost_per_point_usd", Numeric),
    Column("points_per_1m_volume", Numeric),
    Column("cost_breakdown_json", JSONB, nullable=False),
    Column("recommended_execution_json", JSONB, nullable=False),
    Column("dilution_score", Numeric),
    Column("data_freshness_json", JSONB, nullable=False),
    UniqueConstraint(
        "symbol_canonical", "long_venue_id", "short_venue_id", "ts", name="uq_route_scores_key"
    ),
)
Index(
    "idx_routes_latest",
    route_scores.c.ts.desc(),
    route_scores.c.cost_per_point_usd.asc(),
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
