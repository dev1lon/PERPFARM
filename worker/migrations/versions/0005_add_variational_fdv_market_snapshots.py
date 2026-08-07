"""add hourly Variational FDV market snapshots

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "variational_fdv_market_snapshots",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("threshold", sa.Text(), nullable=False),
        sa.Column("probability_pct", sa.Numeric(), nullable=False),
        sa.Column("volume_usd", sa.Numeric(), nullable=False),
        sa.Column("event_volume_usd", sa.Numeric()),
        sa.UniqueConstraint("ts", "threshold", name="uq_variational_fdv_market_snapshot"),
    )
    op.create_index(
        "idx_variational_fdv_market_snapshots_ts",
        "variational_fdv_market_snapshots",
        [sa.text("ts DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_variational_fdv_market_snapshots_ts", table_name="variational_fdv_market_snapshots")
    op.drop_table("variational_fdv_market_snapshots")
