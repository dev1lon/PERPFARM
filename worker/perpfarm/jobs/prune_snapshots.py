"""Delete snapshot rows no query can reach any more.

Nothing ever pruned these tables, so they have grown hourly since March. The
site reads them over fixed windows, and those windows are short:

    book_snapshots      24 hours   (the cost window, lib/cost-history.ts)
    funding_snapshots   24 hours   (the funding window, lib/cross-cost.ts)
    volume_snapshots    180 days   (activity + OI-composition charts)

The first two are deleted outright past the window. `volume_snapshots` cannot
be -- the charts read six months of it -- but it does not need HOURLY rows that
far back either: every chart query already collapses the day to a single row
per market (`DISTINCT ON (market_id, day) ... ORDER BY ts DESC`, and the same
via `row_number() = 1`). Twenty-three of every twenty-four old rows are read and
thrown away, so they are downsampled instead of kept.

Retention is 36 hours: the 24 the readers use, plus 12 so a cron that runs late
or misses a turn never destroys the window it will want when it returns.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import Engine, text


#: The readers need 24 hours; the extra 12 is the margin for a cron that runs
#: late or misses a turn. Anything older is unreachable by every query we have.
RETENTION_HOURS = 36

#: Deleted outright past the retention window.
PRUNABLE_TABLES = ("book_snapshots", "funding_snapshots")

#: Kept for six months, but thinned to one row per market per day past the
#: window. Deleting it like the others would empty the charts.
DOWNSAMPLED_TABLE = "volume_snapshots"

# Keep exactly the rows the readers would have picked, so no chart moves:
#  - the latest row of the day (what the activity chart takes, then filters), and
#  - the latest row with a non-null OI (what OI-composition takes, filtering first).
# They are usually the same row, so this leaves ~1 per market per day.
_DOWNSAMPLE_SQL = """
WITH stale AS (
  SELECT id, market_id, (ts AT TIME ZONE 'UTC')::date AS day, ts, open_interest_usd
  FROM volume_snapshots
  WHERE ts < now() - make_interval(hours => :hours)
),
keep_latest AS (
  SELECT DISTINCT ON (market_id, day) id FROM stale ORDER BY market_id, day, ts DESC
),
keep_oi AS (
  SELECT DISTINCT ON (market_id, day) id FROM stale
  WHERE open_interest_usd IS NOT NULL
  ORDER BY market_id, day, ts DESC
)
DELETE FROM volume_snapshots vs
USING stale
WHERE vs.id = stale.id
  AND vs.id NOT IN (SELECT id FROM keep_latest)
  AND vs.id NOT IN (SELECT id FROM keep_oi)
"""


@dataclass
class PruneSummary:
    deleted: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


def run_prune_snapshots(engine: Engine, *, retention_hours: int = RETENTION_HOURS) -> PruneSummary:
    """Delete rows older than the retention window from the short-window tables."""

    summary = PruneSummary()
    for table in PRUNABLE_TABLES:
        try:
            with engine.begin() as conn:
                result = conn.execute(
                    text(f"DELETE FROM {table} WHERE ts < now() - make_interval(hours => :hours)"),
                    {"hours": retention_hours},
                )
                summary.deleted[table] = result.rowcount or 0
        except Exception as exc:  # noqa: BLE001 -- housekeeping must never sink the run
            summary.errors.append(f"{table}: {exc}")

    try:
        with engine.begin() as conn:
            result = conn.execute(text(_DOWNSAMPLE_SQL), {"hours": retention_hours})
            summary.deleted[DOWNSAMPLED_TABLE] = result.rowcount or 0
    except Exception as exc:  # noqa: BLE001
        summary.errors.append(f"{DOWNSAMPLED_TABLE}: {exc}")

    return summary
