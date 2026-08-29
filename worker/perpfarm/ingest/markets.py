"""Syncs `markets` rows for one venue by calling its adapter's get_markets().

This only maintains the market list, not the price/funding/volume snapshot
tables populated by the hourly `sync-snapshots` job.
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

        # Anything the venue no longer lists is deactivated, so a delisted
        # ticker stops being collected instead of failing every hour forever.
        # A venue only marks SOME removals as inactive itself; the rest simply
        # vanish from the list, and those rows used to stay active for good.
        #
        # Guarded by the empty check: a venue that answers with an empty list
        # (an API hiccup, an auth change) must never retire its whole market
        # set -- that would blank every chart and route it feeds.
        listed_symbols = [m.symbol for m in market_infos]
        if listed_symbols and not dry_run:
            conn.execute(
                markets.update()
                .where(markets.c.venue_id == venue_id)
                .where(markets.c.symbol.not_in(listed_symbols))
                .where(markets.c.is_active.is_(True))
                .values(is_active=False)
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
