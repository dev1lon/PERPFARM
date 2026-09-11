"""Pure calculations for the Variational public quote-curve adapter."""

import pytest

from perpfarm.adapters.variational import (
    VariationalAdapter,
    _funding_from_annualized_rate,
    _quote_curve_from_listing,
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


def test_quote_curve_keeps_every_native_omni_quote_size():
    curve = _quote_curve_from_listing(
        {
            "mark_price": "100",
            "quotes": {
                "base": {"bid": "99.9", "ask": "100.1"},
                "size_1k": {"bid": "99.8", "ask": "100.2"},
                "size_100k": {"bid": "99", "ask": "101"},
                "size_1m": {"bid": "95", "ask": "105"},
            },
        }
    )

    assert curve is not None
    assert [point.notional_usd for point in curve.points] == [0, 1_000, 100_000, 1_000_000]


def test_quote_curve_impact_requires_base_and_100k_quotes():
    impact = _quote_curve_impact_bps(
        {"mark_price": "100", "quotes": {"size_1k": {"bid": "99", "ask": "101"}}}
    )
    assert impact == {
        "impact_bps_10k": None,
        "impact_bps_50k": None,
        "impact_bps_100k": None,
    }


def test_a_swap_in_its_daily_break_stays_listed():
    """Omni drops a swap's quotes from 17:00 to 18:00 ET but keeps its mark.

    Retiring it for that hour emptied every swap route on the site until the
    next run; only a listing with no quote AND no mark is gone.
    """
    adapter = VariationalAdapter()
    adapter._stats = {
        "listings": [
            {"ticker": "XAU", "mark_price": "4324.3", "quotes": {"base": {"bid": "4323.2", "ask": "4324.6"}}},
            {"ticker": "XAUS", "mark_price": "4317.4"},
            {"ticker": "GONE", "mark_price": "0"},
            {"ticker": "NOMARK"},
        ]
    }

    active = {market.symbol: market.is_active for market in adapter.get_markets()}

    assert active == {"XAU": True, "XAUS": True, "GONE": False, "NOMARK": False}


def test_annualized_funding_is_converted_to_a_per_interval_raw_rate():
    funding = _funding_from_annualized_rate(0.1095, 4.0)
    assert funding.funding_rate_annualized == pytest.approx(0.1095)
    assert funding.funding_rate_raw == pytest.approx(0.1095 * 4 / 8760)
