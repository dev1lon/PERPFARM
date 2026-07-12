"""Nightly job: recompute `route_scores` for every eligible route.

Universe: for every actively-listed canonical symbol, one same-venue
(self-match, two-account) route per venue that lists it, plus every ordered
pair of distinct venues listing that symbol when it's listed on >=2 venues
(long/short are not interchangeable -- fees and funding can differ by
direction).

"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import Engine, func, select

from perpfarm.schema import (
    book_snapshots,
    execution_rules,
    fee_schedules,
    funding_snapshots,
    markets,
    pair_weights,
    points_distributions,
    points_programs,
    route_scores,
    venues,
)
from perpfarm.scoring.engine import score_route
from perpfarm.scoring.types import SELF_MATCH_IMPACT_FACTOR, LegInputs, ScoringParams, weakest_confidence

_BOOK_WINDOW = timedelta(hours=24)
_FUNDING_WINDOW = timedelta(days=7)


def _active_symbols(conn) -> list[str]:
    """Every actively-listed canonical symbol, regardless of venue count --
    self-match routes only need one listing."""
    stmt = select(markets.c.symbol_canonical).where(markets.c.is_active.is_(True)).distinct()
    return [row[0] for row in conn.execute(stmt)]


def _venues_for_symbol(conn, symbol_canonical: str):
    """(venue_id, venue_slug, market_id) for each active listing of this symbol."""
    stmt = (
        select(venues.c.id, venues.c.slug, markets.c.id)
        .join(markets, markets.c.venue_id == venues.c.id)
        .where(markets.c.symbol_canonical == symbol_canonical, markets.c.is_active.is_(True))
    )
    return list(conn.execute(stmt))


def _latest_fee(conn, venue_id: int, as_of: date) -> tuple[float | None, float | None]:
    stmt = (
        select(fee_schedules.c.maker_bps, fee_schedules.c.taker_bps)
        .where(fee_schedules.c.venue_id == venue_id, fee_schedules.c.effective_from <= as_of)
        .order_by(fee_schedules.c.effective_from.desc())
        .limit(1)
    )
    row = conn.execute(stmt).first()
    return (row.maker_bps, row.taker_bps) if row else (None, None)


def _median_book(conn, market_id: int, since: datetime) -> dict:
    stmt = select(
        func.percentile_cont(0.5).within_group(book_snapshots.c.spread_bps),
        func.percentile_cont(0.5).within_group(book_snapshots.c.impact_bps_10k),
        func.percentile_cont(0.5).within_group(book_snapshots.c.impact_bps_50k),
        func.percentile_cont(0.5).within_group(book_snapshots.c.impact_bps_100k),
        func.percentile_cont(0.5).within_group(book_snapshots.c.depth_usd_10k),
        func.percentile_cont(0.5).within_group(book_snapshots.c.depth_usd_50k),
        func.percentile_cont(0.5).within_group(book_snapshots.c.depth_usd_100k),
    ).where(book_snapshots.c.market_id == market_id, book_snapshots.c.ts >= since)
    row = conn.execute(stmt).first()
    keys = (
        "spread_bps",
        "impact_bps_10k",
        "impact_bps_50k",
        "impact_bps_100k",
        "depth_usd_10k",
        "depth_usd_50k",
        "depth_usd_100k",
    )
    if row is None:
        return dict.fromkeys(keys)
    return dict(zip(keys, row, strict=True))


def _mean_funding(conn, market_id: int, since: datetime) -> float | None:
    stmt = select(func.avg(funding_snapshots.c.funding_rate_annualized)).where(
        funding_snapshots.c.market_id == market_id, funding_snapshots.c.ts >= since
    )
    return conn.execute(stmt).scalar()


def _points_program(conn, venue_id: int):
    stmt = select(
        points_programs.c.points_per_usd_volume_estimate,
        points_programs.c.confidence,
        points_programs.c.last_verified,
    ).where(points_programs.c.venue_id == venue_id)
    return conn.execute(stmt).first()


def _pair_weight(conn, venue_id: int, symbol_canonical: str):
    stmt = select(
        pair_weights.c.weight_multiplier, pair_weights.c.confidence, pair_weights.c.last_verified
    ).where(pair_weights.c.venue_id == venue_id, pair_weights.c.symbol_canonical == symbol_canonical)
    return conn.execute(stmt).first()


def _execution_rule(conn, venue_id: int):
    stmt = select(
        execution_rules.c.maker_counts_for_points,
        execution_rules.c.taker_counts_for_points,
        execution_rules.c.maker_boost_multiplier,
    ).where(execution_rules.c.venue_id == venue_id)
    return conn.execute(stmt).first()


def _latest_points_distribution(conn, venue_id: int):
    stmt = (
        select(points_distributions.c.points_distributed_week, points_distributions.c.total_points_outstanding)
        .where(points_distributions.c.venue_id == venue_id)
        .order_by(points_distributions.c.ts.desc())
        .limit(1)
    )
    return conn.execute(stmt).first()


def _f(value) -> float | None:
    """DB `Numeric` columns come back as `decimal.Decimal` (psycopg3), but
    the scoring engine's dataclasses/arithmetic are typed and written for
    plain `float` -- `Decimal * float` raises `TypeError`. Convert once at
    the DB boundary rather than at every arithmetic site downstream."""
    return float(value) if value is not None else None


def _build_leg(
    conn,
    venue_id: int,
    venue_slug: str,
    market_id: int,
    symbol_canonical: str,
    *,
    as_of: date,
    book_since: datetime,
    funding_since: datetime,
    is_self_match: bool,
) -> LegInputs:
    maker_bps, taker_bps = _latest_fee(conn, venue_id, as_of)
    book = _median_book(conn, market_id, book_since)
    funding_rate = _mean_funding(conn, market_id, funding_since)
    points_row = _points_program(conn, venue_id)
    weight_row = _pair_weight(conn, venue_id, symbol_canonical)
    rule_row = _execution_rule(conn, venue_id)
    dist_row = _latest_points_distribution(conn, venue_id)

    confidences = [points_row.confidence] if points_row else []
    verified_dates = [points_row.last_verified] if points_row else []
    if weight_row:
        confidences.append(weight_row.confidence)
        verified_dates.append(weight_row.last_verified)

    # Same-venue (two-account) routes largely fill against each other rather
    # than walking the public book -- damp the measured impact curve. See
    # SELF_MATCH_IMPACT_FACTOR / docs/scoring.md.
    damping = SELF_MATCH_IMPACT_FACTOR if is_self_match else 1.0

    def _damped(value) -> float | None:
        value = _f(value)
        return value * damping if value is not None else None

    return LegInputs(
        venue_slug=venue_slug,
        maker_bps=_f(maker_bps),
        taker_bps=_f(taker_bps),
        spread_bps=_f(book["spread_bps"]),
        impact_bps_10k=_damped(book["impact_bps_10k"]),
        impact_bps_50k=_damped(book["impact_bps_50k"]),
        impact_bps_100k=_damped(book["impact_bps_100k"]),
        depth_usd_10k=_f(book["depth_usd_10k"]),
        depth_usd_50k=_f(book["depth_usd_50k"]),
        depth_usd_100k=_f(book["depth_usd_100k"]),
        funding_rate_annualized_7d_mean=_f(funding_rate),
        points_per_usd_volume_estimate=(
            _f(points_row.points_per_usd_volume_estimate) if points_row else None
        ),
        pair_weight_multiplier=_f(weight_row.weight_multiplier) if weight_row else 1.0,
        maker_counts_for_points=rule_row.maker_counts_for_points if rule_row else None,
        taker_counts_for_points=rule_row.taker_counts_for_points if rule_row else None,
        maker_boost_multiplier=_f(rule_row.maker_boost_multiplier) if rule_row else 1.0,
        manual_confidence=weakest_confidence(confidences) if confidences else None,
        manual_last_verified=min(verified_dates) if verified_dates else None,
        points_distributed_week=_f(dist_row.points_distributed_week) if dist_row else None,
        total_points_outstanding=_f(dist_row.total_points_outstanding) if dist_row else None,
    )


def _score_and_write(
    conn,
    run_ts: datetime,
    symbol_canonical: str,
    long_venue_id: int,
    long_slug: str,
    long_market_id: int,
    short_venue_id: int,
    short_slug: str,
    short_market_id: int,
    params: ScoringParams,
    *,
    as_of: date,
    book_since: datetime,
    funding_since: datetime,
) -> None:
    is_self_match = long_venue_id == short_venue_id
    long_leg = _build_leg(
        conn,
        long_venue_id,
        long_slug,
        long_market_id,
        symbol_canonical,
        as_of=as_of,
        book_since=book_since,
        funding_since=funding_since,
        is_self_match=is_self_match,
    )
    short_leg = _build_leg(
        conn,
        short_venue_id,
        short_slug,
        short_market_id,
        symbol_canonical,
        as_of=as_of,
        book_since=book_since,
        funding_since=funding_since,
        is_self_match=is_self_match,
    )
    result = score_route(long_leg, short_leg, params)

    cost_breakdown = dict(result.cost_breakdown)
    if result.is_complete:
        cost_breakdown["risks"] = {**result.risks, "wash_risk": is_self_match}

    conn.execute(
        route_scores.insert().values(
            symbol_canonical=symbol_canonical,
            long_venue_id=long_venue_id,
            short_venue_id=short_venue_id,
            ts=run_ts,
            is_complete=result.is_complete,
            cost_per_point_usd=result.cost_per_point_usd,
            points_per_1m_volume=result.points_per_1m_volume,
            cost_breakdown_json=cost_breakdown,
            recommended_execution_json=result.recommended_execution,
            dilution_score=result.dilution_score,
            data_freshness_json=result.data_freshness,
        )
    )


def run_nightly(
    engine: Engine,
    params: ScoringParams = ScoringParams(),
    *,
    as_of: date | None = None,
) -> int:
    as_of = as_of or datetime.now(timezone.utc).date()
    run_ts = datetime.now(timezone.utc)
    book_since = run_ts - _BOOK_WINDOW
    funding_since = run_ts - _FUNDING_WINDOW

    written = 0
    with engine.begin() as conn:
        for symbol_canonical in _active_symbols(conn):
            listings = _venues_for_symbol(conn, symbol_canonical)

            for venue_id, slug, market_id in listings:
                _score_and_write(
                    conn,
                    run_ts,
                    symbol_canonical,
                    venue_id,
                    slug,
                    market_id,
                    venue_id,
                    slug,
                    market_id,
                    params,
                    as_of=as_of,
                    book_since=book_since,
                    funding_since=funding_since,
                )
                written += 1

            if len(listings) < 2:
                continue
            for long_venue_id, long_slug, long_market_id in listings:
                for short_venue_id, short_slug, short_market_id in listings:
                    if long_venue_id == short_venue_id:
                        continue
                    _score_and_write(
                        conn,
                        run_ts,
                        symbol_canonical,
                        long_venue_id,
                        long_slug,
                        long_market_id,
                        short_venue_id,
                        short_slug,
                        short_market_id,
                        params,
                        as_of=as_of,
                        book_since=book_since,
                        funding_since=funding_since,
                    )
                    written += 1
    return written
