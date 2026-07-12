from pathlib import Path

import pytest

from perpfarm.adapters.fixture import FixtureAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "data" / "fixtures"


def test_get_markets_venue_alpha():
    adapter = FixtureAdapter("venue_alpha", FIXTURES_DIR)
    symbols = {m.symbol for m in adapter.get_markets()}
    assert symbols == {"BTC-PERP", "kPEPE-PERP"}


def test_get_funding():
    adapter = FixtureAdapter("venue_beta", FIXTURES_DIR)
    funding = adapter.get_funding("PEPE-PERP")
    assert funding.funding_rate_annualized == pytest.approx(0.2628)


def test_get_orderbook_top():
    adapter = FixtureAdapter("venue_alpha", FIXTURES_DIR)
    book = adapter.get_orderbook_top("BTC-PERP")
    assert book.best_bid < book.best_ask


def test_get_volume():
    adapter = FixtureAdapter("venue_beta", FIXTURES_DIR)
    volume = adapter.get_volume("BTC-PERP")
    assert volume.volume_24h_usd == 420000000


def test_get_fees():
    adapter = FixtureAdapter("venue_alpha", FIXTURES_DIR)
    fees = adapter.get_fees()
    assert fees.maker_bps == -2.0
    assert fees.taker_bps == 5.0


def test_missing_venue_raises():
    with pytest.raises(FileNotFoundError):
        FixtureAdapter("does_not_exist", FIXTURES_DIR)
