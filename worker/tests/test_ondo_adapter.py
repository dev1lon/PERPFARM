"""Unit conventions for the Ondo Perps adapter.

Payloads have the shape api.ondoperps.xyz returned on 2026-09-11, trimmed to
the fields the adapter reads: every answer wrapped as {success, result},
depth levels as [price, size] string pairs, fees and funding as fractions.
"""

import httpx
import pytest

from perpfarm.adapters import ondo
from perpfarm.adapters.base import MarketUnavailable
from perpfarm.adapters.ondo import OndoAdapter

CONTRACTS = [
    {
        "market": "NVDA-USD.P",
        "baseCurrency": "NVDA",
        "disabled": False,
        "isClosed": False,
        "usdVolume": "1938901.63",
        "openInterestUsd": "1958749.40",
        "fundingRate": "0.0000063",
        "makerFee": "0.0001",
        "takerFee": "0.00025",
        "tags": ["Stock"],
    },
    {
        "market": "WTI-USD.P",
        "baseCurrency": "WTI",
        "disabled": False,
        "isClosed": False,
        "usdVolume": "14509729",
        "openInterestUsd": "3947828",
        "fundingRate": "-0.0000125",
        "makerFee": "0.0001",
        "takerFee": "0.00025",
        "tags": ["Commodity"],
    },
    {
        # Disabled contracts carry the dearer tier; they must not set the fee row.
        "market": "ADBE-USD.P",
        "baseCurrency": "ADBE",
        "disabled": True,
        "isClosed": False,
        "usdVolume": "0",
        "openInterestUsd": "0",
        "fundingRate": "0",
        "makerFee": "0.00015",
        "takerFee": "0.00035",
        "tags": ["Stock"],
    },
]
DEPTH = {
    "market": "NVDA-USD.P",
    "asks": [["219.22", "4.55"], ["219.25", "4.55"], ["219.27", "100.2"]],
    "bids": [["219.19", "7.27"], ["219.11", "60.59"]],
}


class _StubAdapter(OndoAdapter):
    """The real parsing, fed recorded payloads instead of the network."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[str] = []

    def _get(self, path, params=None):  # type: ignore[override]
        self.calls.append(path)
        if path == "/v1/perps/contracts":
            return CONTRACTS
        if path == "/v1/perps/depth":
            assert params == {"market": "NVDA-USD.P", "depth": 100}
            return DEPTH
        raise AssertionError(f"unexpected request {path}")

    def _pace(self) -> None:
        return None


def test_markets_carry_the_base_ticker_and_the_venue_tag():
    markets = {market.symbol: market for market in _StubAdapter().get_markets()}

    assert markets["NVDA-USD.P"].symbol_canonical == "NVDA"
    assert markets["NVDA-USD.P"].asset_class == "STOCK"
    # Renamed to CL by data/manual/symbol_overrides.yaml, not here.
    assert markets["WTI-USD.P"].symbol_canonical == "WTI"
    assert markets["ADBE-USD.P"].is_active is False


def test_funding_is_an_hourly_fraction():
    funding = _StubAdapter().get_funding("NVDA-USD.P")

    assert funding.interval_hours == pytest.approx(1.0)
    assert funding.funding_rate_raw == pytest.approx(0.0000063)
    assert funding.funding_rate_annualized == pytest.approx(0.0000063 * 8_760)


def test_volume_and_open_interest_are_already_dollars():
    volume = _StubAdapter().get_volume("NVDA-USD.P")

    assert volume.volume_24h_usd == pytest.approx(1_938_901.63)
    assert volume.open_interest_usd == pytest.approx(1_958_749.40)


def test_the_depth_snapshot_is_walked():
    book = _StubAdapter().get_orderbook_top("NVDA-USD.P")

    assert book.best_bid == pytest.approx(219.19)
    assert book.best_ask == pytest.approx(219.22)
    assert book.spread_bps == pytest.approx(0.03 / 219.205 * 10_000, abs=0.01)
    # ~$14.9k of bids and ~$24k of asks: $10k fills on both sides, $50k does not.
    assert book.impact_bps_10k is not None
    assert book.impact_bps_50k is None


def test_an_unknown_market_never_reaches_the_book():
    adapter = _StubAdapter()
    with pytest.raises(MarketUnavailable):
        adapter.get_orderbook_top("NOPE-USD.P")
    assert "/v1/perps/depth" not in adapter.calls


def test_totals_and_fees_count_enabled_contracts_only():
    adapter = _StubAdapter()
    totals = adapter.get_venue_totals()
    fees = adapter.get_fees()

    assert totals.volume_24h_usd == pytest.approx(1_938_901.63 + 14_509_729)
    assert totals.open_interest_usd == pytest.approx(1_958_749.40 + 3_947_828)
    assert fees.maker_bps == pytest.approx(1.0)
    assert fees.taker_bps == pytest.approx(2.5)


def test_an_unsuccessful_answer_is_an_error(monkeypatch):
    request = httpx.Request("GET", f"{ondo.API_URL}/v1/perps/contracts")
    monkeypatch.setattr(
        ondo.httpx, "get", lambda *args, **kwargs: httpx.Response(200, json={"success": False}, request=request)
    )

    with pytest.raises(ValueError):
        OndoAdapter()._get("/v1/perps/contracts")


def test_a_refused_call_is_retried_after_a_pause(monkeypatch):
    request = httpx.Request("GET", f"{ondo.API_URL}/v1/perps/contracts")
    answers = iter(
        [httpx.Response(429, request=request), httpx.Response(200, json={"success": True, "result": []}, request=request)]
    )
    pauses: list[float] = []
    monkeypatch.setattr(ondo.httpx, "get", lambda *args, **kwargs: next(answers))
    monkeypatch.setattr(ondo.time, "sleep", pauses.append)

    assert OndoAdapter()._get("/v1/perps/contracts") == []
    assert pauses == [2.0]
