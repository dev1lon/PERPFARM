"""Syncs `markets` rows for one venue by calling its adapter's get_markets().

Separate from the hourly/daily/nightly jobs (Phase 2, worker/perpfarm/jobs/):
this only maintains the market list, which changes rarely, not the
price/funding/volume snapshot tables.
"""

from pathlib import Path

from sqlalchemy import Engine, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from perpfarm.adapters.registry import build_adapter, get_registration
from perpfarm.ingest.symbol_overrides import load_symbol_overrides
from perpfarm.schema import markets, venues


def sync_markets(
    engine: Engine,
    slug: str,
    *,
    fixtures_dir: Path,
    overrides_path: Path,
    dry_run: bool = False,
) -> int:
    get_registration(slug)  # raises KeyError if unknown, before touching the DB
    adapter = build_adapter(slug, fixtures_dir)
    overrides = load_symbol_overrides(overrides_path)

    market_infos = adapter.get_markets()

    count = 0
    with engine.begin() as conn:
        venue_id = conn.execute(
            select(venues.c.id).where(venues.c.slug == slug)
        ).scalar_one_or_none()
        if venue_id is None:
            raise RuntimeError(
                f"venue '{slug}' not found in `venues` table -- run `perpfarm bootstrap-venues` first"
            )

        for m in market_infos:
            symbol_canonical = overrides.get((slug, m.symbol), m.symbol_canonical)
            stmt = pg_insert(markets).values(
                venue_id=venue_id,
                symbol=m.symbol,
                symbol_canonical=symbol_canonical,
                base_asset=m.base_asset,
                is_active=m.is_active,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[markets.c.venue_id, markets.c.symbol],
                set_={
                    "symbol_canonical": stmt.excluded.symbol_canonical,
                    "base_asset": stmt.excluded.base_asset,
                    "is_active": stmt.excluded.is_active,
                },
            )
            if not dry_run:
                conn.execute(stmt)
            count += 1

    return count
