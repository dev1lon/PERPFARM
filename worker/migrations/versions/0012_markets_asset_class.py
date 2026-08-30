"""Store the venue's own instrument class on each market.

QFEX prices by asset class -- 0.05%/0.10% on a single stock, 0.02%/0.05% on an
index or a commodity, 0.01%/0.02% on an FX pair -- and publishes the class of
every symbol in its reference data. Pricing all 193 of its markets at the
single-stock rate made the 23 non-equity ones cost up to five times what they
actually do, which is a real error in a table whose whole job is comparing
costs. The class is read from the venue rather than guessed here, so a newly
listed index is priced correctly the first hour it appears.

Nullable: no other venue publishes a class, and inventing one for them would be
us deciding what an instrument is.

Revision ID: 0012
Revises: 0011
"""

from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("markets", sa.Column("asset_class", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("markets", "asset_class")
