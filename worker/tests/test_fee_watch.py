from perpfarm.jobs.fee_watch import FeeChange, FeeWatchSummary, build_alert_payload, fee_hash


def test_fee_hash_is_deterministic():
    assert fee_hash(-2.0, 5.0) == fee_hash(-2.0, 5.0)


def test_fee_hash_changes_when_maker_bps_changes():
    assert fee_hash(-2.0, 5.0) != fee_hash(-1.5, 5.0)


def test_fee_hash_changes_when_taker_bps_changes():
    assert fee_hash(-2.0, 5.0) != fee_hash(-2.0, 6.0)


def test_fee_hash_does_not_confuse_maker_and_taker():
    """-2/5 and 5/-2 must hash differently -- the separator matters, not just
    the multiset of values."""
    assert fee_hash(-2.0, 5.0) != fee_hash(5.0, -2.0)


def test_build_alert_payload_shape():
    change = FeeChange(
        venue_slug="venue_alpha",
        previous_maker_bps=-2.0,
        previous_taker_bps=5.0,
        current_maker_bps=-1.0,
        current_taker_bps=6.0,
        source_url="https://example.com/fees",
    )
    payload = build_alert_payload(change)
    assert payload == {
        "venue": "venue_alpha",
        "previous": {"maker_bps": -2.0, "taker_bps": 5.0},
        "current": {"maker_bps": -1.0, "taker_bps": 6.0},
        "source_url": "https://example.com/fees",
    }


def test_fee_watch_summary_defaults_to_all_zero():
    summary = FeeWatchSummary()
    assert summary.updated == 0
    assert summary.unchanged == 0
    assert summary.skipped == 0
    assert summary.alerted == 0
    assert summary.errors == []
