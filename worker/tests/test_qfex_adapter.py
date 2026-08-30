"""Unit conventions for the QFEX adapter.

QFEX differs from every other venue we read in two ways that would quietly
produce wrong numbers rather than errors:

  * `open_interest_usd` is ALREADY in dollars, so multiplying it by a price
    (as every other adapter must) would inflate it by orders of magnitude;
  * the book publishes empty ticks as size `0`, and walking those as if they
    were liquidity would understate impact.

Payloads below were recorded from api.qfex.com on 2026-08-29, trimmed to the
fields the adapter reads.
"""

import pytest

from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.qfex import QfexAdapter

CONTRACTS = {
    "data": [
        {
            "ticker_id": "AAPL-USD",
            "base_currency": "AAPL",
            "target_currency": "USD",
            "last_price": "320.57",
            "base_volume": "155.213",
            "target_volume": "49698.00437",
            "product_type": "Perpetual",
            "open_interest": "8079.7",
            "open_interest_usd": "2590337.42",
            "index_price": "320.55",
            "funding_rate": "0",
        },
        {
            "ticker_id": "GOLD-DEC26",
            "base_currency": "GOLD",
            "target_currency": "USD",
            "product_type": "Future",
            "open_interest_usd": "1000",
            "funding_rate": "0",
        },
    ]
}
BOOK = {
    "ticker_id": "AAPL-USD",
    "bids": [["320.53", "53.77"], ["320.51", "0"], ["320.43", "64.133"]],
    "asks": [["320.64", "12.0"], ["320.65", "0"], ["320.70", "40.0"]],
}


class _StubAdapter(QfexAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def _get(self, path):  # type: ignore[override]
        if path == "/md/contracts":
            return CONTRACTS
        if path.startswith("/md/orderbook/"):
            return BOOK
        raise AssertionError(f"unexpected request {path}")


def test_only_perpetuals_are_listed():
    """The same feed carries dated futures; pricing one as a perp would be a
    different instrument wearing the same ticker."""

    symbols = {market.symbol for market in _StubAdapter().get_markets()}

    assert "AAPL-USD" in symbols
    assert "GOLD-DEC26" not in symbols


def test_open_interest_is_taken_as_published_in_usd():
    volume = _StubAdapter().get_volume("AAPL-USD")

    # $2.59M as published -- NOT 8,079.7 contracts times $320.57.
    assert volume.open_interest_usd == pytest.approx(2_590_337.42)
    assert volume.volume_24h_usd == pytest.approx(49_698.00437)


def test_a_zero_funding_rate_is_a_reading_not_a_gap():
    """QFEX funds a symbol only while its underlier venue is open, so a zero
    outside those hours is the published rate and must be stored as one."""

    funding = _StubAdapter().get_funding("AAPL-USD")

    assert funding.funding_rate_raw == 0.0
    assert funding.funding_rate_annualized == 0.0
    assert funding.interval_hours == pytest.approx(1.0)


def test_empty_price_ticks_are_not_liquidity():
    book = _StubAdapter().get_orderbook_top("AAPL-USD")

    assert book.best_bid == pytest.approx(320.53)
    assert book.best_ask == pytest.approx(320.64)
    # The zero-size levels sit between the real ones; if they had been walked,
    # a fill would have looked cheaper than the book can actually give.
    assert book.impact_bps_10k is not None
    assert book.quote_curve is not None
    assert [point.notional_usd for point in book.quote_curve.points][:2] == [0.0, 500.0]


def test_an_unknown_market_never_reaches_the_network():
    with pytest.raises(MarketUnavailable):
        _StubAdapter().get_orderbook_top("NOPE-USD")


def test_fees_are_the_entry_tier_for_single_stocks():
    """QFEX prices by asset class and our model carries one pair per venue, so
    it carries the class this venue actually is -- and the dearest one. Indices
    and commodities pay 0.02%/0.05%, FX 0.01%/0.02%, so those are priced above
    what they cost rather than below."""

    fees = _StubAdapter().get_fees()

    assert fees.maker_bps == pytest.approx(5.0)
    assert fees.taker_bps == pytest.approx(10.0)
    assert fees.source_url is not None
