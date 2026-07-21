"""Loads data/manual/*.yaml and upserts into the manual tables.

Venue rows are not created here -- run `perpfarm bootstrap-venues` first (it
upserts from the adapter registry). A YAML row referencing an unknown venue
slug fails the whole run rather than silently creating a stub venue with no
adapter behind it.
"""

from dataclasses import dataclass
from pathlib import Path

import yaml
from sqlalchemy import Engine, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from perpfarm.adapters.registry import FIXTURE_SLUGS
from perpfarm.ingest.schemas import ExecutionRuleRow, VenueMetaRow
from perpfarm.schema import execution_rules, venue_meta, venues


class IngestError(Exception):
    pass


@dataclass
class IngestSummary:
    venue_meta: int = 0
    execution_rules: int = 0


def _load_yaml(path: Path, key: str) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get(key, [])


def _venue_id_map(conn) -> dict[str, int]:
    rows = conn.execute(select(venues.c.id, venues.c.slug)).all()
    return {slug: id_ for id_, slug in rows}


def _resolve_venue(slug: str, venue_ids: dict[str, int], *, file: str) -> int:
    try:
        return venue_ids[slug]
    except KeyError:
        raise IngestError(
            f"{file}: venue slug '{slug}' does not exist in `venues` table -- "
            "run `perpfarm bootstrap-venues` first"
        ) from None


def ingest_manual(engine: Engine, data_dir: Path, *, dry_run: bool = False) -> IngestSummary:
    summary = IngestSummary()

    meta_rows = [VenueMetaRow(**r) for r in _load_yaml(data_dir / "venue_meta.yaml", "venue_meta")]
    rule_rows = [
        ExecutionRuleRow(**r) for r in _load_yaml(data_dir / "execution_rules.yaml", "execution_rules")
    ]

    # Fixtures (venue_alpha/venue_beta) keep their YAML rows for tests/dev, but
    # are never seeded into a real DB.
    meta_rows = [r for r in meta_rows if r.venue not in FIXTURE_SLUGS]
    rule_rows = [r for r in rule_rows if r.venue not in FIXTURE_SLUGS]

    with engine.begin() as conn:
        venue_ids = _venue_id_map(conn)

        for r in meta_rows:
            venue_id = _resolve_venue(r.venue, venue_ids, file="venue_meta.yaml")
            stmt = pg_insert(venue_meta).values(
                venue_id=venue_id,
                raised_usd=r.raised_usd,
                investors=r.investors,
                community_supply_pct=r.community_supply_pct,
                otc_point_price_usd=r.otc_point_price_usd,
                season_name=r.season_name,
                season_end_date=r.season_end_date,
                twitter_url=r.twitter_url,
                docs_url=r.docs_url,
                referral_link=r.referral_link,
                notes_md=r.notes_md,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[venue_meta.c.venue_id],
                set_={
                    "raised_usd": stmt.excluded.raised_usd,
                    "investors": stmt.excluded.investors,
                    "community_supply_pct": stmt.excluded.community_supply_pct,
                    "otc_point_price_usd": stmt.excluded.otc_point_price_usd,
                    "season_name": stmt.excluded.season_name,
                    "season_end_date": stmt.excluded.season_end_date,
                    "twitter_url": stmt.excluded.twitter_url,
                    "docs_url": stmt.excluded.docs_url,
                    "referral_link": stmt.excluded.referral_link,
                    "notes_md": stmt.excluded.notes_md,
                    "updated_at": func.now(),
                },
            )
            if not dry_run:
                conn.execute(stmt)
            summary.venue_meta += 1

        for r in rule_rows:
            venue_id = _resolve_venue(r.venue, venue_ids, file="execution_rules.yaml")
            stmt = pg_insert(execution_rules).values(
                venue_id=venue_id,
                maker_counts_for_points=r.maker_counts_for_points,
                taker_counts_for_points=r.taker_counts_for_points,
                maker_boost_multiplier=r.maker_boost_multiplier,
                notes=r.notes,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[execution_rules.c.venue_id],
                set_={
                    "maker_counts_for_points": stmt.excluded.maker_counts_for_points,
                    "taker_counts_for_points": stmt.excluded.taker_counts_for_points,
                    "maker_boost_multiplier": stmt.excluded.maker_boost_multiplier,
                    "notes": stmt.excluded.notes,
                    "updated_at": func.now(),
                },
            )
            if not dry_run:
                conn.execute(stmt)
            summary.execution_rules += 1

    return summary
