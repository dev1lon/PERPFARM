from datetime import datetime, timezone

from click.testing import CliRunner

from perpfarm.cli import _should_run_weekly_fee_watch, cli


def test_cli_help_lists_commands():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "bootstrap-venues" in result.output
    assert "ingest-manual" in result.output
    assert "sync-markets" in result.output
    assert "refresh-catalog" in result.output
    assert "job" in result.output


def test_fee_watch_schedule_is_monday_at_06_utc():
    assert _should_run_weekly_fee_watch(datetime(2026, 7, 27, 6, 15, tzinfo=timezone.utc))
    assert not _should_run_weekly_fee_watch(datetime(2026, 7, 27, 5, 59, tzinfo=timezone.utc))
    assert not _should_run_weekly_fee_watch(datetime(2026, 7, 28, 6, 15, tzinfo=timezone.utc))
