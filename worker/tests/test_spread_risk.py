"""The spread-risk measure, ported from the website it used to live on.

These cases came with the code from `web/lib/spread-risk.test.ts`: the rating
moved into the worker so the site could read it instead of deriving it per
visitor, and the tests moved with it. Same inputs, same answers -- a published
badge must not change its mind because the computation changed address.
"""

import pathlib
from datetime import datetime, timedelta, timezone

from perpfarm.jobs import prune_snapshots
from perpfarm.jobs import spread_risk as job

BASE = datetime(2026, 8, 18, tzinfo=timezone.utc)


def at(hour: int) -> datetime:
    return BASE + timedelta(hours=hour)


def series(marks: list[float]) -> list[job.Tick]:
    return [(at(index), mark) for index, mark in enumerate(marks)]


def steady(count: int, gap: float) -> list[float]:
    return [gap] * count


def test_only_readings_taken_at_the_same_tick_are_compared():
    """Prices taken minutes apart would report the market's own move as venue
    disagreement, so an unmatched timestamp is dropped rather than paired up."""

    a = [(at(1), 100.0), (at(2), 101.0)]
    b = [(at(2), 101.01), (at(3), 102.0)]

    assert len(job.aligned_gaps_bps(a, b)) == 1


def test_the_gap_is_measured_in_bps_of_the_midpoint():
    gaps = job.aligned_gaps_bps([(at(1), 100.05)], [(at(1), 99.95)])

    assert round(gaps[0], 1) == 10.0  # 0.1 on ~100 is 10 bps


def test_a_missing_series_rates_nothing():
    assert job.aligned_gaps_bps([], series([100.0])) == []


def test_a_steady_gap_is_not_a_breakout_however_wide_it_is():
    """A constant 200 bps offset is met going in and coming out: it cancels."""

    assert job.breakout_share(steady(24, 200.0)) == 0


def test_only_readings_that_left_the_pairs_own_normal_gap_count():
    gaps = steady(18, 10.0) + steady(6, 400.0)

    assert round(job.breakout_share(gaps), 3) == round(6 / 24, 3)


def test_too_few_readings_cannot_support_a_frequency():
    assert job.breakout_share(steady(job.MIN_TICKS_FOR_RISK - 1, 10.0)) is None
    assert job.spread_risk_of(None) == "unknown"


def test_the_rating_thresholds_are_the_ones_the_site_published():
    assert job.spread_risk_of(0.0) == "low"
    assert job.spread_risk_of(job.SPREAD_RISK_LOW_SHARE) == "low"
    assert job.spread_risk_of(job.SPREAD_RISK_LOW_SHARE + 0.001) == "medium"
    assert job.spread_risk_of(job.SPREAD_RISK_MEDIUM_SHARE) == "medium"
    assert job.spread_risk_of(job.SPREAD_RISK_MEDIUM_SHARE + 0.001) == "high"


def test_the_normal_gap_is_the_upper_middle_reading():
    """How the site picked it (`sorted[floor(n / 2)]`), not a mean of the two
    middle values -- an averaged median would rate a pair differently."""

    assert job.median_gap_bps([1.0, 2.0, 3.0, 4.0]) == 3.0


def test_the_window_is_the_week_the_pruner_keeps_hourly():
    """Marks are thinned to one a day past a week, so a longer window would
    silently mix hourly and daily readings into one frequency."""

    assert job.SPREAD_WINDOW_DAYS == prune_snapshots.MARK_HOURLY_DAYS


def test_every_pair_is_rated_once_whichever_way_round_it_is_asked():
    """The table's check constraint requires venue_a_id < venue_b_id, so the
    job must only ever produce ordered pairs."""

    source = pathlib.Path(job.__file__).read_text(encoding="utf-8")

    assert "for venue_b in venue_ids[index + 1 :]" in source
    assert "ON CONFLICT (venue_a_id, venue_b_id, symbol_canonical) DO UPDATE" in source
