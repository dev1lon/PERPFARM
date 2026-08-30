"""Unit conventions for the Entropy adapter.

Two conversions are the reason this file exists, and one of them has burned
this project on another venue already:

  * funding arrives as a FRACTION per hour here, not a percent per interval as
    on TxFlow -- reading one as the other is a hundredfold error;
  * open interest arrives in BASE units, so a $4.7M market reads as 2.4K until
    it is multiplied by the mark price.

Payloads below were recorded from api.hyperliquid.xyz on 2026-08-29 for the
`io` dex, trimmed to the fields the adapter reads.
"""

import pytest

from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.entropy import EntropyAdapter, canonical_symbol

UNIVERSE = [
    {"name": "io:OAI", "szDecimals": 3, "isDelisted": True},
    {"name": "io:ANTH", "szDecimals": 2, "isDelisted": False},
    {"name": "io:NBIS", "szDecimals": 2},
]
CONTEXTS = [
    {"funding": "0.0", "openInterest": "0.0", "dayNtlVlm": "0.0", "markPx": "1250.0"},
    {"funding": "0.0000000156", "openInterest": "2439.9", "dayNtlVlm": "36188343.43", "markPx": "1919.8"},
    {"funding": "0.0000129219", "openInterest": "2835.88", "dayNtlVlm": "3220978.70", "markPx": "210.43"},
]
BOOK = {
    "levels": [
        [{"px": "1919.6", "sz": "5.456"}, {"px": "1919.0", "sz": "3.0"}],
        [{"px": "1919.7", "sz": "2.411"}, {"px": "1920.4", "sz": "4.0"}],
    ]
}


class _StubAdapter(EntropyAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def _post(self, payload):  # type: ignore[override]
        if payload.get("type") == "metaAndAssetCtxs":
            return [{"universe": UNIVERSE}, CONTEXTS]
        if payload.get("type") == "l2Book":
            return BOOK
        raise AssertionError(f"unexpected request {payload}")


def test_the_dex_prefix_is_not_part_of_the_instrument():
    # Stripping it is what lets NBIS here match NBIS on Variational.
    assert canonical_symbol("io:ANTH") == "ANTH"
    assert canonical_symbol("io:NBIS") == "NBIS"
    assert canonical_symbol("ANTH") == "ANTH"


def test_delisted_markets_are_listed_but_not_collected():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert markets["io:OAI"].is_active is False
    assert markets["io:ANTH"].is_active is True
    # A market that says nothing about delisting is live, not assumed dead.
    assert markets["io:NBIS"].is_active is True
    assert markets["io:NBIS"].symbol_canonical == "NBIS"


def test_funding_is_a_fraction_per_hour():
    funding = _StubAdapter().get_funding("io:NBIS")

    assert funding.interval_hours == pytest.approx(1.0)
    assert funding.funding_rate_raw == pytest.approx(0.0000129219)
    # ~11% a year, the order of magnitude these markets actually fund at.
    assert funding.funding_rate_annualized == pytest.approx(0.0000129219 * 8_760)
    assert 0.05 < funding.funding_rate_annualized < 0.2


def test_open_interest_is_converted_from_base_units_to_usd():
    volume = _StubAdapter().get_volume("io:ANTH")

    assert volume.volume_24h_usd == pytest.approx(36_188_343.43)
    # 2,439.9 contracts at $1,919.80 -- $4.7M, not 2.4K.
    assert volume.open_interest_usd == pytest.approx(2439.9 * 1919.8)


def test_the_book_gives_a_real_spread_and_a_walk():
    book = _StubAdapter().get_orderbook_top("io:ANTH")

    assert book.best_bid == pytest.approx(1919.6)
    assert book.best_ask == pytest.approx(1919.7)
    # 0.1 on ~1919.65 is about 0.52 bps.
    assert book.spread_bps == pytest.approx(0.52, abs=0.02)
    # $10k fits inside the top of this book; $100k does not, and a size the
    # book cannot fill must read as unknown rather than as free.
    assert book.impact_bps_10k is not None
    assert book.impact_bps_100k is None
    assert book.depth_usd_100k is None
    assert book.quote_curve is not None
    assert book.quote_curve.points[0].notional_usd == 0.0


def test_an_unknown_market_never_reaches_the_network():
    with pytest.raises(MarketUnavailable):
        _StubAdapter().get_orderbook_top("io:NOTLISTED")


def test_fees_are_the_published_hip3_schedule():
    """Twice Hyperliquid's standard perp rate, split between Hyperliquid and
    the deployer. Volume tiers and growth mode only ever take it lower, so
    this is the honest end to price a route at."""

    fees = _StubAdapter().get_fees()

    assert fees.maker_bps == pytest.approx(3.0)
    assert fees.taker_bps == pytest.approx(9.0)
    assert fees.source_url is not None
