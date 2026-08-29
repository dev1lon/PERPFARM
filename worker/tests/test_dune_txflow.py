"""Reading a Dune result, with the traps that already cost us a chart.

The rules here came from the website's own reader (web/lib/dune.ts), which
learned them the hard way: a result's row ORDER is not a contract, and a column
called `total_volume` is not the daily volume.
"""

from datetime import date

from perpfarm.jobs import dune_txflow as job


def test_an_exact_column_name_beats_a_substring_one():
    """The volume query returns `volume` AND a cumulative `total_volume`.
    Matching by substring alone would let either win depending on key order,
    and the cumulative one plotted as a daily bar only ever goes up."""

    row = {"total_volume": 999.0, "volume": 12.0, "day": "2026-08-26"}

    assert job.column_value(row, job.VOLUME_NAMES) == 12.0


def test_prose_column_titles_still_match():
    """Dune titles are written for humans: "Total Traders (latest day)"."""

    assert job.column_value({"Total Traders (latest day)": 6500}, job.TOTAL_TRADERS_NAMES) == 6500


def test_a_days_value_comes_from_its_own_date_column_not_its_position():
    rows = [
        {"day": "2026-08-26", "volume": 3.0},
        {"day": "2026-08-24", "volume": 1.0},
        {"day": "2026-08-25", "volume": 2.0},
    ]

    series = job.daily_series(rows, job.VOLUME_NAMES)

    assert series == {date(2026, 8, 24): 1.0, date(2026, 8, 25): 2.0, date(2026, 8, 26): 3.0}


def test_rows_without_a_usable_date_or_value_are_dropped_not_guessed():
    rows = [{"volume": 5.0}, {"day": "not a date", "volume": 6.0}, {"day": "2026-08-26"}]

    assert job.daily_series(rows, job.VOLUME_NAMES) == {}


def test_traders_accumulate_from_the_daily_counts_alone():
    """Dune publishes NEW traders per day. The running total is built from
    those, never rebased onto the separate all-time card -- that offset would
    be spread backwards over every past day."""

    rows = [
        {"day": "2026-03-26", "new_traders_daily": 6},
        {"day": "2026-03-27", "new_traders_daily": 3},
        {"day": "2026-03-28", "new_traders_daily": 10},
    ]

    assert job.cumulative_traders(rows) == {
        date(2026, 3, 26): 6,
        date(2026, 3, 27): 9,
        date(2026, 3, 28): 19,
    }


def test_todays_trader_count_never_falls_below_a_day_already_known():
    """The two queries disagree by a few dozen, and on a day the daily series
    has not reached yet there is no entry for today. Storing the card raw made
    the published curve drop -- 6,905 traders yesterday, 6,849 today, which
    reads as 56 people un-trading."""

    through_yesterday = {date(2026, 8, 27): 6807, date(2026, 8, 28): 6905}

    assert job.today_trader_count(through_yesterday, 6849.0) == 6905
    # A fresher card that is genuinely higher still wins.
    assert job.today_trader_count(through_yesterday, 6950.0) == 6950
    # Nothing published means nothing stored, not a zero.
    assert job.today_trader_count(through_yesterday, None) is None


def test_a_card_takes_its_newest_dated_reading():
    rows = [
        {"day": "2026-08-24", "total_volume_24h": 10.0},
        {"day": "2026-08-26", "total_volume_24h": 30.0},
        {"day": "2026-08-25", "total_volume_24h": 20.0},
    ]

    assert job.latest_card_value(rows, job.VOLUME_24H_NAMES) == 30.0


def test_a_card_without_a_date_falls_back_to_its_last_numeric_row():
    """A single-value card carries no other ordering information."""

    assert job.latest_card_value([{"Total Traders (latest day)": 6500}], job.TOTAL_TRADERS_NAMES) == 6500


def test_no_api_key_is_a_skip_not_a_failure():
    """The site falls back to asking Dune itself, so a missing key costs
    freshness and nothing else. It must never look like an error."""

    summary = job.run_dune_sync(engine=None, api_key="")  # type: ignore[arg-type]

    assert summary.skipped is True
    assert summary.errors == []
    assert summary.written == 0


def test_stored_days_never_lose_a_figure_another_query_supplied():
    """The three series cover different day ranges. A day that has volume but
    no trader count must keep the trader count already stored for it."""

    assert "COALESCE(EXCLUDED.volume_24h_usd, venue_daily_stats.volume_24h_usd)" in job._UPSERT_SQL
    assert "COALESCE(EXCLUDED.unique_traders, venue_daily_stats.unique_traders)" in job._UPSERT_SQL
