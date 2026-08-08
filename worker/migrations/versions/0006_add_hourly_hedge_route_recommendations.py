"""store hourly hedge-route recommendations

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hedge_route_recommendations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("partner_venue_id", sa.Integer(), sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("cycle_cost_usd", sa.Numeric(), nullable=False),
        sa.UniqueConstraint("venue_id", "ts", name="uq_hedge_route_recommendations_venue_ts"),
    )
    op.create_index(
        "idx_hedge_route_recommendations_venue_ts",
        "hedge_route_recommendations",
        ["venue_id", sa.text("ts DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_hedge_route_recommendations_venue_ts", table_name="hedge_route_recommendations")
    op.drop_table("hedge_route_recommendations")
