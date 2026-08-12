"""Delete snapshot rows no query can reach any more.

Nothing ever pruned these tables, so they have grown hourly since March. The
site reads them over fixed windows, and those windows are short:

    book_snapshots      24 hours   (the cost window, lib/cost-history.ts)
    funding_snapshots   24 hours   (the funding window, lib/cross-cost.ts)
    volume_snapshots    180 days   (activity + OI-composition charts)

So the two hourly tables carry months of rows that nothing can read, and
`book_snapshots` is by far the heaviest of the three -- every row holds a quote
curve. `volume_snapshots` is deliberately NOT touched: pruning it to 24h would
silently empty the charts.

Retention is 36 hours: the 24 the readers use, plus 12 so a cron that runs late
or misses a turn never destroys the window it will want when it returns.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import Engine, text


#: The readers need 24 hours; the extra 12 is the margin for a cron that runs
#: late or misses a turn. Anything older is unreachable by every query we have.
RETENTION_HOURS = 36

#: Only tables whose readers use a short window. See the module docstring for
#: why `volume_snapshots` is absent -- it is not an oversight.
PRUNABLE_TABLES = ("book_snapshots", "funding_snapshots")


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
    return summary
