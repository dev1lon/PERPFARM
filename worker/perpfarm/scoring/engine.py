"""Pure scoring functions -- see docs/scoring.md for the full spec.

No I/O, no DB, no system clock. Callers (worker/perpfarm/jobs/nightly.py, the
print-routes CLI, and unit tests) are responsible for assembling `LegInputs`
from whatever source they use -- including resolving the effective fee
schedule as of a given date, and damping impact_bps_* for same-venue
(self-match) routes -- both happen before `score_route` is called, not
inside it. This module has no notion of "same venue".
"""

from perpfarm.scoring.types import (
    FILL_RISK_DEPTH_MULTIPLIER,
    LegInputs,
    RouteScoreResult,
    ScoringParams,
    weakest_confidence,
)

_ORDER_TYPES = ("maker", "taker")
_HOURS_PER_YEAR = 8760.0
BREAKEVEN_GRID_USD: tuple[float, ...] = (1_000.0, 2_000.0, 5_000.0, 10_000.0, 25_000.0, 50_000.0)
_IMPACT_MAX_BUCKET_USD = 100_000.0


def _impact_bps(leg: LegInputs, notional_usd: float) -> tuple[float, bool]:
    """Returns (impact_bps, beyond_measured_depth). The second value is True
    when we have no real measurement to go on -- either the buckets were
    never sampled, or notional_usd exceeds the largest measured bucket -- in
    which case impact_bps is a clamped/zeroed estimate, not a real one."""
    buckets = [
        (10_000.0, leg.impact_bps_10k),
        (50_000.0, leg.impact_bps_50k),
        (100_000.0, leg.impact_bps_100k),
    ]
    if not all(v is not None for _, v in buckets):
        return 0.0, True

    xs = [x for x, _ in buckets]
    ys = [y for _, y in buckets]
    if notional_usd >= _IMPACT_MAX_BUCKET_USD:
        return ys[-1], True
    if notional_usd <= xs[0]:
        return ys[0], False
    for i in range(len(xs) - 1):
        if xs[i] <= notional_usd <= xs[i + 1]:
            t = (notional_usd - xs[i]) / (xs[i + 1] - xs[i])
            return ys[i] + t * (ys[i + 1] - ys[i]), False
    return ys[-1], False  # unreachable given the bounds above


def _fill_risk(leg: LegInputs, notional_usd: float) -> bool:
    """Maker-only: resting size this large may not fill if the book is thin."""
    if leg.depth_usd_50k is None:
        return False
    return leg.depth_usd_50k < FILL_RISK_DEPTH_MULTIPLIER * notional_usd


def _missing_inputs(leg: LegInputs, *, leg_name: str) -> list[str]:
    reasons = []
    if leg.maker_bps is None:
        reasons.append(f"{leg_name}: missing maker fee (fee_schedules)")
    if leg.taker_bps is None:
        reasons.append(f"{leg_name}: missing taker fee (fee_schedules)")
    if leg.funding_rate_annualized_7d_mean is None:
        reasons.append(f"{leg_name}: missing 7d funding rate (funding_snapshots)")
    if leg.points_per_usd_volume_estimate is None:
        reasons.append(f"{leg_name}: missing points program data (points_programs)")
    if leg.maker_counts_for_points is None or leg.taker_counts_for_points is None:
        reasons.append(f"{leg_name}: missing execution rules (execution_rules)")
    if leg.spread_bps is None:
        reasons.append(f"{leg_name}: missing spread data (book_snapshots)")
    return reasons


def _fee_bps(leg: LegInputs, order_type: str) -> float:
    return leg.maker_bps if order_type == "maker" else leg.taker_bps


def _extra_cost_bps(leg: LegInputs, order_type: str, notional_usd: float) -> tuple[float, bool]:
    """Spread + price-impact cost on top of the fee. Zero for maker (assumed
    fill at mid). Returns (bps, beyond_measured_depth)."""
    if order_type == "maker":
        return 0.0, False
    impact, beyond = _impact_bps(leg, notional_usd)
    spread_half = (leg.spread_bps or 0.0) / 2.0
    return spread_half + impact, beyond


def _leg_points_single_fill(leg: LegInputs, order_type: str, notional_usd: float) -> float:
    counts = leg.maker_counts_for_points if order_type == "maker" else leg.taker_counts_for_points
    if not counts:
        return 0.0
    boost = leg.maker_boost_multiplier if order_type == "maker" else 1.0
    points_per_usd = leg.points_per_usd_volume_estimate or 0.0
    return notional_usd * points_per_usd * leg.pair_weight_multiplier * boost


def _leg_round_trip(leg: LegInputs, order_type: str, notional_usd: float) -> dict:
    extra_bps, beyond_measured_depth = _extra_cost_bps(leg, order_type, notional_usd)
    fee_usd = 2.0 * notional_usd * _fee_bps(leg, order_type) / 10_000.0
    spread_cost_usd = 2.0 * notional_usd * extra_bps / 10_000.0
    points = 2.0 * _leg_points_single_fill(leg, order_type, notional_usd)
    fill_risk = _fill_risk(leg, notional_usd) if order_type == "maker" else False
    return {
        "order_type": order_type,
        "fee_usd": fee_usd,
        "spread_cost_usd": spread_cost_usd,
        "points": points,
        "fill_risk": fill_risk,
        "beyond_measured_depth": beyond_measured_depth,
    }


def _funding_cost_usd(
    long_leg: LegInputs, short_leg: LegInputs, notional_usd: float, hold_hours: float
) -> float:
    prorate = hold_hours / _HOURS_PER_YEAR
    long_rate = long_leg.funding_rate_annualized_7d_mean or 0.0
    short_rate = short_leg.funding_rate_annualized_7d_mean or 0.0
    return notional_usd * prorate * (long_rate - short_rate)


def _leg_why(chosen: dict, alt: dict) -> str:
    order_type = chosen["order_type"]
    chosen_counts = chosen["points"] > 0
    alt_counts = alt["points"] > 0
    if chosen_counts and not alt_counts:
        return f"{order_type}: only {order_type} fills earn points on this venue."
    if not chosen_counts and alt_counts:
        return (
            f"{order_type}: chosen anyway -- switching to {alt['order_type']} would earn "
            "points here but raises the route's blended cost/point more than it helps."
        )
    if chosen_counts and alt_counts:
        return f"{order_type}: both fill types earn points here; {order_type} has the lower net cost."
    return f"{order_type}: neither fill type earns points on this venue; picked the lower-cost side."


def _leg_inputs_snapshot(leg: LegInputs) -> dict:
    return {
        "venue": leg.venue_slug,
        "maker_bps": leg.maker_bps,
        "taker_bps": leg.taker_bps,
        "spread_bps": leg.spread_bps,
        "impact_bps_10k": leg.impact_bps_10k,
        "impact_bps_50k": leg.impact_bps_50k,
        "impact_bps_100k": leg.impact_bps_100k,
        "depth_usd_10k": leg.depth_usd_10k,
        "depth_usd_50k": leg.depth_usd_50k,
        "depth_usd_100k": leg.depth_usd_100k,
        "funding_rate_annualized_7d_mean": leg.funding_rate_annualized_7d_mean,
        "points_per_usd_volume_estimate": leg.points_per_usd_volume_estimate,
        "pair_weight_multiplier": leg.pair_weight_multiplier,
        "maker_counts_for_points": leg.maker_counts_for_points,
        "taker_counts_for_points": leg.taker_counts_for_points,
        "maker_boost_multiplier": leg.maker_boost_multiplier,
    }


def _dilution_score(long_leg: LegInputs, short_leg: LegInputs) -> float | None:
    ratios = []
    for leg in (long_leg, short_leg):
        if leg.points_distributed_week is not None and leg.total_points_outstanding:
            ratios.append(leg.points_distributed_week / leg.total_points_outstanding)
    return max(ratios) if ratios else None


def score_route(
    long_leg: LegInputs,
    short_leg: LegInputs,
    params: ScoringParams,
) -> RouteScoreResult:
    reasons = _missing_inputs(long_leg, leg_name="long") + _missing_inputs(short_leg, leg_name="short")
    confidence = weakest_confidence([long_leg.manual_confidence, short_leg.manual_confidence])
    verified_dates = [
        d for d in (long_leg.manual_last_verified, short_leg.manual_last_verified) if d is not None
    ]
    data_freshness = {
        "oldest_manual_date": min(verified_dates).isoformat() if verified_dates else None,
        "min_confidence": confidence,
        "incomplete_reasons": reasons,
    }
    dilution_score = _dilution_score(long_leg, short_leg)

    if reasons:
        return RouteScoreResult(
            is_complete=False,
            cost_per_point_usd=None,
            points_per_1m_volume=None,
            weekly_cost_usd=None,
            dilution_score=dilution_score,
            cost_breakdown={},
            recommended_execution={},
            data_freshness=data_freshness,
            risks={},
        )

    notional = params.notional_usd
    hold_hours = params.hold_hours
    funding_cost = _funding_cost_usd(long_leg, short_leg, notional, hold_hours)

    combos = []
    for long_type in _ORDER_TYPES:
        for short_type in _ORDER_TYPES:
            long_rt = _leg_round_trip(long_leg, long_type, notional)
            short_rt = _leg_round_trip(short_leg, short_type, notional)
            total_points = long_rt["points"] + short_rt["points"]
            total_cost = (
                long_rt["fee_usd"]
                + long_rt["spread_cost_usd"]
                + short_rt["fee_usd"]
                + short_rt["spread_cost_usd"]
                + funding_cost
            )
            cost_per_point = total_cost / total_points if total_points > 0 else None
            combos.append(
                {
                    "long_type": long_type,
                    "short_type": short_type,
                    "long": long_rt,
                    "short": short_rt,
                    "total_points": total_points,
                    "total_cost": total_cost,
                    "cost_per_point": cost_per_point,
                }
            )

    viable = [c for c in combos if c["cost_per_point"] is not None]
    best = (
        min(viable, key=lambda c: (c["cost_per_point"], c["total_cost"]))
        if viable
        else min(combos, key=lambda c: c["total_cost"])
    )

    alt_long_type = "taker" if best["long_type"] == "maker" else "maker"
    alt_short_type = "taker" if best["short_type"] == "maker" else "maker"
    alt_long_rt = _leg_round_trip(long_leg, alt_long_type, notional)
    alt_short_rt = _leg_round_trip(short_leg, alt_short_type, notional)

    recommended_execution = {
        "long": {"order_type": best["long_type"], "why": _leg_why(best["long"], alt_long_rt)},
        "short": {"order_type": best["short_type"], "why": _leg_why(best["short"], alt_short_rt)},
    }

    total_volume_usd = 4.0 * notional
    points_per_1m_volume = (
        (best["total_points"] / total_volume_usd) * 1_000_000.0 if total_volume_usd > 0 else None
    )
    weekly_cost_usd = best["total_cost"] * params.effective_round_trips_per_week()

    cost_breakdown = {
        "notional_usd": notional,
        "hold_hours": hold_hours,
        "long": {"venue": long_leg.venue_slug, **best["long"]},
        "short": {"venue": short_leg.venue_slug, **best["short"]},
        "funding_cost_usd": funding_cost,
        "total_cost_usd": best["total_cost"],
        "total_points": best["total_points"],
        # raw leg inputs, for the client-side notional/hold-time recompute
        # (see docs/scoring.md) -- rescaling the numbers above is not
        # sufficient because impact is a piecewise-linear function of
        # notional, not a fixed rate.
        "long_inputs": _leg_inputs_snapshot(long_leg),
        "short_inputs": _leg_inputs_snapshot(short_leg),
    }

    risks = {
        "fill_risk": best["long"]["fill_risk"] or best["short"]["fill_risk"],
        "beyond_measured_depth": best["long"]["beyond_measured_depth"]
        or best["short"]["beyond_measured_depth"],
    }

    return RouteScoreResult(
        is_complete=True,
        cost_per_point_usd=best["cost_per_point"],
        points_per_1m_volume=points_per_1m_volume,
        weekly_cost_usd=weekly_cost_usd,
        dilution_score=dilution_score,
        cost_breakdown=cost_breakdown,
        recommended_execution=recommended_execution,
        data_freshness=data_freshness,
        risks=risks,
    )


def find_breakeven_notional(
    long_leg: LegInputs,
    short_leg: LegInputs,
    params: ScoringParams,
    threshold: float,
    grid: tuple[float, ...] = BREAKEVEN_GRID_USD,
) -> float | None:
    """Largest notional in `grid` where cost_per_point stays <= `threshold`,
    holding hold_hours (and round_trips_per_week) fixed. None if the route is
    incomplete/never earns points, or no grid point qualifies.

    `threshold` is the caller's job to pick (e.g. the venue's average
    cost_per_point across its routes at the default notional) -- this
    function has no notion of "venue average", it only evaluates the grid.
    """
    best: float | None = None
    for n in grid:
        grid_params = ScoringParams(
            notional_usd=n,
            hold_hours=params.hold_hours,
            round_trips_per_week=params.round_trips_per_week,
        )
        result = score_route(long_leg, short_leg, grid_params)
        if not result.is_complete or result.cost_per_point_usd is None:
            continue
        if result.cost_per_point_usd <= threshold:
            best = n
    return best
