"""Unit conventions for the Lighter RH adapter.

Payloads below have the shape api.rh.lighter.xyz returned on 2026-09-11,
trimmed to the fields the adapter reads. The conversions that change numbers:
fees quoted in percent, open interest in base units, resting orders rather than
levels, and funding rows quoted over eight hours while funding settles hourly.
"""

import httpx
import pytest

from perpfarm.adapters import lighterrh
from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.lighterrh import LighterRhAdapter

DETAILS = {
    "code": 200,
    "order_book_details": [
        {
            "symbol": "NVDA",
            "market_id": 15,
            "market_type": "perp",
            "status": "active",
            "mark_price": "220.07",
            "open_interest": 14653.6227,
            "daily_quote_token_volume": 7336797.131409,
            "maker_fee": "0.0000",
            "taker_fee": "0.0000",
            "market_config": {"hidden": False},
        },
        {
            "symbol": "BTC",
            "market_id": 1,
            "market_type": "perp",
            "status": "active",
            "mark_price": "78759.3",
            "open_interest": 245.18,
            "daily_quote_token_volume": 109453849.0,
            # Synthetic: proves percent -> bps and that the dearest fee wins.
            "maker_fee": "0.0120",
            "taker_fee": "0.0350",
            "market_config": {"hidden": False},
        },
        {
            "symbol": "OLD",
            "market_id": 99,
            "market_type": "perp",
            "status": "inactive",
            "mark_price": "1.0",
            "open_interest": 10.0,
            "daily_quote_token_volume": 5.0,
            "maker_fee": "0.5000",
            "taker_fee": "0.5000",
            "market_config": {"hidden": False},
        },
        {"symbol": "NVDA/USDG", "market_id": 2054, "market_type": "spot", "status": "active"},
    ],
}
FUNDING_RATES = {
    "code": 200,
    "funding_rates": [
        {"market_id": 15, "exchange": "binance", "symbol": "NVDA", "rate": 0.00022164},
        {"market_id": 15, "exchange": "lighter", "symbol": "NVDA", "rate": 0.000032},
        {"market_id": 1, "exchange": "hyperliquid", "symbol": "BTC", "rate": 0.0001},
    ],
}
ORDERS = {
    "code": 200,
    "asks": [
        {"price": "220.10", "remaining_base_amount": "0.0926"},
        {"price": "220.10", "remaining_base_amount": "1.1358"},
        {"price": "220.11", "remaining_base_amount": "68.2812"},
    ],
    "bids": [
        {"price": "219.99", "remaining_base_amount": "10.0"},
        {"price": "220.00", "remaining_base_amount": "50.0"},
    ],
}


class _StubAdapter(LighterRhAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[str] = []

    def _get(self, path, params=None):  # type: ignore[override]
        self.calls.append(path)
        if path == "orderBookDetails":
            return DETAILS
        if path == "funding-rates":
            return FUNDING_RATES
        if path == "orderBookOrders":
            assert params == {"market_id": 15, "limit": 250}
            return ORDERS
        raise AssertionError(f"unexpected request {path}")

    def _pace(self) -> None:
        return None


def test_only_perps_are_listed_and_inactive_ones_are_marked():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert set(markets) == {"NVDA", "BTC", "OLD"}
    assert markets["NVDA"].is_active is True
    assert markets["OLD"].is_active is False
    assert markets["NVDA"].symbol_canonical == "NVDA"


def test_funding_row_is_an_eight_hour_rate_settled_hourly():
    funding = _StubAdapter().get_funding("NVDA")

    # 0.000032 over eight hours is 0.000004 an hour -- `fundings` showed NVDA
    # at 0.0004 percent an hour.
    assert funding.interval_hours == pytest.approx(1.0)
    assert funding.funding_rate_raw == pytest.approx(0.000004)
    assert funding.funding_rate_annualized == pytest.approx(0.000004 * 8_760)


def test_other_exchanges_rows_are_never_read_as_lighter_funding():
    with pytest.raises(MarketUnavailable):
        _StubAdapter().get_funding("BTC")  # only a Hyperliquid row exists for it


def test_open_interest_is_converted_from_base_units_to_usd():
    volume = _StubAdapter().get_volume("NVDA")

    assert volume.volume_24h_usd == pytest.approx(7_336_797.131409)
    assert volume.open_interest_usd == pytest.approx(14653.6227 * 220.07)


def test_orders_at_one_price_are_one_level_and_the_book_is_walked():
    book = _StubAdapter().get_orderbook_top("NVDA")

    assert book.best_bid == pytest.approx(220.00)
    assert book.best_ask == pytest.approx(220.10)
    assert book.spread_bps == pytest.approx(0.10 / 220.05 * 10_000, abs=0.01)
    # ~$13.2k of bids and ~$15.3k of asks: $10k fills on both sides, $50k does not.
    assert book.impact_bps_10k is not None
    assert book.impact_bps_50k is None
    assert book.quote_curve is not None


def test_an_unknown_market_never_reaches_the_book():
    adapter = _StubAdapter()
    with pytest.raises(MarketUnavailable):
        adapter.get_orderbook_top("NOPE")
    assert "orderBookOrders" not in adapter.calls


def test_totals_count_active_perps_only():
    totals = _StubAdapter().get_venue_totals()

    assert totals.volume_24h_usd == pytest.approx(7_336_797.131409 + 109_453_849.0)
    assert totals.open_interest_usd == pytest.approx(14653.6227 * 220.07 + 245.18 * 78759.3)


def test_fees_are_percent_and_the_dearest_active_market_sets_the_row():
    fees = _StubAdapter().get_fees()

    assert fees.maker_bps == pytest.approx(1.2)
    assert fees.taker_bps == pytest.approx(3.5)
    assert fees.source_url is not None


def test_a_refused_call_is_retried_after_a_pause(monkeypatch):
    request = httpx.Request("GET", f"{lighterrh.API_URL}/funding-rates")
    answers = iter([httpx.Response(429, request=request), httpx.Response(200, json={"ok": True}, request=request)])
    pauses: list[float] = []
    monkeypatch.setattr(lighterrh.httpx, "get", lambda *args, **kwargs: next(answers))
    monkeypatch.setattr(lighterrh.time, "sleep", pauses.append)

    assert LighterRhAdapter()._get("funding-rates") == {"ok": True}
    assert pauses == [5.0]


def test_book_calls_are_spaced_under_the_rate_limit(monkeypatch):
    clock = iter([100.0, 100.0, 100.2, 101.3])
    pauses: list[float] = []
    monkeypatch.setattr(lighterrh.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(lighterrh.time, "sleep", pauses.append)

    adapter = LighterRhAdapter()
    adapter._pace()  # first call never waits
    adapter._pace()  # 0.2 s later: waits out the rest of the spacing

    assert pauses == [pytest.approx(0.9)]
