from datetime import date

import pytest

from perpfarm.scoring.engine import (
    BREAKEVEN_GRID_USD,
    _impact_bps,
    find_breakeven_notional,
    score_route,
)
from perpfarm.scoring.types import LegInputs, ScoringParams


def _leg(**overrides) -> LegInputs:
    defaults = dict(
        venue_slug="venue",
        maker_bps=1.0,
        taker_bps=3.0,
        spread_bps=2.0,
        impact_bps_10k=1.0,
        impact_bps_50k=2.0,
        impact_bps_100k=4.0,
        depth_usd_10k=10_000.0,
        depth_usd_50k=50_000.0,
        depth_usd_100k=100_000.0,
        funding_rate_annualized_7d_mean=0.0,
        points_per_usd_volume_estimate=1.0,
        pair_weight_multiplier=1.0,
        maker_counts_for_points=True,
        taker_counts_for_points=True,
        maker_boost_multiplier=1.0,
        manual_confidence="confirmed",
        manual_last_verified=date(2026, 7, 1),
    )
    defaults.update(overrides)
    return LegInputs(**defaults)


def test_maker_rebate_venue_vs_taker_only_points_venue():
    """long venue: only maker fills earn points, and maker is free/rebated.
    short venue: only taker fills earn points, maker is deliberately pricier
    and earns nothing. The joint search should land on long=maker,
    short=taker -- each leg on the side that actually earns its points.
    """
    long_leg = _leg(
        venue_slug="venue_alpha",
        maker_bps=0.0,
        taker_bps=5.0,
        spread_bps=2.0,
        impact_bps_10k=1.0,
        impact_bps_50k=2.0,
        impact_bps_100k=4.0,
        funding_rate_annualized_7d_mean=0.05,
        points_per_usd_volume_estimate=1.0,
        maker_counts_for_points=True,
        taker_counts_for_points=False,
    )
    short_leg = _leg(
        venue_slug="venue_beta",
        maker_bps=5.0,
        taker_bps=0.5,
        spread_bps=1.0,
        impact_bps_10k=0.5,
        impact_bps_50k=1.0,
        impact_bps_100k=2.0,
        funding_rate_annualized_7d_mean=0.02,
        points_per_usd_volume_estimate=2.0,
        maker_counts_for_points=False,
        taker_counts_for_points=True,
    )

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.is_complete
    assert result.recommended_execution["long"]["order_type"] == "maker"
    assert result.recommended_execution["short"]["order_type"] == "taker"

    n = 10_000.0
    funding_cost = n * (24.0 / 8760.0) * (0.05 - 0.02)
    long_cost = 0.0  # 0 bps maker fee, no spread/impact cost on maker
    short_extra_bps = short_leg.spread_bps / 2.0 + short_leg.impact_bps_10k  # N == 10k bucket
    short_cost = 2.0 * n * short_leg.taker_bps / 10_000.0 + 2.0 * n * short_extra_bps / 10_000.0
    total_cost = long_cost + short_cost + funding_cost
    total_points = 2.0 * n * 1.0 + 2.0 * n * 2.0
    expected_cost_per_point = total_cost / total_points

    assert result.cost_per_point_usd == pytest.approx(expected_cost_per_point)


def test_negative_funding_delta_is_a_signed_credit():
    """Long leg's funding is cheaper than short leg's -- the differential is
    a net credit and must show up as a negative number, not be clamped."""
    long_leg = _leg(funding_rate_annualized_7d_mean=0.01)
    short_leg = _leg(funding_rate_annualized_7d_mean=0.09)

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.is_complete
    expected_funding = 10_000.0 * (24.0 / 8760.0) * (0.01 - 0.09)
    assert expected_funding < 0
    assert result.cost_breakdown["funding_cost_usd"] == pytest.approx(expected_funding)

    # flipping which venue is long/short flips the sign
    flipped = score_route(short_leg, long_leg, ScoringParams())
    assert flipped.cost_breakdown["funding_cost_usd"] == pytest.approx(-expected_funding)


def test_wide_spread_illiquid_pair_costs_more_than_tight_spread():
    """Force taker on both legs (maker doesn't count for points) and compare
    a thin/illiquid book against an identical route with a tight book."""

    def route_with_impact(bps_10k: float, bps_50k: float, bps_100k: float):
        leg_a = _leg(
            venue_slug="a",
            maker_counts_for_points=False,
            taker_counts_for_points=True,
            impact_bps_10k=bps_10k,
            impact_bps_50k=bps_50k,
            impact_bps_100k=bps_100k,
        )
        leg_b = _leg(
            venue_slug="b",
            maker_counts_for_points=False,
            taker_counts_for_points=True,
            impact_bps_10k=bps_10k,
            impact_bps_50k=bps_50k,
            impact_bps_100k=bps_100k,
        )
        return score_route(leg_a, leg_b, ScoringParams())

    tight = route_with_impact(0.5, 1.0, 2.0)
    illiquid = route_with_impact(25.0, 60.0, 140.0)

    assert tight.is_complete and illiquid.is_complete
    assert tight.recommended_execution["long"]["order_type"] == "taker"
    assert illiquid.cost_per_point_usd > tight.cost_per_point_usd


def test_missing_manual_data_degrades_gracefully_to_incomplete():
    """A leg with no points_programs row must never be silently scored with
    a guessed points rate -- the route is marked incomplete instead."""
    long_leg = _leg(venue_slug="venue_alpha")
    short_leg = _leg(
        venue_slug="venue_no_points_program",
        points_per_usd_volume_estimate=None,
    )

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.is_complete is False
    assert result.cost_per_point_usd is None
    assert result.points_per_1m_volume is None
    assert result.cost_breakdown == {}
    assert result.risks == {}
    assert any("points_programs" in reason for reason in result.data_freshness["incomplete_reasons"])


def test_cost_breakdown_carries_raw_leg_inputs_for_client_recompute():
    """The frontend's notional/hold-time sliders can't just rescale fee_usd/
    spread_cost_usd (impact is piecewise-linear in notional, not a fixed
    rate) -- they need the raw inputs to re-run the algorithm."""
    long_leg = _leg(venue_slug="venue_alpha")
    short_leg = _leg(venue_slug="venue_beta")

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.cost_breakdown["long_inputs"]["venue"] == "venue_alpha"
    assert result.cost_breakdown["long_inputs"]["maker_bps"] == long_leg.maker_bps
    assert result.cost_breakdown["long_inputs"]["impact_bps_50k"] == long_leg.impact_bps_50k
    assert result.cost_breakdown["long_inputs"]["depth_usd_50k"] == long_leg.depth_usd_50k
    assert result.cost_breakdown["short_inputs"]["venue"] == "venue_beta"
    assert result.cost_breakdown["short_inputs"]["taker_bps"] == short_leg.taker_bps


def test_dilution_score_is_display_only_and_never_blocks_completeness():
    long_leg = _leg(points_distributed_week=None, total_points_outstanding=None)
    short_leg = _leg(points_distributed_week=500_000.0, total_points_outstanding=10_000_000.0)

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.is_complete
    assert result.dilution_score == pytest.approx(0.05)


def test_no_points_possible_route_reports_null_cost_per_point_but_stays_complete():
    long_leg = _leg(maker_counts_for_points=False, taker_counts_for_points=False)
    short_leg = _leg(maker_counts_for_points=False, taker_counts_for_points=False)

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.is_complete
    assert result.cost_per_point_usd is None
    assert result.cost_breakdown["total_points"] == 0


def test_custom_notional_and_hold_time_scale_the_result():
    long_leg = _leg()
    short_leg = _leg(venue_slug="other")

    small = score_route(long_leg, short_leg, ScoringParams(notional_usd=1_000.0, hold_hours=1.0))
    large = score_route(long_leg, short_leg, ScoringParams(notional_usd=100_000.0, hold_hours=1.0))

    assert small.is_complete and large.is_complete
    # points_per_1m_volume is a rate and must be notional-invariant
    assert small.points_per_1m_volume == pytest.approx(large.points_per_1m_volume)


def test_impact_bps_interpolates_between_buckets():
    """Unit-level: exercise the interpolation directly rather than through
    score_route's joint optimizer, which may route around a leg entirely if
    a cheaper combo exists -- see test_beyond_measured_depth_flows_into_risks
    below for that joint-optimizer interaction."""
    leg = _leg(impact_bps_10k=1.0, impact_bps_50k=5.0, impact_bps_100k=9.0)

    below_first_bucket_bps, below_beyond = _impact_bps(leg, 5_000.0)
    assert below_beyond is False
    assert below_first_bucket_bps == pytest.approx(1.0)

    midpoint_bps, mid_beyond = _impact_bps(leg, 30_000.0)  # halfway 10k -> 50k
    assert mid_beyond is False
    assert midpoint_bps == pytest.approx(3.0)

    clamped_bps, clamped_beyond = _impact_bps(leg, 250_000.0)
    assert clamped_beyond is True
    assert clamped_bps == pytest.approx(9.0)  # clamped to the 100k bucket value


def test_beyond_measured_depth_flows_into_risks_when_taker_is_optimal():
    """The short leg never earns points at all (neither order type), so
    every viable (points > 0) combo requires long=taker -- there's no
    cheaper maker escape hatch that still earns points, forcing the clamp
    to actually surface in the chosen combo."""
    leg = _leg(
        maker_counts_for_points=False,
        taker_counts_for_points=True,
        spread_bps=0.0,
        impact_bps_10k=1.0,
        impact_bps_50k=5.0,
        impact_bps_100k=9.0,
    )
    other = _leg(
        venue_slug="other",
        maker_counts_for_points=False,
        taker_counts_for_points=False,
    )

    result = score_route(leg, other, ScoringParams(notional_usd=250_000.0))

    assert result.is_complete
    assert result.recommended_execution["long"]["order_type"] == "taker"
    assert result.cost_breakdown["long"]["beyond_measured_depth"] is True
    assert result.risks["beyond_measured_depth"] is True


def test_missing_impact_buckets_degrade_to_flag_not_incomplete():
    """Impact buckets were never sampled, but spread_bps exists -- route
    stays complete (spread alone still prices the taker leg), impact
    defaults to zero, and beyond_measured_depth signals the gap."""
    long_leg = _leg(
        maker_counts_for_points=False,
        taker_counts_for_points=True,
        impact_bps_10k=None,
        impact_bps_50k=None,
        impact_bps_100k=None,
    )
    short_leg = _leg(venue_slug="other", maker_counts_for_points=False, taker_counts_for_points=True)

    result = score_route(long_leg, short_leg, ScoringParams())

    assert result.is_complete
    assert result.cost_breakdown["long"]["beyond_measured_depth"] is True
    assert result.risks["beyond_measured_depth"] is True


def test_fill_risk_flags_thin_book_on_chosen_maker_leg():
    """depth_usd_50k far below 4x notional on a leg that ends up maker."""
    thin_leg = _leg(
        venue_slug="thin",
        maker_bps=-5.0,  # heavy rebate so maker clearly wins the 2x2 search
        depth_usd_50k=1_000.0,  # thin relative to the $10k default notional
    )
    other_leg = _leg(venue_slug="other")

    result = score_route(thin_leg, other_leg, ScoringParams())

    assert result.is_complete
    assert result.recommended_execution["long"]["order_type"] == "maker"
    assert result.cost_breakdown["long"]["fill_risk"] is True
    assert result.risks["fill_risk"] is True


def test_fill_risk_is_false_when_depth_data_is_missing():
    """Never flag a risk we can't actually measure."""
    leg = _leg(maker_bps=-5.0, depth_usd_50k=None)
    other = _leg(venue_slug="other")

    result = score_route(leg, other, ScoringParams())

    assert result.is_complete
    assert result.cost_breakdown["long"]["fill_risk"] is False


def test_find_breakeven_notional_returns_largest_qualifying_grid_point():
    """Impact grows sharply past $10k on one leg, so cost_per_point should
    cross the threshold somewhere in the grid."""
    leg = _leg(
        maker_counts_for_points=False,
        taker_counts_for_points=True,
        spread_bps=0.0,
        impact_bps_10k=0.1,
        impact_bps_50k=50.0,
        impact_bps_100k=200.0,
    )
    other = _leg(venue_slug="other", maker_counts_for_points=False, taker_counts_for_points=True)
    params = ScoringParams()

    cheap_at_10k = score_route(leg, other, ScoringParams(notional_usd=10_000.0))
    threshold = cheap_at_10k.cost_per_point_usd * 1.5  # generous enough to admit the 10k point

    breakeven = find_breakeven_notional(leg, other, params, threshold, grid=BREAKEVEN_GRID_USD)

    assert breakeven in BREAKEVEN_GRID_USD
    # every grid point above the returned one must fail the threshold
    for n in BREAKEVEN_GRID_USD:
        if n <= breakeven:
            continue
        result = score_route(leg, other, ScoringParams(notional_usd=n))
        assert result.cost_per_point_usd is None or result.cost_per_point_usd > threshold


def test_find_breakeven_notional_returns_none_when_nothing_qualifies():
    leg = _leg()
    other = _leg(venue_slug="other")

    breakeven = find_breakeven_notional(leg, other, ScoringParams(), threshold=-1_000_000.0)

    assert breakeven is None
