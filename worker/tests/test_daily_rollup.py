"""What the daily rollup must keep true for the chart it feeds."""

import pathlib

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
