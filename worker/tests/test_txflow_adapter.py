"""Unit conventions for the TxFlow adapter.

The funding conversion is the reason this file exists: TxFlow quotes
``fundingRate`` in PERCENT per settlement interval, while every consumer of
``funding_rate_annualized`` treats it as a FRACTION (Variational stores 0.1095
for 10.95%). Reading TxFlow's value as a fraction inflated it a hundredfold and
produced a hedge-cycle "cost" of minus six figures on a $10k position.
"""

import pytest

from perpfarm.adapters.txflow import TxflowAdapter


class _StubAdapter(TxflowAdapter):
    """Feeds one recorded ticker payload through the real conversion."""

    def __init__(self, ticker: dict) -> None:
        super().__init__()
        self._stub_ticker = ticker

    def _ticker(self, symbol: str) -> dict:  # type: ignore[override]
        return self._stub_ticker


# Values recorded from api.txflow.com on 2026-08-08.
BTC_TICKER = {"fundingRate": "0.00247934", "settlementIntervalMs": 3_600_000, "rateCap": "0.03000000"}
KAITO_TICKER = {"fundingRate": "-0.25351283", "settlementIntervalMs": 3_600_000, "rateCap": "1.00000000"}


def test_percent_per_interval_becomes_a_fraction():
    funding = _StubAdapter(BTC_TICKER).get_funding("BTC")
    assert funding.interval_hours == pytest.approx(1.0)
    # 0.00247934% per hour, not 0.00247934 of notional.
    assert funding.funding_rate_raw == pytest.approx(0.0000247934)
    # ~22% a year, the order of magnitude a BTC perp actually funds at.
    assert funding.funding_rate_annualized == pytest.approx(0.0000247934 * 8_760)
    assert 0.1 < funding.funding_rate_annualized < 0.5


def test_extreme_rate_stays_within_the_venues_own_cap():
    funding = _StubAdapter(KAITO_TICKER).get_funding("KAITO")
    # The venue caps this market at 1%/h; annualized that is 87.6, and the
    # converted rate must sit inside that ceiling rather than 100x above it.
    assert funding.funding_rate_annualized == pytest.approx(-0.0025351283 * 8_760)
    assert abs(funding.funding_rate_annualized) < 1.0 * 8_760 / 100.0 * 8_760
    assert abs(funding.funding_rate_annualized) < 100.0
