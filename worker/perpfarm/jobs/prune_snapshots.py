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

Retention is generous on purpose. The reader needs 24 hours; keeping several
days means a cron outage over a weekend cannot destroy the window it will want
when it comes back.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import Engine, text


#: Well past the 24h the site reads, so a missed run is never fatal.
RETENTION_DAYS = 7

#: Only tables whose readers use a short window. See the module docstring for
#: why `volume_snapshots` is absent -- it is not an oversight.
PRUNABLE_TABLES = ("book_snapshots", "funding_snapshots")


@dataclass
class PruneSummary:
    deleted: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


def run_prune_snapshots(engine: Engine, *, retention_days: int = RETENTION_DAYS) -> PruneSummary:
    """Delete rows older than the retention window from the short-window tables."""

    summary = PruneSummary()
    for table in PRUNABLE_TABLES:
        try:
            with engine.begin() as conn:
                result = conn.execute(
                    text(f"DELETE FROM {table} WHERE ts < now() - make_interval(days => :days)"),
                    {"days": retention_days},
                )
                summary.deleted[table] = result.rowcount or 0
        except Exception as exc:  # noqa: BLE001 -- housekeeping must never sink the run
            summary.errors.append(f"{table}: {exc}")
    return summary
