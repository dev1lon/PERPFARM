from perpfarm.adapters.base import OrderbookTop, QuoteCurve, QuoteCurvePoint
from perpfarm.jobs.sync_snapshots import (
    MAX_RETRY_ROUNDS,
    RETRY_DELAY_SECONDS,
    RETRY_WINDOW_MINUTES,
    SnapshotSyncSummary,
    _retry_targets,
    _serialize_quote_curve,
)


def test_snapshot_sync_summary_defaults_to_all_zero():
    summary = SnapshotSyncSummary()
    assert summary.written == 0
    assert summary.skipped == 0
    assert summary.errors == []
    assert summary.retry_rounds == 0
    assert summary.recovered == 0


def test_quote_curve_is_stored_as_native_snapshot_data():
    book = OrderbookTop(
        best_bid=99.9,
        best_ask=100.1,
        spread_bps=20,
        quote_curve=QuoteCurve(
            reference_price=100,
            points=(
                QuoteCurvePoint(notional_usd=0, bid=99.9, ask=100.1),
                QuoteCurvePoint(notional_usd=1_000, bid=99.8, ask=100.2),
            ),
        ),
    )

    assert _serialize_quote_curve(book) == {
        "reference_price": 100,
        "points": [
            {"notional_usd": 0, "bid": 99.9, "ask": 100.1},
            {"notional_usd": 1_000, "bid": 99.8, "ask": 100.2},
        ],
    }


def test_nothing_is_retried_when_every_market_was_written():
    outcomes = {
        ("variational", 1, "BTC-PERP"): ("written", ""),
        ("txflow", 2, "ETH-PERP"): ("written", ""),
    }

    assert _retry_targets(outcomes) == []


def test_a_transient_failure_is_retried():
    outcomes = {
        ("variational", 1, "BTC-PERP"): ("written", ""),
        ("variational", 2, "ETH-PERP"): ("error", "HTTP 503"),
    }

    assert _retry_targets(outcomes) == [("variational", 2, "ETH-PERP")]


def test_an_unwired_adapter_is_never_retried():
    """It cannot fix itself in five minutes; only shipping an adapter fixes it."""

    outcomes = {("qfex", 1, "AAPL-PERP"): ("unwired", "no adapter for qfex")}

    assert _retry_targets(outcomes) == []


def test_a_closed_market_on_a_working_venue_is_not_retried():
    """Weekend FX: the venue answered fine, this instrument is simply shut."""

    outcomes = {
        ("variational", 1, "BTC-PERP"): ("written", ""),
        ("variational", 2, "EURUSD-PERP"): ("unavailable", "market closed"),
    }

    assert _retry_targets(outcomes) == []


def test_a_venue_that_answered_nothing_at_all_is_retried():
    """Every market unavailable and none written is what maintenance looks like."""

    outcomes = {
        ("variational", 1, "BTC-PERP"): ("written", ""),
        ("txflow", 2, "ETH-PERP"): ("unavailable", "under maintenance"),
        ("txflow", 3, "SOL-PERP"): ("unavailable", "under maintenance"),
    }

    assert _retry_targets(outcomes) == [("txflow", 2, "ETH-PERP"), ("txflow", 3, "SOL-PERP")]


def test_every_retry_lands_before_the_next_hourly_run():
    """The cron fires on the hour; a run still retrying then would double-write."""

    assert MAX_RETRY_ROUNDS * RETRY_DELAY_SECONDS < RETRY_WINDOW_MINUTES * 60
    assert RETRY_WINDOW_MINUTES < 60
