"""One row per venue per day: the points the activity chart draws.

The site used to build that chart by scanning 180 days of `volume_snapshots`
and collapsing them to one point per day -- on every request that missed the
edge cache, for a series that changes once an hour. Worse, it did that work to
re-derive a number the protocol publishes itself.

So the totals are taken here, once an hour, and stored:

  * the venue's OWN figure when its adapter can supply one
    (`get_venue_totals()`), because a protocol is the authority on its own
    volume;
  * otherwise the sum of our per-market snapshots -- the last snapshot of each
    market on that day, exactly the rows the chart query used to pick.

Only today and yesterday are touched. Older days cannot change: their snapshots
are already thinned to one per market per day, and the row written while the
day was current came from the venue itself. A row that came from the venue is
never overwritten by a summed one, for the same reason.

Open interest is stored in the protocol's own reported scale (Variational's
gross, long + short), so the site reads these columns without adjusting them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from sqlalchemy import Connection, Engine, text

from perpfarm.adapters.registry import FIXTURE_SLUGS, build_adapter
from perpfarm.jobs.hedge_recommendations import OI_DISPLAY_FACTOR

#: Today and yesterday. Anything older is settled -- see the module docstring.
ROLLUP_DAYS = 2

#: What wrote a row. A venue's own published total wins over our sum, and is
#: never replaced by one.
SOURCE_VENUE_API = "venue-api"
SOURCE_SNAPSHOTS = "snapshots"

_DAILY_FROM_SNAPSHOTS_SQL = """
WITH last_of_day AS (
  SELECT DISTINCT ON (s.market_id, (s.ts AT TIME ZONE 'UTC')::date)
         s.market_id,
         (s.ts AT TIME ZONE 'UTC')::date AS day,
         s.volume_24h_usd,
         s.open_interest_usd
  FROM volume_snapshots s
  JOIN markets m ON m.id = s.market_id
  WHERE m.venue_id = :venue_id
    AND s.ts >= now() - make_interval(days => :days)
  ORDER BY s.market_id, (s.ts AT TIME ZONE 'UTC')::date, s.ts DESC
)
SELECT day,
       SUM(volume_24h_usd) AS volume_24h_usd,
       SUM(open_interest_usd) AS open_interest_usd
FROM last_of_day
GROUP BY day
ORDER BY day
"""

#: A published figure always wins; a summed one only fills a gap or refreshes
#: an earlier sum. Without the WHERE clause the 00:05 run would replace
#: yesterday's published total -- from the venue itself or from its own Dune
#: dashboard -- with our sum of it.
_UPSERT_SQL = """
INSERT INTO venue_daily_stats (venue_id, day, volume_24h_usd, open_interest_usd, source, updated_at)
VALUES (:venue_id, :day, :volume, :open_interest, :source, now())
ON CONFLICT (venue_id, day) DO UPDATE
SET volume_24h_usd = EXCLUDED.volume_24h_usd,
    open_interest_usd = EXCLUDED.open_interest_usd,
    source = EXCLUDED.source,
    updated_at = now()
WHERE EXCLUDED.source <> 'snapshots' OR venue_daily_stats.source = 'snapshots'
"""


@dataclass
class DailyRollupSummary:
    written: int = 0
    #: Slug -> which source today's figures came from, for the run log.
    sources: dict[str, str] = field(default_factory=dict)
    errors: list[tuple[str, str]] = field(default_factory=list)


def _live_venues(engine: Engine) -> list[tuple[int, str]]:
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT DISTINCT v.id, v.slug
                FROM venues v
                JOIN markets m ON m.venue_id = v.id AND m.is_active
                ORDER BY v.slug
                """
            )
        ).all()
    return [(int(row[0]), str(row[1])) for row in rows if str(row[1]) not in FIXTURE_SLUGS]


def _today_utc(conn: Connection) -> date:
    """Today's date as POSTGRES sees it, so a row lands on the same day its
    snapshots did. The worker's own clock may sit in another timezone."""

    return conn.execute(text("SELECT (now() AT TIME ZONE 'UTC')::date")).scalar_one()


def _write_summed_days(conn: Connection, venue_id: int, slug: str, days: int) -> int:
    """Every day in the window, summed from our snapshots."""

    written = 0
    factor = OI_DISPLAY_FACTOR.get(slug, 1.0)
    rows = conn.execute(text(_DAILY_FROM_SNAPSHOTS_SQL), {"venue_id": venue_id, "days": days}).all()
    for row in rows:
        conn.execute(
            text(_UPSERT_SQL),
            {
                "venue_id": venue_id,
                "day": row.day,
                "volume": None if row.volume_24h_usd is None else float(row.volume_24h_usd),
                "open_interest": (
                    None if row.open_interest_usd is None else float(row.open_interest_usd) * factor
                ),
                "source": SOURCE_SNAPSHOTS,
            },
        )
        written += 1
    return written


def run_daily_rollup(
    engine: Engine, *, fixtures_dir: Path, days: int = ROLLUP_DAYS
) -> DailyRollupSummary:
    """Write today's and yesterday's row for every venue. Never raises."""

    summary = DailyRollupSummary()
    for venue_id, slug in _live_venues(engine):
        try:
            with engine.begin() as conn:
                summary.written += _write_summed_days(conn, venue_id, slug, days)
            summary.sources[slug] = SOURCE_SNAPSHOTS
        except Exception as exc:  # noqa: BLE001 -- a rollup must never sink the run
            summary.errors.append((slug, str(exc)))
            continue

        # Then today's row from the venue itself, where it publishes one. In its
        # own transaction, so a venue that is down cannot roll back the sums we
        # already have, and after the sum so it takes precedence over it.
        try:
            totals = build_adapter(slug, fixtures_dir).get_venue_totals()
        except NotImplementedError:
            continue
        except Exception as exc:  # noqa: BLE001 -- one venue must not sink the batch
            summary.errors.append((slug, str(exc)))
            continue
        if totals is None or (totals.volume_24h_usd is None and totals.open_interest_usd is None):
            continue

        try:
            with engine.begin() as conn:
                conn.execute(
                    text(_UPSERT_SQL),
                    {
                        "venue_id": venue_id,
                        "day": _today_utc(conn),
                        "volume": totals.volume_24h_usd,
                        "open_interest": totals.open_interest_usd,
                        "source": SOURCE_VENUE_API,
                    },
                )
            summary.written += 1
            summary.sources[slug] = SOURCE_VENUE_API
        except Exception as exc:  # noqa: BLE001
            summary.errors.append((slug, str(exc)))
    return summary
