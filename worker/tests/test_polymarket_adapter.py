"""Unit conventions for the Polymarket Perps adapter.

The trap here is volume: no ticker field carries it, so the 24h figure is built
from hourly candles whose volume is in BASE units. Summing those without the
close price would report 0.68 for a $52k hour.

Payloads below were recorded from api.perpetuals.polymarket.com on 2026-08-29,
trimmed to the fields the adapter reads.
"""

import pytest

from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.polymarket import PolymarketAdapter, notional_from_candles

INSTRUMENTS = [
    {
        "instrument_id": 6,
        "symbol": "BTC-USD",
        "base_asset": "BTC",
        "quote_asset": "pUSD",
        "funding_interval": "1h",
        "instrument_type": "perpetual",
        "category": "crypto",
    },
    {
        "instrument_id": 1,
        "symbol": "SP500-USD",
        "base_asset": "SP500",
        "quote_asset": "pUSD",
        "funding_interval": "1h",
        "instrument_type": "perpetual",
        "category": "index",
    },
]
TICKERS = [
    {
        "instrument_id": 6,
        "symbol": "BTC-USD",
        "index_price": "77530.1",
        "mark_price": "77528.0",
        "mid_price": "77528.5",
        "open_interest": "12.5",
        "funding_rate": "0.00000625",
    },
    {
        "instrument_id": 1,
        "symbol": "SP500-USD",
        "mark_price": "7717.4",
        "open_interest": "1026.98565",
        "funding_rate": "0.00000625",
    },
]
BOOK = {
    "instrument_id": 6,
    "bids": [["77527.0", "0.5"], ["77520.0", "2.0"]],
    "asks": [["77529.0", "0.4"], ["77535.0", "3.0"]],
}
KLINES = {
    "data": [
        [1787943600000, "77405", "77547", "77351", "77528", "0.677", 109],
        [1787947200000, "77504", "77579", "77273", "77366", "5.1516", 361],
    ]
}


class _StubAdapter(PolymarketAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def _get(self, path, params=None):  # type: ignore[override]
        if path == "/instruments":
            return INSTRUMENTS
        if path == "/tickers":
            return TICKERS
        if path == "/book":
            return BOOK
        if path == "/klines":
            return KLINES
        raise AssertionError(f"unexpected request {path}")


def test_markets_carry_the_base_asset_as_the_canonical_symbol():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert markets["BTC-USD"].symbol_canonical == "BTC"
    assert markets["SP500-USD"].symbol_canonical == "SP500"


def test_the_funding_interval_is_read_from_the_instrument():
    """It is published per instrument ("1h"); annualizing an hourly rate as if
    it were eight-hourly would be off by a factor of eight."""

    funding = _StubAdapter().get_funding("BTC-USD")

    assert funding.interval_hours == pytest.approx(1.0)
    assert funding.funding_rate_raw == pytest.approx(0.00000625)
    assert funding.funding_rate_annualized == pytest.approx(0.00000625 * 8_760)


def test_volume_is_built_from_candles_in_dollars():
    # 0.677 BTC at 77,528 plus 5.1516 at 77,366 -- about $451k, not 5.83.
    expected = 0.677 * 77_528 + 5.1516 * 77_366

    assert notional_from_candles(KLINES["data"]) == pytest.approx(expected)
    assert _StubAdapter().get_volume("BTC-USD").volume_24h_usd == pytest.approx(expected)


def test_no_candles_means_unknown_volume_not_zero():
    """A market we could not read is unknown; reporting 0 would drop it from
    the calculator for looking idle."""

    assert notional_from_candles([]) is None
    assert notional_from_candles(None) is None


def test_open_interest_is_converted_from_base_units_to_usd():
    volume = _StubAdapter().get_volume("BTC-USD")

    assert volume.open_interest_usd == pytest.approx(12.5 * 77_528)


def test_the_book_gives_a_real_spread_and_a_walk():
    book = _StubAdapter().get_orderbook_top("BTC-USD")

    assert book.best_bid == pytest.approx(77_527.0)
    assert book.best_ask == pytest.approx(77_529.0)
    assert book.spread_bps == pytest.approx(0.258, abs=0.01)
    assert book.impact_bps_10k is not None


def test_an_unknown_market_never_reaches_the_network():
    with pytest.raises(MarketUnavailable):
        _StubAdapter().get_orderbook_top("NOPE-USD")


def test_fees_come_from_the_published_entry_tier():
    """0.0400% taker / 0.0125% maker under $1M of trailing 30-day volume --
    the tier a new farmer is actually on, and the conservative end."""

    fees = _StubAdapter().get_fees()

    assert fees.taker_bps == pytest.approx(4.0)
    assert fees.maker_bps == pytest.approx(1.25)
    assert fees.source_url is not None
