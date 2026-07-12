from click.testing import CliRunner

from perpfarm.cli import cli


def test_cli_help_lists_commands():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "bootstrap-venues" in result.output
    assert "ingest-manual" in result.output
    assert "sync-markets" in result.output
    assert "print-routes" in result.output
    assert "job" in result.output


def test_print_routes_scores_fixture_venues_end_to_end():
    """No DB involved -- this is the fully offline-runnable proof that
    adapters -> manual YAML -> scoring engine are wired together correctly."""
    runner = CliRunner()
    result = runner.invoke(cli, ["print-routes"])
    assert result.exit_code == 0, result.output
    assert "PEPE" in result.output
    assert "BTC" in result.output
    assert "venue_alpha->venue_beta" in result.output
    assert "venue_beta->venue_alpha" in result.output
