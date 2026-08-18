"""keep one price per market per hour, long enough to measure venue drift

A cross-protocol hedge is only neutral while the two venues agree on price, so
the risk it carries is how far that agreement wanders. Measuring it needs a
long window; `book_snapshots` cannot supply one because each row holds a whole
quote curve and is pruned after 36 hours.

This table keeps the one number that matters at a fraction of the size, and it
is per MARKET rather than per venue pair -- the gap is a subtraction of two
rows, so ten venues cost ten series instead of forty-five combinations.

Backfilled from the quote curves still in `book_snapshots`, so the measure has
history from the moment it ships instead of starting blind.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mark_snapshots",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("market_id", sa.Integer(), sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("mark", sa.Numeric(), nullable=False),
        sa.UniqueConstraint("market_id", "ts", name="uq_mark_market_ts"),
    )
    op.create_index("idx_mark_market_ts", "mark_snapshots", ["market_id", sa.text("ts DESC")])

    # Seed from what the book snapshots still hold. `reference_price` is the
    # venue's own mark; where a row predates stored curves, the book mid says
    # the same thing to within a spread.
    op.execute(
        """
        INSERT INTO mark_snapshots (market_id, ts, mark)
        SELECT b.market_id, b.ts,
               COALESCE(
                 NULLIF((b.quote_curve_json ->> 'reference_price')::numeric, 0),
                 (b.best_bid + b.best_ask) / 2
               )
        FROM book_snapshots b
        WHERE COALESCE(
                NULLIF((b.quote_curve_json ->> 'reference_price')::numeric, 0),
                (b.best_bid + b.best_ask) / 2
              ) > 0
        ON CONFLICT (market_id, ts) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("idx_mark_market_ts", table_name="mark_snapshots")
    op.drop_table("mark_snapshots")
