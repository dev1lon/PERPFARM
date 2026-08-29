"""Unit conventions for the RiseX adapter.

Two of RiseX's fields are traps, and both are the kind that produce a plausible
wrong number rather than an error:

  * the funding interval arrives in NANOSECONDS, and the venue publishes an
    8-hour rate beside the hourly one -- picking the wrong pair multiplies
    every rate by eight;
  * open interest arrives in BASE units, so an $11M market reads as 144 until
    it is multiplied by the mark price.

Payloads below were recorded from api.rise.trade on 2026-08-29, trimmed to the
fields the adapter reads.
"""

import pytest

from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.risex import RiseXAdapter, canonical_symbol

MARKETS = [
    {
        "market_id": "1",
        "display_name": "BTC/USDC",
        "base_asset_symbol": "BTC/USDC",
        "quote_volume_24h": "26475167.4361649",
        "mark_price": "78146.65379802492815348",
        "last_price": "78151.8",
        "open_interest": "144.21731",
        "funding_interval": "3600000000000",
        "current_funding_rate": "0.000015301435838508",
        "funding_rate_8h": "0.000122411486708064",
        "active": True,
    },
    {
        "market_id": "9",
        "display_name": "OLD/USDC",
        "quote_volume_24h": "0",
        "mark_price": "1.0",
        "open_interest": "0",
        "funding_interval": "3600000000000",
        "current_funding_rate": "0",
        "active": False,
    },
]
BOOK = {
    "market_id": "1",
    "bids": [{"price": "78145.2", "quantity": "1.280189"}, {"price": "78140.0", "quantity": "0.5"}],
    "asks": [{"price": "78145.3", "quantity": "0.176088"}, {"price": "78150.0", "quantity": "2.0"}],
}


class _StubAdapter(RiseXAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def _get(self, path, params=None):  # type: ignore[override]
        if path == "/markets":
            return {"markets": MARKETS}
        if path == "/orderbook":
            return BOOK
        raise AssertionError(f"unexpected request {path}")


def test_the_quote_currency_is_not_part_of_the_instrument():
    # So BTC here can be matched with BTC on a venue that spells it "BTC-PERP".
    assert canonical_symbol("BTC/USDC") == "BTC"
    assert canonical_symbol("HYPE/USDC") == "HYPE"
    assert canonical_symbol("BTC") == "BTC"


def test_inactive_markets_are_listed_but_not_collected():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert markets["BTC/USDC"].is_active is True
    assert markets["BTC/USDC"].symbol_canonical == "BTC"
    assert markets["OLD/USDC"].is_active is False


def test_the_funding_interval_is_read_in_nanoseconds():
    funding = _StubAdapter().get_funding("BTC/USDC")

    assert funding.interval_hours == pytest.approx(1.0)
    assert funding.funding_rate_raw == pytest.approx(0.000015301435838508)
    # ~13% a year. Reading the 8-hour figure as the interval rate would give
    # eight times that, and reading nanoseconds as milliseconds far more.
    assert funding.funding_rate_annualized == pytest.approx(0.000015301435838508 * 8_760)
    assert 0.05 < funding.funding_rate_annualized < 0.5


def test_open_interest_is_converted_from_base_units_to_usd():
    volume = _StubAdapter().get_volume("BTC/USDC")

    assert volume.volume_24h_usd == pytest.approx(26_475_167.4361649)
    # 144.21731 BTC at ~$78,146 -- $11.3M, not 144.
    assert volume.open_interest_usd == pytest.approx(144.21731 * 78146.65379802492815348)


def test_the_book_gives_a_real_spread_and_a_walk():
    book = _StubAdapter().get_orderbook_top("BTC/USDC")

    assert book.best_bid == pytest.approx(78145.2)
    assert book.best_ask == pytest.approx(78145.3)
    # 0.1 on ~78,145 is about 0.013 bps.
    assert book.spread_bps == pytest.approx(0.0128, abs=0.002)
    assert book.impact_bps_10k is not None
    # This trimmed book holds ~$255k, so $100k walks but a bigger size would not.
    assert book.impact_bps_100k is not None
    assert book.quote_curve is not None


def test_an_unknown_market_never_reaches_the_network():
    with pytest.raises(MarketUnavailable):
        _StubAdapter().get_orderbook_top("NOPE/USDC")


def test_fees_are_not_guessed():
    """RiseX's maker/taker tiers are not in the chain docs, and a route priced
    at an invented fee is worse than a route not priced at all."""

    with pytest.raises(NotImplementedError):
        _StubAdapter().get_fees()
