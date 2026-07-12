"""Upserts `venues` rows from the adapter registry (adapters/registry.py).

Venues are categorized as "automated" in the data model: their existence and
display name come from code (the registry), not from hand-edited YAML. Manual
YAML files (points_programs.yaml etc.) reference venues by slug and expect
the row to already exist -- run this before `perpfarm ingest-manual`.
"""

from sqlalchemy import Engine
from sqlalchemy.dialects.postgresql import insert as pg_insert

from perpfarm.adapters.registry import REGISTRY
from perpfarm.schema import venues


def bootstrap_venues(engine: Engine, *, dry_run: bool = False) -> int:
    count = 0
    with engine.begin() as conn:
        for reg in REGISTRY:
            stmt = pg_insert(venues).values(slug=reg.slug, name=reg.name, api_status=reg.api_status)
            stmt = stmt.on_conflict_do_update(
                index_elements=[venues.c.slug],
                set_={"name": stmt.excluded.name, "api_status": stmt.excluded.api_status},
            )
            if not dry_run:
                conn.execute(stmt)
            count += 1
    return count
