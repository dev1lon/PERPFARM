"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "venues",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("api_status", sa.Text, nullable=False, server_default="stub"),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("api_status IN ('live', 'stub')", name="ck_venues_api_status"),
    )

    op.create_table(
        "markets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("symbol", sa.Text, nullable=False),
        sa.Column("symbol_canonical", sa.Text, nullable=False),
        sa.Column("base_asset", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.UniqueConstraint("venue_id", "symbol", name="uq_markets_venue_symbol"),
    )
    op.create_index("idx_markets_canonical", "markets", ["symbol_canonical"])

    op.create_table(
        "funding_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("market_id", sa.Integer, sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("funding_rate_raw", sa.Numeric),
        sa.Column("interval_hours", sa.Numeric, nullable=False),
        sa.Column("funding_rate_annualized", sa.Numeric, nullable=False),
        sa.UniqueConstraint("market_id", "ts", name="uq_funding_market_ts"),
    )
    op.create_index(
        "idx_funding_market_ts", "funding_snapshots", ["market_id", sa.text("ts DESC")]
    )

    op.create_table(
        "book_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("market_id", sa.Integer, sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("best_bid", sa.Numeric, nullable=False),
        sa.Column("best_ask", sa.Numeric, nullable=False),
        sa.Column("spread_bps", sa.Numeric, nullable=False),
        sa.Column("slippage_bps_10k", sa.Numeric),
        sa.Column("slippage_bps_50k", sa.Numeric),
        sa.Column("slippage_bps_100k", sa.Numeric),
        sa.UniqueConstraint("market_id", "ts", name="uq_book_market_ts"),
    )
    op.create_index("idx_book_market_ts", "book_snapshots", ["market_id", sa.text("ts DESC")])

    op.create_table(
        "volume_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("market_id", sa.Integer, sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("volume_24h_usd", sa.Numeric),
        sa.Column("open_interest_usd", sa.Numeric),
        sa.UniqueConstraint("market_id", "ts", name="uq_volume_market_ts"),
    )

    op.create_table(
        "fee_schedules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("maker_bps", sa.Numeric, nullable=False),
        sa.Column("taker_bps", sa.Numeric, nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("source_url", sa.Text),
        sa.Column("raw_hash", sa.Text),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.create_table(
        "points_distributions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("points_distributed_week", sa.Numeric),
        sa.Column("total_points_outstanding", sa.Numeric),
        sa.UniqueConstraint("venue_id", "ts", name="uq_points_dist_venue_ts"),
    )

    op.create_table(
        "points_programs",
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("description_md", sa.Text, nullable=False),
        sa.Column("points_per_usd_volume_estimate", sa.Numeric),
        sa.Column("weight_notes", sa.Text),
        sa.Column("confidence", sa.Text, nullable=False),
        sa.Column("last_verified", sa.Date, nullable=False),
        sa.Column("source", sa.Text),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "confidence IN ('confirmed', 'estimated', 'rumor')",
            name="ck_points_programs_confidence",
        ),
    )

    op.create_table(
        "pair_weights",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("symbol_canonical", sa.Text, nullable=False),
        sa.Column("weight_multiplier", sa.Numeric, nullable=False, server_default="1"),
        sa.Column("confidence", sa.Text, nullable=False),
        sa.Column("last_verified", sa.Date, nullable=False),
        sa.UniqueConstraint("venue_id", "symbol_canonical", name="uq_pair_weights_venue_symbol"),
        sa.CheckConstraint(
            "confidence IN ('confirmed', 'estimated', 'rumor')", name="ck_pair_weights_confidence"
        ),
    )

    op.create_table(
        "venue_meta",
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("raised_usd", sa.Numeric),
        sa.Column("investors", sa.Text),
        sa.Column("community_supply_pct", sa.Numeric),
        sa.Column("otc_point_price_usd", sa.Numeric),
        sa.Column("season_name", sa.Text),
        sa.Column("season_end_date", sa.Date),
        sa.Column("twitter_url", sa.Text),
        sa.Column("docs_url", sa.Text),
        sa.Column("referral_link", sa.Text),
        sa.Column("notes_md", sa.Text),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.create_table(
        "execution_rules",
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("maker_counts_for_points", sa.Boolean, nullable=False),
        sa.Column("taker_counts_for_points", sa.Boolean, nullable=False),
        sa.Column("maker_boost_multiplier", sa.Numeric, nullable=False, server_default="1"),
        sa.Column("notes", sa.Text),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.create_table(
        "route_scores",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("symbol_canonical", sa.Text, nullable=False),
        sa.Column("long_venue_id", sa.Integer, sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("short_venue_id", sa.Integer, sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("is_complete", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("cost_per_point_usd", sa.Numeric),
        sa.Column("points_per_1m_volume", sa.Numeric),
        sa.Column("cost_breakdown_json", JSONB, nullable=False),
        sa.Column("recommended_execution_json", JSONB, nullable=False),
        sa.Column("dilution_score", sa.Numeric),
        sa.Column("data_freshness_json", JSONB, nullable=False),
        sa.UniqueConstraint(
            "symbol_canonical",
            "long_venue_id",
            "short_venue_id",
            "ts",
            name="uq_route_scores_key",
        ),
    )
    op.create_index(
        "idx_routes_latest",
        "route_scores",
        [sa.text("ts DESC"), sa.text("cost_per_point_usd ASC")],
    )

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("venue_id", sa.Integer, sa.ForeignKey("venues.id")),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("payload_json", JSONB, nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("notified_at", sa.TIMESTAMP(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_index("idx_routes_latest", table_name="route_scores")
    op.drop_table("route_scores")
    op.drop_table("execution_rules")
    op.drop_table("venue_meta")
    op.drop_table("pair_weights")
    op.drop_table("points_programs")
    op.drop_table("points_distributions")
    op.drop_table("fee_schedules")
    op.drop_table("volume_snapshots")
    op.drop_index("idx_book_market_ts", table_name="book_snapshots")
    op.drop_table("book_snapshots")
    op.drop_index("idx_funding_market_ts", table_name="funding_snapshots")
    op.drop_table("funding_snapshots")
    op.drop_index("idx_markets_canonical", table_name="markets")
    op.drop_table("markets")
    op.drop_table("venues")
