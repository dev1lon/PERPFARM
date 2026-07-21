"""drop the computed points layer: route_scores, points_programs, pair_weights, points_distributions

The product never computes points -- the point price is manual (farm field).
We only compute execution cost, live, from snapshots. These four tables (and
the scoring engine that wrote route_scores) are gone.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("route_scores")
    op.drop_table("pair_weights")
    op.drop_table("points_programs")
    op.drop_table("points_distributions")


def downgrade() -> None:
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
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "confidence IN ('confirmed', 'estimated', 'rumor')", name="ck_points_programs_confidence"
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
            "symbol_canonical", "long_venue_id", "short_venue_id", "ts", name="uq_route_scores_key"
        ),
    )
    op.create_index(
        "idx_routes_latest",
        "route_scores",
        [sa.text("ts DESC"), sa.text("cost_per_point_usd ASC")],
    )
