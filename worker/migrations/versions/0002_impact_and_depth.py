"""rename book_snapshots slippage_bps_* to impact_bps_*, add depth_usd_*

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("book_snapshots", "slippage_bps_10k", new_column_name="impact_bps_10k")
    op.alter_column("book_snapshots", "slippage_bps_50k", new_column_name="impact_bps_50k")
    op.alter_column("book_snapshots", "slippage_bps_100k", new_column_name="impact_bps_100k")
    op.add_column("book_snapshots", sa.Column("depth_usd_10k", sa.Numeric))
    op.add_column("book_snapshots", sa.Column("depth_usd_50k", sa.Numeric))
    op.add_column("book_snapshots", sa.Column("depth_usd_100k", sa.Numeric))


def downgrade() -> None:
    op.drop_column("book_snapshots", "depth_usd_100k")
    op.drop_column("book_snapshots", "depth_usd_50k")
    op.drop_column("book_snapshots", "depth_usd_10k")
    op.alter_column("book_snapshots", "impact_bps_100k", new_column_name="slippage_bps_100k")
    op.alter_column("book_snapshots", "impact_bps_50k", new_column_name="slippage_bps_50k")
    op.alter_column("book_snapshots", "impact_bps_10k", new_column_name="slippage_bps_10k")
