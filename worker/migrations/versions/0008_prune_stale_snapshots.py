"""delete snapshot rows older than the windows anything actually reads

Nothing has ever pruned these tables; they have grown hourly since March.
The readers use short windows -- 24h for book_snapshots and funding_snapshots
-- so the older rows are unreachable by any query. `volume_snapshots` is left
alone: the activity and OI-composition charts read up to 180 days of it.

This is the one-time catch-up. `perpfarm.jobs.prune_snapshots`, folded into
the hourly cron, keeps it that way afterwards.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-12
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RETENTION_DAYS = 7


def upgrade() -> None:
    from sqlalchemy import text

    conn = op.get_bind()
    for table in ("book_snapshots", "funding_snapshots"):
        conn.execute(
            text(f"DELETE FROM {table} WHERE ts < now() - make_interval(days => :days)"),
            {"days": RETENTION_DAYS},
        )


def downgrade() -> None:
    # Deliberately irreversible: the deleted rows were older than any window the
    # product reads, and no backup of them is kept.
    pass
