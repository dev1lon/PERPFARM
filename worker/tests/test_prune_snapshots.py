import pathlib

from perpfarm.jobs import prune_snapshots


def test_volume_snapshots_are_downsampled_not_deleted():
    """The charts read 180 days of volume history, so it cannot be deleted.

    It is thinned instead: the chart queries already take one row per market
    per day, so hourly rows further back are read and discarded.
    """
    assert "volume_snapshots" not in prune_snapshots.PRUNABLE_TABLES
    assert set(prune_snapshots.PRUNABLE_TABLES) == {"book_snapshots", "funding_snapshots"}
    assert prune_snapshots.DOWNSAMPLED_TABLE == "volume_snapshots"


def test_downsampling_keeps_the_rows_the_charts_would_pick():
    """Both readers take the LATEST row of each day, so both must survive.

    The activity chart takes row_number()=1 by ts DESC and then drops nulls;
    OI-composition filters non-null OI first and then takes the latest. Those
    can be different rows, and keeping only one would move a published chart.
    """
    sql = prune_snapshots._DOWNSAMPLE_SQL
    assert "keep_latest" in sql and "keep_oi" in sql
    assert "open_interest_usd IS NOT NULL" in sql
    assert sql.count("ORDER BY market_id, day, ts DESC") == 2


def test_retention_clears_the_read_window_with_margin():
    """Readers need 24 hours; a late or missed cron must not destroy it."""
    assert prune_snapshots.RETENTION_HOURS > 24


def test_marks_are_kept_hourly_for_a_week_then_daily_for_a_month():
    """The retention the drift measure depends on, asserted on the SQL itself.

    A unit test over an in-memory list would pass while the job deleted the
    week of hourly readings the rating is computed from.
    """
    from perpfarm.jobs import prune_snapshots as job

    source = pathlib.Path(job.__file__).read_text(encoding="utf-8")

    assert job.MARK_HOURLY_DAYS == 7
    assert job.MARK_DAILY_DAYS == 30
    # Thinning must start AFTER the hourly window and stop at the daily one,
    # or it would eat the readings the badge reads.
    assert "ts < now() - make_interval(days => :hourly_days)" in source
    assert "ts >= now() - make_interval(days => :daily_days)" in source
    # One row per market per day survives the thinning.
    assert "DISTINCT ON (market_id, day)" in source
