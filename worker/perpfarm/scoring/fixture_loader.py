"""Assembles `LegInputs` from data/fixtures/*/*.json + data/manual/*.yaml,
entirely in-process (no DB). Powers `perpfarm print-routes` for local
dev/demo use only -- production data flows through Postgres via
worker/perpfarm/jobs/nightly.py, not through this loader.

fees.json (per fixture venue directory) is a fixture-only convenience: real
fee data has no manual-YAML path by design (see worker/perpfarm/ingest/manual.py)
and is meant to arrive via the Phase 4 fee-page watcher into `fee_schedules`.
"""

import json
from pathlib import Path

import yaml

from perpfarm.adapters.fixture import FixtureAdapter
from perpfarm.ingest.schemas import ExecutionRuleRow, PairWeightRow, PointsProgramRow
from perpfarm.ingest.symbol_overrides import load_symbol_overrides
from perpfarm.scoring.types import SELF_MATCH_IMPACT_FACTOR, LegInputs, weakest_confidence

FIXTURE_VENUE_SLUGS = ("venue_alpha", "venue_beta")


def _load_yaml_rows(path: Path, key: str) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get(key, [])


def _load_fees(fixtures_dir: Path, slug: str) -> tuple[float | None, float | None]:
    path = fixtures_dir / slug / "fees.json"
    if not path.exists():
        return None, None
    with path.open(encoding="utf-8") as f:
        row = json.load(f)
    return row.get("maker_bps"), row.get("taker_bps")


def _build_leg(
    slug: str,
    canonical: str,
    native_symbol: str,
    adapter: FixtureAdapter,
    fixtures_dir: Path,
    points_rows: dict[str, PointsProgramRow],
    weight_rows: dict[tuple[str, str], PairWeightRow],
    rule_rows: dict[str, ExecutionRuleRow],
    *,
    is_self_match: bool = False,
) -> LegInputs:
    funding = adapter.get_funding(native_symbol)
    book = adapter.get_orderbook_top(native_symbol)
    maker_bps, taker_bps = _load_fees(fixtures_dir, slug)

    points_row = points_rows.get(slug)
    rule_row = rule_rows.get(slug)
    weight_row = weight_rows.get((slug, canonical))

    confidences = [points_row.confidence] if points_row else []
    verified_dates = [points_row.last_verified] if points_row else []
    if weight_row:
        confidences.append(weight_row.confidence)
        verified_dates.append(weight_row.last_verified)

    # Same-venue (two-account) routes largely fill against each other rather
    # than walking the public book -- damp the measured impact curve. See
    # SELF_MATCH_IMPACT_FACTOR / docs/scoring.md.
    damping = SELF_MATCH_IMPACT_FACTOR if is_self_match else 1.0
    impact_10k = book.impact_bps_10k * damping if book.impact_bps_10k is not None else None
    impact_50k = book.impact_bps_50k * damping if book.impact_bps_50k is not None else None
    impact_100k = book.impact_bps_100k * damping if book.impact_bps_100k is not None else None

    return LegInputs(
        venue_slug=slug,
        maker_bps=maker_bps,
        taker_bps=taker_bps,
        spread_bps=book.spread_bps,
        impact_bps_10k=impact_10k,
        impact_bps_50k=impact_50k,
        impact_bps_100k=impact_100k,
        depth_usd_10k=book.depth_usd_10k,
        depth_usd_50k=book.depth_usd_50k,
        depth_usd_100k=book.depth_usd_100k,
        funding_rate_annualized_7d_mean=funding.funding_rate_annualized,
        points_per_usd_volume_estimate=(
            points_row.points_per_usd_volume_estimate if points_row else None
        ),
        pair_weight_multiplier=weight_row.weight_multiplier if weight_row else 1.0,
        maker_counts_for_points=rule_row.maker_counts_for_points if rule_row else None,
        taker_counts_for_points=rule_row.taker_counts_for_points if rule_row else None,
        maker_boost_multiplier=rule_row.maker_boost_multiplier if rule_row else 1.0,
        manual_confidence=weakest_confidence(confidences) if confidences else None,
        manual_last_verified=min(verified_dates) if verified_dates else None,
    )


def load_common_routes(
    fixtures_dir: Path,
    data_dir: Path,
    *,
    venue_slugs: tuple[str, ...] = FIXTURE_VENUE_SLUGS,
    include_self_match: bool = True,
) -> list[tuple[str, str, str, LegInputs, LegInputs]]:
    """Returns (symbol_canonical, long_slug, short_slug, long_leg, short_leg).

    Cross-venue routes: every canonical symbol listed on >=2 of `venue_slugs`,
    both directions -- mirrors the universe rule the nightly job applies
    against the DB (see worker/perpfarm/jobs/nightly.py).

    Same-venue (self-match, `long_slug == short_slug`) routes: one per
    (venue, symbol) pair it lists, regardless of how many venues list it --
    these model a farmer hedging across two accounts on the same venue.
    """
    overrides = load_symbol_overrides(data_dir / "symbol_overrides.yaml")

    points_rows = {
        r.venue: r
        for r in (
            PointsProgramRow(**row)
            for row in _load_yaml_rows(data_dir / "points_programs.yaml", "points_programs")
        )
    }
    weight_rows = {
        (r.venue, r.symbol_canonical): r
        for r in (
            PairWeightRow(**row)
            for row in _load_yaml_rows(data_dir / "pair_weights.yaml", "pair_weights")
        )
    }
    rule_rows = {
        r.venue: r
        for r in (
            ExecutionRuleRow(**row)
            for row in _load_yaml_rows(data_dir / "execution_rules.yaml", "execution_rules")
        )
    }

    adapters = {slug: FixtureAdapter(slug, fixtures_dir) for slug in venue_slugs}

    # venue_slug -> {symbol_canonical -> native_symbol}
    native_by_canonical_by_venue: dict[str, dict[str, str]] = {}
    for slug, adapter in adapters.items():
        native_by_canonical: dict[str, str] = {}
        for m in adapter.get_markets():
            canonical = overrides.get((slug, m.symbol), m.symbol_canonical)
            native_by_canonical[canonical] = m.symbol
        native_by_canonical_by_venue[slug] = native_by_canonical

    symbol_venues: dict[str, list[str]] = {}
    for slug, native_by_canonical in native_by_canonical_by_venue.items():
        for canonical in native_by_canonical:
            symbol_venues.setdefault(canonical, []).append(slug)

    def build(slug: str, canonical: str, *, is_self_match: bool) -> LegInputs:
        return _build_leg(
            slug,
            canonical,
            native_by_canonical_by_venue[slug][canonical],
            adapters[slug],
            fixtures_dir,
            points_rows,
            weight_rows,
            rule_rows,
            is_self_match=is_self_match,
        )

    routes = []
    for canonical, slugs in symbol_venues.items():
        if include_self_match:
            for slug in slugs:
                long_leg = build(slug, canonical, is_self_match=True)
                short_leg = build(slug, canonical, is_self_match=True)
                routes.append((canonical, slug, slug, long_leg, short_leg))

        if len(slugs) < 2:
            continue
        for long_slug in slugs:
            for short_slug in slugs:
                if long_slug == short_slug:
                    continue
                long_leg = build(long_slug, canonical, is_self_match=False)
                short_leg = build(short_slug, canonical, is_self_match=False)
                routes.append((canonical, long_slug, short_slug, long_leg, short_leg))
    return routes
