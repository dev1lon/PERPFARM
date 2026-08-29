"""A traders column on the daily venue stats.

TxFlow publishes a distinct-trader count on its official Dune dashboard, and
the site drew it by asking Dune on every cache miss. The hourly worker now
takes it with the rest of TxFlow's published numbers and stores it here, so a
page load reads one table and never depends on a third party being up.

Nullable, and it stays nullable: no other protocol publishes this yet, and a
missing count must read as "not published" rather than as zero traders.

Revision ID: 0011
Revises: 0010
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("venue_daily_stats", sa.Column("unique_traders", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("venue_daily_stats", "unique_traders")
