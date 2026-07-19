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
from perpfarm.ingest.schemas import (
    CONFIDENCE_VALUES,
    ExecutionRuleRow,
    PairWeightRow,
    PointsProgramRow,
    VenueMetaRow,
)
from perpfarm.schema import execution_rules, pair_weights, points_programs, venue_meta, venues


class IngestError(Exception):
    pass


@dataclass
class IngestSummary:
    points_programs: int = 0
    pair_weights: int = 0
    venue_meta: int = 0
    execution_rules: int = 0


def _load_yaml(path: Path, key: str) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get(key, [])


def _check_confidence(value: str, *, file: str) -> None:
    if value not in CONFIDENCE_VALUES:
        raise IngestError(f"{file}: confidence '{value}' not in {sorted(CONFIDENCE_VALUES)}")


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

    points_rows = [
        PointsProgramRow(**r) for r in _load_yaml(data_dir / "points_programs.yaml", "points_programs")
    ]
    weight_rows = [
        PairWeightRow(**r) for r in _load_yaml(data_dir / "pair_weights.yaml", "pair_weights")
    ]
    meta_rows = [VenueMetaRow(**r) for r in _load_yaml(data_dir / "venue_meta.yaml", "venue_meta")]
    rule_rows = [
        ExecutionRuleRow(**r) for r in _load_yaml(data_dir / "execution_rules.yaml", "execution_rules")
    ]

    # Fixtures (venue_alpha/venue_beta) keep their YAML rows for the offline
    # print-routes demo and scoring tests, but are never seeded into a real DB.
    points_rows = [r for r in points_rows if r.venue not in FIXTURE_SLUGS]
    weight_rows = [r for r in weight_rows if r.venue not in FIXTURE_SLUGS]
    meta_rows = [r for r in meta_rows if r.venue not in FIXTURE_SLUGS]
    rule_rows = [r for r in rule_rows if r.venue not in FIXTURE_SLUGS]

    for r in points_rows:
        _check_confidence(r.confidence, file="points_programs.yaml")
    for r in weight_rows:
        _check_confidence(r.confidence, file="pair_weights.yaml")

    with engine.begin() as conn:
        venue_ids = _venue_id_map(conn)

        for r in points_rows:
            venue_id = _resolve_venue(r.venue, venue_ids, file="points_programs.yaml")
            stmt = pg_insert(points_programs).values(
                venue_id=venue_id,
                description_md=r.description_md,
                points_per_usd_volume_estimate=r.points_per_usd_volume_estimate,
                weight_notes=r.weight_notes,
                confidence=r.confidence,
                last_verified=r.last_verified,
                source=r.source,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[points_programs.c.venue_id],
                set_={
                    "description_md": stmt.excluded.description_md,
                    "points_per_usd_volume_estimate": stmt.excluded.points_per_usd_volume_estimate,
                    "weight_notes": stmt.excluded.weight_notes,
                    "confidence": stmt.excluded.confidence,
                    "last_verified": stmt.excluded.last_verified,
                    "source": stmt.excluded.source,
                    "updated_at": func.now(),
                },
            )
            if not dry_run:
                conn.execute(stmt)
            summary.points_programs += 1

        for r in weight_rows:
            venue_id = _resolve_venue(r.venue, venue_ids, file="pair_weights.yaml")
            stmt = pg_insert(pair_weights).values(
                venue_id=venue_id,
                symbol_canonical=r.symbol_canonical,
                weight_multiplier=r.weight_multiplier,
                confidence=r.confidence,
                last_verified=r.last_verified,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[pair_weights.c.venue_id, pair_weights.c.symbol_canonical],
                set_={
                    "weight_multiplier": stmt.excluded.weight_multiplier,
                    "confidence": stmt.excluded.confidence,
                    "last_verified": stmt.excluded.last_verified,
                },
            )
            if not dry_run:
                conn.execute(stmt)
            summary.pair_weights += 1

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
