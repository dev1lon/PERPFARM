"""Pure calculations for the Variational public quote-curve adapter."""

import pytest

from perpfarm.adapters.variational import (
    _funding_from_annualized_rate,
    _quote_curve_impact_bps,
    _quote_pair,
)


def test_quote_pair_rejects_missing_or_non_positive_prices():
    assert _quote_pair(None) is None
    assert _quote_pair({"bid": "0", "ask": "1"}) is None
    assert _quote_pair({"bid": "99.5", "ask": "100.5"}) == (99.5, 100.5)


def test_quote_curve_impact_measures_extra_cost_beyond_base_quote():
    listing = {
        "mark_price": "100",
        "quotes": {
            "base": {"bid": "99.9", "ask": "100.1"},
            "size_1k": {"bid": "99.9", "ask": "100.1"},
            "size_100k": {"bid": "99", "ask": "101"},
        },
    }

    impact = _quote_curve_impact_bps(listing)

    # At 100k the execution quote is 90 bps worse than the base quote on
    # either side. The $10k/$50k estimates linearly interpolate that curve.
    assert impact["impact_bps_10k"] == pytest.approx(90 * 9 / 99)
    assert impact["impact_bps_50k"] == pytest.approx(90 * 49 / 99)
    assert impact["impact_bps_100k"] == pytest.approx(90)


def test_quote_curve_impact_requires_base_and_100k_quotes():
    impact = _quote_curve_impact_bps(
        {"mark_price": "100", "quotes": {"size_1k": {"bid": "99", "ask": "101"}}}
    )
    assert impact == {
        "impact_bps_10k": None,
        "impact_bps_50k": None,
        "impact_bps_100k": None,
    }


def test_annualized_funding_is_converted_to_a_per_interval_raw_rate():
    funding = _funding_from_annualized_rate(0.1095, 4.0)
    assert funding.funding_rate_annualized == pytest.approx(0.1095)
    assert funding.funding_rate_raw == pytest.approx(0.1095 * 4 / 8760)
