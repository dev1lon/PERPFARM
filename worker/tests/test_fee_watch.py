import inspect
import json

from perpfarm.adapters.registry import FIXTURE_SLUGS
from perpfarm.jobs import fee_watch
from perpfarm.jobs.fee_watch import FeeChange, FeeWatchSummary, build_alert_payload, fee_hash


def test_fee_watch_skips_fixture_venues():
    """The fee watcher was the last writer that still iterated the raw registry.

    It published `venue_alpha`'s fixture schedule -- a -2.0 bps maker REBATE --
    into production `fee_schedules`, which is what let a synthetic venue win the
    hourly "lowest cost route" comparison. Every other writer filtered fixtures;
    this one did not, and nothing asserted that it should.
    """
    source = inspect.getsource(fee_watch.run_fee_watch)
    loop = source.index("for reg in REGISTRY:")
    guard = source.index("if reg.is_fixture:")
    build = source.index("build_adapter(")

    assert loop < guard < build, "fixtures must be skipped before an adapter is built"
    assert "venue_alpha" in FIXTURE_SLUGS


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


def test_build_alert_payload_is_json_serializable():
    """payload_json is a JSONB column -- run_fee_watch must hand FeeChange
    plain floats, not decimal.Decimal (Postgres Numeric columns come back as
    Decimal, which json.dumps rejects). This only guards the payload shape;
    the DB-boundary float() conversion itself lives in run_fee_watch, which
    isn't unit-tested (no live Postgres in this environment)."""
    change = FeeChange(
        venue_slug="venue_alpha",
        previous_maker_bps=-2.0,
        previous_taker_bps=5.0,
        current_maker_bps=-1.0,
        current_taker_bps=6.0,
        source_url=None,
    )
    json.dumps(build_alert_payload(change))


def test_fee_watch_summary_defaults_to_all_zero():
    summary = FeeWatchSummary()
    assert summary.updated == 0
    assert summary.unchanged == 0
    assert summary.skipped == 0
    assert summary.alerted == 0
    assert summary.errors == []
