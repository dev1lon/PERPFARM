"""Catalog refresh: register venues, ingest manual data, sync market lists.

Collapses the three one-time-per-venue setup steps (`bootstrap-venues`,
`ingest-manual`, `sync-markets <slug>`) into one idempotent operation so
adding a venue needs no per-venue shell work -- edit the adapter/registry +
YAML, deploy, and this runs (manually via `perpfarm refresh-catalog`, or
automatically at the start of the nightly job).

Everything here is idempotent upserts reading from committed code/YAML, so
running it repeatedly (e.g. every nightly) is safe. It does NOT run
migrations -- schema changes still need a manual `alembic upgrade head`
(Render's multi-service model can't run migrations race-free automatically;
see docs/deploy.md).
"""

from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import Engine

from perpfarm.adapters.registry import REGISTRY
from perpfarm.ingest.manual import ingest_manual
from perpfarm.ingest.markets import sync_markets
from perpfarm.ingest.venues import bootstrap_venues


@dataclass
class CatalogRefreshSummary:
    venues: int = 0
    manual_rows: int = 0
    markets_synced: int = 0
    markets_skipped: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)


def _sync_all_markets(
    engine: Engine, *, fixtures_dir: Path, data_dir: Path, summary: CatalogRefreshSummary
) -> None:
    """Sync markets for every registered venue whose adapter is wired up.

    A stub adapter's get_markets() raises NotImplementedError -- that's "not
    integrated yet", counted as skipped, not an error. Any other failure is
    recorded per-venue but never sinks the rest of the batch.
    """
    overrides_path = data_dir / "symbol_overrides.yaml"
    for reg in REGISTRY:
        try:
            count = sync_markets(
                engine, reg.slug, fixtures_dir=fixtures_dir, overrides_path=overrides_path
            )
            summary.markets_synced += count
        except NotImplementedError:
            summary.markets_skipped += 1
        except Exception as exc:  # noqa: BLE001 -- one venue must not sink the batch
            summary.errors.append((reg.slug, str(exc)))


def refresh_catalog(
    engine: Engine,
    *,
    fixtures_dir: Path,
    data_dir: Path,
) -> CatalogRefreshSummary:
    summary = CatalogRefreshSummary()
    summary.venues = bootstrap_venues(engine)

    ingest_summary = ingest_manual(engine, data_dir)
    summary.manual_rows = (
        ingest_summary.points_programs
        + ingest_summary.pair_weights
        + ingest_summary.venue_meta
        + ingest_summary.execution_rules
    )

    _sync_all_markets(engine, fixtures_dir=fixtures_dir, data_dir=data_dir, summary=summary)
    return summary
