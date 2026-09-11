"""The Hyperliquid core venue: trade.xyz's parsing, scoped to the core book.

Payload shapes as api.hyperliquid.xyz returned them on 2026-09-11, trimmed to
the fields the adapter reads.
"""

import pytest

from perpfarm.adapters.hyperliquid import HyperliquidAdapter
from perpfarm.adapters.tradexyz import CORE_CRYPTO_CLASS

CORE_UNIVERSE = [
    {"name": "BTC", "szDecimals": 5},
    {"name": "kPEPE", "szDecimals": 0},
    {"name": "OLDCOIN", "szDecimals": 0, "isDelisted": True},
]
CORE_CONTEXTS = [
    {"funding": "0.0000125", "openInterest": "30000.0", "dayNtlVlm": "2000000000.0", "markPx": "77181.5"},
    {"funding": "0.00001", "openInterest": "1000000000.0", "dayNtlVlm": "30000000.0", "markPx": "0.003311"},
    {"funding": "0.0", "openInterest": "0.0", "dayNtlVlm": "0.0", "markPx": "0.1"},
]
BOOK = {
    "levels": [
        [{"px": "77180.0", "sz": "1.0"}, {"px": "77170.0", "sz": "1.0"}],
        [{"px": "77181.0", "sz": "1.0"}, {"px": "77190.0", "sz": "1.0"}],
    ]
}


class _StubAdapter(HyperliquidAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def _post(self, payload):  # type: ignore[override]
        if payload.get("type") == "metaAndAssetCtxs":
            # The core dex only: this venue never asks for trade.xyz's markets.
            assert "dex" not in payload
            return [{"universe": CORE_UNIVERSE}, CORE_CONTEXTS]
        if payload.get("type") == "l2Book":
            return BOOK
        raise AssertionError(f"unexpected request {payload}")


def test_only_live_core_markets_are_listed():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert set(markets) == {"BTC", "kPEPE"}
    assert markets["BTC"].asset_class == CORE_CRYPTO_CLASS
    assert markets["BTC"].is_active is True


def test_funding_and_open_interest_read_like_trade_xyz():
    adapter = _StubAdapter()

    assert adapter.get_funding("BTC").funding_rate_annualized == pytest.approx(0.0000125 * 8_760)
    assert adapter.get_volume("BTC").open_interest_usd == pytest.approx(30000.0 * 77181.5)


def test_the_book_is_walked():
    book = _StubAdapter().get_orderbook_top("BTC")

    assert book.best_bid == pytest.approx(77180.0)
    assert book.best_ask == pytest.approx(77181.0)
    assert book.impact_bps_10k is not None


def test_totals_are_the_core_book():
    totals = _StubAdapter().get_venue_totals()

    assert totals.volume_24h_usd == pytest.approx(2_000_000_000.0 + 30_000_000.0)
    assert totals.open_interest_usd == pytest.approx(30000.0 * 77181.5 + 1_000_000_000.0 * 0.003311)


def test_fees_are_the_core_tier_zero_schedule():
    fees = _StubAdapter().get_fees()

    assert fees.maker_bps == pytest.approx(1.5)
    assert fees.taker_bps == pytest.approx(4.5)
    assert fees.source_url is not None
