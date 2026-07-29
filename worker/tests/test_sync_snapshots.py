from perpfarm.adapters.base import OrderbookTop, QuoteCurve, QuoteCurvePoint
from perpfarm.jobs.sync_snapshots import SnapshotSyncSummary, _serialize_quote_curve


def test_snapshot_sync_summary_defaults_to_all_zero():
    summary = SnapshotSyncSummary()
    assert summary.written == 0
    assert summary.skipped == 0
    assert summary.errors == []


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
