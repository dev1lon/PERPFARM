from click.testing import CliRunner

from perpfarm.cli import cli


def test_cli_help_lists_commands():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "bootstrap-venues" in result.output
    assert "ingest-manual" in result.output
    assert "sync-markets" in result.output
    assert "refresh-catalog" in result.output
    assert "job" in result.output
