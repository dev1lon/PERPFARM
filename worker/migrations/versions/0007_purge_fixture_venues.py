"""purge the synthetic fixture venues from a real database

`venue_alpha` and `venue_beta` are dev/test fixtures.  The first deploy seeded
the whole adapter registry, so they landed in production with markets and
snapshots; later commits added `is_fixture` guards to the writers, but a guard
only prevents new inserts -- nothing ever removed the rows that were already
there.  They then reached users: the fee watcher published venue_alpha's
fixture schedule (a NEGATIVE 2 bps maker fee), which made it the cheapest maker
side on the platform, and the hourly hedge-route job named it as Variational's
recommended counterparty on the live page.

This deletes those venues and everything hanging off them, child rows first
because the foreign keys have no ON DELETE CASCADE.  Nothing of value is lost:
every row was synthetic.  The delete is keyed on slug, so it is a no-op on a
database that never had them (including a fresh one).

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-09
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FIXTURE_SLUGS = ("venue_alpha", "venue_beta")

# Ordered child-first.  `alerts.venue_id` is nullable, so it is cleared rather
# than deleted -- an alert is a record of something we said, not venue data.
_MARKET_CHILDREN = ("book_snapshots", "funding_snapshots", "volume_snapshots")
_VENUE_CHILDREN = ("fee_schedules", "venue_meta", "execution_rules")


def upgrade() -> None:
    conn = op.get_bind()
    fixtures = "SELECT id FROM venues WHERE slug = ANY(:slugs)"
    params = {"slugs": list(FIXTURE_SLUGS)}

    from sqlalchemy import text

    for table in _MARKET_CHILDREN:
        conn.execute(
            text(
                f"DELETE FROM {table} WHERE market_id IN ("
                f"  SELECT id FROM markets WHERE venue_id IN ({fixtures})"
                f")"
            ),
            params,
        )
    # Both ends of a recommendation: a fixture could be the home venue or the
    # recommended partner, and the partner side is what shipped to the page.
    conn.execute(
        text(
            f"DELETE FROM hedge_route_recommendations "
            f"WHERE venue_id IN ({fixtures}) OR partner_venue_id IN ({fixtures})"
        ),
        params,
    )
    for table in _VENUE_CHILDREN:
        conn.execute(text(f"DELETE FROM {table} WHERE venue_id IN ({fixtures})"), params)
    conn.execute(text(f"UPDATE alerts SET venue_id = NULL WHERE venue_id IN ({fixtures})"), params)
    conn.execute(text(f"DELETE FROM markets WHERE venue_id IN ({fixtures})"), params)
    conn.execute(text("DELETE FROM venues WHERE slug = ANY(:slugs)"), params)


def downgrade() -> None:
    # Deliberately irreversible: these rows were synthetic test data that should
    # never have existed in a real database, and re-seeding them is exactly the
    # failure this migration exists to undo.
    pass
