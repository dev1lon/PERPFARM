from pathlib import Path

from perpfarm.scoring.fixture_loader import load_common_routes
from perpfarm.scoring.types import SELF_MATCH_IMPACT_FACTOR

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "data" / "fixtures"
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "manual"


def _routes():
    return load_common_routes(FIXTURES_DIR, DATA_DIR)


def test_same_venue_routes_are_included_alongside_cross_venue():
    routes = _routes()
    same_venue = [r for r in routes if r[1] == r[2]]
    cross_venue = [r for r in routes if r[1] != r[2]]

    assert same_venue, "expected at least one same-venue (self-match) route"
    assert cross_venue, "expected at least one cross-venue route"
    # one self-match route per (venue, symbol) it lists
    assert ("BTC", "venue_alpha", "venue_alpha") in [(c, ls, ss) for c, ls, ss, _, _ in same_venue]
    assert ("PEPE", "venue_beta", "venue_beta") in [(c, ls, ss) for c, ls, ss, _, _ in same_venue]


def test_same_venue_routes_damp_impact_but_not_cross_venue():
    routes = _routes()
    by_key = {(c, ls, ss): (ll, sl) for c, ls, ss, ll, sl in routes}

    same_venue_leg, _ = by_key[("BTC", "venue_alpha", "venue_alpha")]
    cross_venue_leg, _ = by_key[("BTC", "venue_alpha", "venue_beta")]

    # cross-venue leg carries the raw fixture impact numbers unmodified
    assert cross_venue_leg.impact_bps_10k == 0.5

    # same-venue leg is damped by SELF_MATCH_IMPACT_FACTOR relative to the
    # same raw fixture number
    assert same_venue_leg.impact_bps_10k == cross_venue_leg.impact_bps_10k * SELF_MATCH_IMPACT_FACTOR


def test_same_venue_route_legs_share_venue_slug():
    routes = _routes()
    same_venue = [(ll, sl) for c, ls, ss, ll, sl in routes if ls == ss]

    for long_leg, short_leg in same_venue:
        assert long_leg.venue_slug == short_leg.venue_slug
