"""What the daily rollup must keep true for the chart it feeds."""

import pathlib
from datetime import date

from perpfarm.adapters.base import VenueTotals
from perpfarm.jobs import daily_rollup as job
from perpfarm.jobs import sync_snapshots
from perpfarm.jobs.hedge_recommendations import OI_DISPLAY_FACTOR


def test_a_day_is_the_last_reading_of_each_market_not_a_sum_of_its_hours():
    """`volume_24h_usd` and `open_interest_usd` are point-in-time figures. Summing
    the hourly rows of one day would count the same day twenty-four times."""

    sql = job._DAILY_FROM_SNAPSHOTS_SQL

    assert "DISTINCT ON (s.market_id, (s.ts AT TIME ZONE 'UTC')::date)" in sql
    assert "ORDER BY s.market_id, (s.ts AT TIME ZONE 'UTC')::date, s.ts DESC" in sql


def test_a_published_total_is_never_replaced_by_our_own_sum():
    """The protocol is the authority on its own volume, whether it published it
    live or on its Dune dashboard. Without this the 00:05 run would overwrite
    yesterday's published figure with our sum of it."""

    assert (
        "WHERE EXCLUDED.source <> 'snapshots' OR venue_daily_stats.source = 'snapshots'"
        in job._UPSERT_SQL
    )


def test_yesterday_is_rewritten_too():
    """A day is only settled once its last hour has been collected, and the run
    that collects it lands after midnight UTC."""

    assert job.ROLLUP_DAYS >= 2


def test_open_interest_is_stored_in_the_protocols_own_scale():
    """The table holds what the venue reports and the site displays, so the
    display factor is applied here -- once -- and never again downstream."""

    source = pathlib.Path(job.__file__).read_text(encoding="utf-8")

    assert "OI_DISPLAY_FACTOR.get(slug, 1.0)" in source
    assert "float(row.open_interest_usd) * factor" in source
    # The factor itself is the one the website is checked against.
    assert OI_DISPLAY_FACTOR["variational"] == 2.0


def test_batched_writes_change_round_trips_not_values():
    """A batch is the same rows in one transaction. If a batch fails, each
    market is retried on its own, so one bad row still costs only itself."""

    source = pathlib.Path(sync_snapshots.__file__).read_text(encoding="utf-8")

    assert sync_snapshots.WRITE_BATCH_SIZE > 1
    # The row dicts are built once, in the read phase, and written unchanged.
    assert "[reading.book for reading in readings]" in source
    assert "[reading.volume for reading in readings]" in source
    assert "return {reading.target: _write_one(engine, reading) for reading in readings}" in source


def test_a_venue_that_publishes_only_open_interest_keeps_our_summed_volume():
    """Polymarket states its open interest but publishes volume nowhere outside
    each market's candles. The two used to be written as separate rows, and the
    guard above then blocked the hourly volume update for the rest of the day --
    freezing the chart at whatever the first run after midnight had summed."""

    today = date(2026, 8, 30)
    summed = {date(2026, 8, 29): (900.0, 800.0), today: (1_000.0, 500.0)}

    merged = job.merge_totals(summed, today, VenueTotals(volume_24h_usd=None, open_interest_usd=46_482_438.0))

    volume, open_interest, source = merged[today]
    assert volume == 1_000.0, "our summed volume must survive"
    assert open_interest == 46_482_438.0, "the venue's own OI must win"
    assert source == job.SOURCE_VENUE_API
    # Yesterday is untouched: "last 24 hours" says nothing about a closed day.
    assert merged[date(2026, 8, 29)] == (900.0, 800.0, job.SOURCE_SNAPSHOTS)


def test_a_published_total_replaces_our_sum_of_the_same_day():
    today = date(2026, 8, 30)

    merged = job.merge_totals(
        {today: (542_000.0, 260_000_000.0)},
        today,
        VenueTotals(volume_24h_usd=609_004.0, open_interest_usd=264_175_351.0),
    )

    assert merged[today] == (609_004.0, 264_175_351.0, job.SOURCE_VENUE_API)


def test_a_venue_is_recorded_even_before_we_have_a_snapshot_of_it():
    """Its first day, or an hour in which every market failed to collect."""

    today = date(2026, 8, 30)

    merged = job.merge_totals({}, today, VenueTotals(volume_24h_usd=1.0, open_interest_usd=2.0))

    assert merged == {today: (1.0, 2.0, job.SOURCE_VENUE_API)}


def test_a_venue_with_no_published_total_stays_our_sum():
    today = date(2026, 8, 30)

    merged = job.merge_totals({today: (5.0, 6.0)}, today, None)

    assert merged == {today: (5.0, 6.0, job.SOURCE_SNAPSHOTS)}
