import re

import pytest

from perpfarm.adapters.registry import FIXTURE_SLUGS
from perpfarm.jobs import hedge_recommendations as job
from perpfarm.jobs.hedge_recommendations import Market, _compute, _curve_impact_bps, _displayed_oi


# A Variational-shaped curve: the venue publishes 1k / 100k / 1m and nothing in
# between, so a $10k fill sits inside a 100x gap.
VARIATIONAL_CURVE = {
    "reference_price": 100.0,
    "points": [
        {"notional_usd": 0, "bid": 99.99, "ask": 100.01},
        # Displacement from the touch: 0.01 at $1k, 0.10 at $100k -- ten times
        # the move for a hundred times the size.
        {"notional_usd": 1_000, "bid": 99.98, "ask": 100.02},
        {"notional_usd": 100_000, "bid": 99.89, "ask": 100.11},
    ],
}


def market(*, venue_id: int, slug: str, symbol: str, maker: float, taker: float) -> Market:
    return Market(
        venue_id=venue_id,
        slug=slug,
        symbol=symbol,
        spread_bps=1,
        impact_10k=1,
        impact_50k=1,
        impact_100k=1,
        quote_curve=None,
        volume_24h_usd=1_000_000,
        open_interest_usd=1_000_000,
        maker_bps=maker,
        taker_bps=taker,
    )


def test_hourly_recommendation_compares_self_and_each_cross_venue():
    # Variational's self-match is cheapest, while TxFlow gets a lower cost by
    # resting its limit on TxFlow and crossing Variational's free taker book.
    recommendations = _compute(
        [
            market(venue_id=1, slug="variational", symbol="BTC", maker=0, taker=0),
            market(venue_id=2, slug="txflow", symbol="BTC", maker=1.425, taker=4.275),
        ]
    )

    assert recommendations[1][0] == 1
    assert recommendations[2][0] == 1
    assert recommendations[1][1] < recommendations[2][1]


def test_oi_display_factor_is_per_protocol_not_global():
    variational = market(venue_id=1, slug="variational", symbol="BTC", maker=0, taker=0)
    txflow = market(venue_id=2, slug="txflow", symbol="BTC", maker=1.425, taker=4.275)

    assert _displayed_oi(variational) == 2_000_000
    assert _displayed_oi(txflow) == 1_000_000


def test_a_maker_rebate_beats_every_real_route_and_goes_negative():
    """Why a fixture venue had to be excluded at the source, not filtered later.

    `venue_alpha`'s fixture schedule carries a NEGATIVE 2 bps maker fee. Resting
    its limit legs against Variational's free taker book prices the cycle BELOW
    zero, and `_compute` ranks by ascending signed cost -- so it does not merely
    compete, it cannot lose. This reproduces the exact card that shipped:
    "Variational x venue_alpha", badged as the lowest-cost route.

    Any venue that reaches this function is trusted completely, which is what
    makes the SQL-level exclusion the real safeguard rather than a tidy-up.
    """
    recommendations = _compute(
        [
            market(venue_id=1, slug="variational", symbol="BTC", maker=0, taker=0),
            market(venue_id=2, slug="txflow", symbol="BTC", maker=1.425, taker=4.275),
            market(venue_id=14, slug="venue_alpha", symbol="BTC", maker=-2.0, taker=5.0),
        ]
    )

    partner, cost = recommendations[1]
    assert partner == 14
    assert cost < 0
    # Variational's own self-match costs $15 at the reference volume; the
    # fixture wins by being paid to trade, not by being cheaper to execute.
    assert cost < _compute([market(venue_id=1, slug="variational", symbol="BTC", maker=0, taker=0)])[1][1]


def test_a_wide_quote_gap_is_fitted_as_a_power_law_not_a_straight_line():
    """The website bends this curve; the worker used to draw a line through it.

    Both anchors are measured, so the exponent comes from the data:
    displacement is 0.01 at $1k and 0.10 at $100k, i.e. it grows 10x while size
    grows 100x, so k = 0.5 and the fill at $10k displaces 0.01 * 10^0.5.
    Straight-line interpolation would put it near 0.019 -- roughly half.
    """
    expected_displacement = 0.01 * 10**0.5
    expected_bps = expected_displacement / 100.0 * 10_000

    impact = _curve_impact_bps(VARIATIONAL_CURVE, 10_000.0, cheapest=True)

    assert impact == pytest.approx(expected_bps, rel=1e-9)
    linear_displacement = 0.01 + (0.10 - 0.01) * (10_000 - 1_000) / (100_000 - 1_000)
    assert impact > linear_displacement / 100.0 * 10_000


def test_a_narrow_quote_gap_stays_linear():
    """TxFlow's ladder is closely spaced, where the power fit measured worse."""
    curve = {
        "reference_price": 100.0,
        "points": [
            {"notional_usd": 0, "bid": 99.99, "ask": 100.01},
            {"notional_usd": 10_000, "bid": 99.98, "ask": 100.02},
            {"notional_usd": 20_000, "bid": 99.96, "ask": 100.04},
        ],
    }

    # Halfway between the $10k and $20k anchors: the straight-line answer.
    impact = _curve_impact_bps(curve, 15_000.0, cheapest=True)

    midpoint_displacement = (0.01 + 0.03) / 2
    assert impact == pytest.approx(midpoint_displacement / 100.0 * 10_000, rel=1e-9)


def test_the_first_segment_stays_linear_because_the_touch_has_no_displacement():
    """A power fit needs two positive displacements; at size 0 there are none."""
    impact = _curve_impact_bps(VARIATIONAL_CURVE, 500.0, cheapest=True)

    assert impact == pytest.approx(0.005 / 100.0 * 10_000, rel=1e-9)


def test_recommendation_query_excludes_fixture_venues_and_stale_snapshots():
    """The guarantees live in SQL, so assert on the SQL the job actually runs.

    A unit test over `_compute` cannot catch either regression: both fixture
    venues and weeks-old snapshots enter through the query, and the previous
    version of this file passed while `venue_alpha` was on the live site.
    """
    sql = " ".join(str(job.run_hedge_recommendations.__doc__ or "").split())
    source = job.__file__
    with open(source, encoding="utf-8") as handle:
        text = handle.read()

    assert "v.slug <> ALL(:fixture_slugs)" in text, sql
    assert {"venue_alpha", "venue_beta"} <= set(FIXTURE_SLUGS)
    # Both snapshot CTEs must be time-bounded: `DISTINCT ON ... ORDER BY ts
    # DESC` alone returns the newest row that exists, however old it is.
    assert len(re.findall(r"ts >= now\(\) - interval '2 days'", text)) == 2
