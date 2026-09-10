"""Unit conventions for the trade.xyz adapter.

Same Hyperliquid HIP-3 feed as Entropy, so the same two conversions matter --
funding as a fraction per hour, open interest in base units -- plus the one
thing specific to this venue: which fee schedule each market is charged.

Payloads below were recorded from api.hyperliquid.xyz on 2026-09-10 for the
`xyz` dex, trimmed to the fields the adapter reads.
"""

import pytest

from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.tradexyz import GROWTH_MODE_CLASS, TradexyzAdapter, canonical_symbol

UNIVERSE = [
    {"name": "xyz:TSLA", "szDecimals": 3, "growthMode": "enabled"},
    {"name": "xyz:GOLD", "szDecimals": 4},
    {"name": "xyz:VIX", "szDecimals": 2, "isDelisted": True},
]
CONTEXTS = [
    {"funding": "0.00000625", "openInterest": "116253.184", "dayNtlVlm": "15974695.50", "markPx": "366.41"},
    {"funding": "0.000012879", "openInterest": "75488.171", "dayNtlVlm": "77805605.87", "markPx": "4361.5"},
    {"funding": "0.0", "openInterest": "0.0", "dayNtlVlm": "0.0", "markPx": "18.2"},
]
BOOK = {
    "levels": [
        [{"px": "366.32", "sz": "40.0"}, {"px": "366.20", "sz": "10.0"}],
        [{"px": "366.38", "sz": "35.0"}, {"px": "366.50", "sz": "10.0"}],
    ]
}


class _StubAdapter(TradexyzAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def _post(self, payload):  # type: ignore[override]
        if payload.get("type") == "metaAndAssetCtxs":
            assert payload.get("dex") == "xyz"
            return [{"universe": UNIVERSE}, CONTEXTS]
        if payload.get("type") == "l2Book":
            return BOOK
        raise AssertionError(f"unexpected request {payload}")


def test_the_dex_prefix_is_not_part_of_the_instrument():
    assert canonical_symbol("xyz:TSLA") == "TSLA"
    assert canonical_symbol("TSLA") == "TSLA"


def test_growth_mode_markets_carry_their_fee_schedule():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    # Growth mode is a tenth of the standard fee, so it has to reach the price.
    assert markets["xyz:TSLA"].asset_class == GROWTH_MODE_CLASS
    # A market that does not say growth mode pays the standard schedule.
    assert markets["xyz:GOLD"].asset_class is None


def test_delisted_markets_are_listed_but_not_collected():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert markets["xyz:VIX"].is_active is False
    assert markets["xyz:TSLA"].is_active is True
    assert markets["xyz:GOLD"].is_active is True


def test_funding_is_a_fraction_per_hour():
    funding = _StubAdapter().get_funding("xyz:TSLA")

    assert funding.interval_hours == pytest.approx(1.0)
    assert funding.funding_rate_raw == pytest.approx(0.00000625)
    # ~5.5% a year -- a percent read as a fraction would be a hundred times off.
    assert funding.funding_rate_annualized == pytest.approx(0.00000625 * 8_760)


def test_open_interest_is_converted_from_base_units_to_usd():
    volume = _StubAdapter().get_volume("xyz:TSLA")

    assert volume.volume_24h_usd == pytest.approx(15_974_695.50)
    assert volume.open_interest_usd == pytest.approx(116253.184 * 366.41)


def test_the_book_gives_a_real_spread_and_a_walk():
    book = _StubAdapter().get_orderbook_top("xyz:TSLA")

    assert book.best_bid == pytest.approx(366.32)
    assert book.best_ask == pytest.approx(366.38)
    assert book.spread_bps == pytest.approx(0.06 / 366.35 * 10_000, abs=0.01)
    # ~$16.5k rests on the ask side, so $10k fills and $100k does not.
    assert book.impact_bps_10k is not None
    assert book.impact_bps_100k is None
    assert book.quote_curve is not None


def test_an_unknown_market_never_reaches_the_network():
    with pytest.raises(MarketUnavailable):
        _StubAdapter().get_orderbook_top("xyz:NOTLISTED")


def test_totals_skip_delisted_markets():
    totals = _StubAdapter().get_venue_totals()

    assert totals.volume_24h_usd == pytest.approx(15_974_695.50 + 77_805_605.87)
    assert totals.open_interest_usd == pytest.approx(116253.184 * 366.41 + 75488.171 * 4361.5)


def test_venue_fee_row_is_the_standard_schedule():
    fees = _StubAdapter().get_fees()

    assert fees.maker_bps == pytest.approx(3.0)
    assert fees.taker_bps == pytest.approx(9.0)
    assert fees.source_url is not None
