"""Unit tests for the Hibachi adapter's pure logic (impact walk, parsing).

Network methods are NOT exercised here -- the live API was verified manually
when the adapter was written (see the module docstring's verification trail),
and jobs isolate per-market network failures at runtime.
"""

import pytest

from perpfarm.adapters.hibachi import _impact_from_book, _parse_levels, _walk_side


def test_walk_side_fills_within_first_level():
    # $50 into a level holding 1.0 @ $100 = $100 of notional
    vwap, reachable = _walk_side([(100.0, 1.0)], 50.0)
    assert vwap == pytest.approx(100.0)
    assert reachable == pytest.approx(50.0)


def test_walk_side_spans_levels_with_vwap():
    # $150 = all of level 1 ($100 @ 100) + $50 of level 2 (@ 200)
    vwap, reachable = _walk_side([(100.0, 1.0), (200.0, 1.0)], 150.0)
    filled_qty = 1.0 + 50.0 / 200.0
    assert vwap == pytest.approx(150.0 / filled_qty)
    assert reachable == pytest.approx(150.0)


def test_walk_side_thin_book_caps_reachable():
    vwap, reachable = _walk_side([(100.0, 1.0)], 500.0)
    assert vwap == pytest.approx(100.0)
    assert reachable == pytest.approx(100.0)  # only $100 existed


def test_walk_side_empty_returns_none():
    assert _walk_side([], 10_000.0) is None


def test_impact_from_book_symmetric_book():
    # mid = 100; asks walk to 101, bids to 99 for the 10k bucket
    asks = [(101.0, 1_000.0)]
    bids = [(99.0, 1_000.0)]
    impact = _impact_from_book(asks, bids, 100.0)
    # both sides 100 bps from mid -> average 100 bps
    assert impact["impact_bps_10k"] == pytest.approx(100.0)
    assert impact["depth_usd_10k"] == pytest.approx(10_000.0)


def test_impact_from_book_empty_side_yields_none():
    impact = _impact_from_book([], [(99.0, 1_000.0)], 100.0)
    assert impact["impact_bps_10k"] is None
    assert impact["depth_usd_10k"] is None


def test_parse_levels_reads_price_quantity_strings():
    side = {"levels": [{"price": "64132.5", "quantity": "0.0389000000"}]}
    assert _parse_levels(side) == [(64132.5, 0.0389)]


def test_parse_levels_handles_null_side():
    # A closed FX/metals market (weekend) returns a null side, not {} -- must
    # yield no levels instead of crashing on None.get(...). Regression for the
    # sync-snapshots "'NoneType' object has no attribute 'get'" failure.
    assert _parse_levels(None) == []
    assert _parse_levels({}) == []
