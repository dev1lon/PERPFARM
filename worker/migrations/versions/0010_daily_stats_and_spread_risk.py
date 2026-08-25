"""Daily venue totals, precomputed spread risk, and a time index on volumes.

Three things the site was recomputing on every cache miss move to storage:

  * `venue_daily_stats` -- the protocol-wide volume/open-interest points of the
    activity chart. Backfilled here from the snapshots the chart was summing,
    so the chart keeps its history the moment this lands; from then on the
    hourly job writes the day's row from the venue's own published totals.
  * `pair_spread_risk` -- how far two venues' prices for one instrument wander
    apart. Left EMPTY here: it is derived from a week of marks and the hourly
    job fills it. Until it does, the badge reads "unknown", which is what it
    already does when the history is too short.
  * an index on `volume_snapshots.ts` -- every chart window filters by time
    across a whole venue, and the unique constraint on (market_id, ts) cannot
    answer that.

Revision ID: 0010
Revises: 0009
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "venue_daily_stats",
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("volume_24h_usd", sa.Numeric()),
        sa.Column("open_interest_usd", sa.Numeric()),
        sa.Column("source", sa.Text(), nullable=False, server_default="snapshots"),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "pair_spread_risk",
        sa.Column("venue_a_id", sa.Integer(), sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("venue_b_id", sa.Integer(), sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("symbol_canonical", sa.Text(), primary_key=True),
        sa.Column("observations", sa.Integer(), nullable=False),
        sa.Column("median_gap_bps", sa.Numeric()),
        sa.Column("breakout_share", sa.Numeric()),
        sa.Column("rating", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("venue_a_id < venue_b_id", name="ck_pair_spread_risk_venue_order"),
        sa.CheckConstraint(
            "rating IN ('low', 'medium', 'high', 'unknown')", name="ck_pair_spread_risk_rating"
        ),
    )
    op.create_index(
        "idx_pair_spread_risk_updated", "pair_spread_risk", [sa.text("updated_at DESC")]
    )

    op.create_index("idx_volume_snapshots_ts", "volume_snapshots", [sa.text("ts DESC")])

    # Backfill exactly what the chart query produced: the LAST snapshot of each
    # market on each day, summed across markets. Open interest is scaled to the
    # protocol's own reported convention here, because that is what this table
    # stores and what the site now reads without adjusting it further.
    op.execute(
        """
        INSERT INTO venue_daily_stats (venue_id, day, volume_24h_usd, open_interest_usd, source)
        SELECT m.venue_id,
               last.day,
               SUM(last.volume_24h_usd),
               SUM(last.open_interest_usd) * CASE WHEN v.slug = 'variational' THEN 2 ELSE 1 END,
               'snapshots'
        FROM (
          SELECT DISTINCT ON (s.market_id, (s.ts AT TIME ZONE 'UTC')::date)
                 s.market_id,
                 (s.ts AT TIME ZONE 'UTC')::date AS day,
                 s.volume_24h_usd,
                 s.open_interest_usd
          FROM volume_snapshots s
          ORDER BY s.market_id, (s.ts AT TIME ZONE 'UTC')::date, s.ts DESC
        ) AS last
        JOIN markets m ON m.id = last.market_id
        JOIN venues v ON v.id = m.venue_id
        GROUP BY m.venue_id, last.day, v.slug
        HAVING SUM(last.volume_24h_usd) IS NOT NULL
            OR SUM(last.open_interest_usd) IS NOT NULL
        ON CONFLICT (venue_id, day) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("idx_volume_snapshots_ts", table_name="volume_snapshots")
    op.drop_index("idx_pair_spread_risk_updated", table_name="pair_spread_risk")
    op.drop_table("pair_spread_risk")
    op.drop_table("venue_daily_stats")
