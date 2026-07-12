from pathlib import Path

import click

from perpfarm.db import make_engine
from perpfarm.ingest.manual import IngestError, ingest_manual
from perpfarm.ingest.markets import sync_markets
from perpfarm.ingest.venues import bootstrap_venues
from perpfarm.jobs.fee_watch import run_fee_watch
from perpfarm.jobs.nightly import run_nightly
from perpfarm.scoring.engine import score_route
from perpfarm.scoring.fixture_loader import load_common_routes
from perpfarm.scoring.types import ScoringParams

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = REPO_ROOT / "data" / "manual"
DEFAULT_FIXTURES_DIR = REPO_ROOT / "data" / "fixtures"


@click.group()
def cli() -> None:
    """perpfarm worker CLI."""


@cli.command("bootstrap-venues")
@click.option("--dry-run", is_flag=True, help="Print what would happen without writing to the DB.")
def bootstrap_venues_cmd(dry_run: bool) -> None:
    """Upsert `venues` rows from the adapter registry."""
    engine = make_engine()
    count = bootstrap_venues(engine, dry_run=dry_run)
    click.echo(f"upserted {count} venue(s){' (dry run)' if dry_run else ''}")


@cli.command("ingest-manual")
@click.option(
    "--data-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_DATA_DIR,
    show_default=True,
)
@click.option("--dry-run", is_flag=True, help="Validate and print without writing to the DB.")
def ingest_manual_cmd(data_dir: Path, dry_run: bool) -> None:
    """Validate and upsert data/manual/*.yaml into the manual tables."""
    engine = make_engine()
    try:
        summary = ingest_manual(engine, data_dir, dry_run=dry_run)
    except IngestError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(
        f"points_programs={summary.points_programs} pair_weights={summary.pair_weights} "
        f"venue_meta={summary.venue_meta} execution_rules={summary.execution_rules}"
        f"{' (dry run)' if dry_run else ''}"
    )


@cli.command("sync-markets")
@click.argument("slug")
@click.option(
    "--fixtures-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_FIXTURES_DIR,
    show_default=True,
)
@click.option(
    "--data-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_DATA_DIR,
    show_default=True,
)
@click.option("--dry-run", is_flag=True, help="Fetch and print without writing to the DB.")
def sync_markets_cmd(slug: str, fixtures_dir: Path, data_dir: Path, dry_run: bool) -> None:
    """Sync the `markets` table for one venue slug from its adapter."""
    engine = make_engine()
    overrides_path = data_dir / "symbol_overrides.yaml"
    try:
        count = sync_markets(
            engine, slug, fixtures_dir=fixtures_dir, overrides_path=overrides_path, dry_run=dry_run
        )
    except (KeyError, RuntimeError, NotImplementedError) as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(f"synced {count} market(s) for '{slug}'{' (dry run)' if dry_run else ''}")


@cli.command("print-routes")
@click.option(
    "--fixtures-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_FIXTURES_DIR,
    show_default=True,
)
@click.option(
    "--data-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_DATA_DIR,
    show_default=True,
)
@click.option("--notional", type=float, default=10_000.0, show_default=True, help="Notional per leg, USD.")
@click.option("--hold-hours", type=float, default=24.0, show_default=True, help="Hold time H, hours.")
def print_routes_cmd(fixtures_dir: Path, data_dir: Path, notional: float, hold_hours: float) -> None:
    """Score every route from the fixture venues and print a ranked table.

    No DB required -- reads data/fixtures/*/*.json + data/manual/*.yaml
    directly. Dev/demo tool only; production scores come from `job nightly`.
    """
    params = ScoringParams(notional_usd=notional, hold_hours=hold_hours)
    routes = load_common_routes(fixtures_dir, data_dir)
    scored = [
        (symbol, long_slug, short_slug, score_route(long_leg, short_leg, params))
        for symbol, long_slug, short_slug, long_leg, short_leg in routes
    ]
    scored.sort(
        key=lambda item: (
            item[3].cost_per_point_usd is None,
            item[3].cost_per_point_usd if item[3].cost_per_point_usd is not None else 0.0,
        )
    )

    header = (
        f"{'PAIR':<6} {'ROUTE':<24} {'COST/PT':>12} {'PTS/$1M':>10} "
        f"{'LONG':<6} {'SHORT':<6} {'WEEKLY $':>10}  OK"
    )
    click.echo(header)
    click.echo("-" * len(header))
    for symbol, long_slug, short_slug, result in scored:
        route_label = f"{long_slug}->{short_slug}"
        if result.is_complete:
            cost_per_point = (
                f"${result.cost_per_point_usd:.6f}" if result.cost_per_point_usd is not None else "n/a"
            )
            pts_1m = (
                f"{result.points_per_1m_volume:,.0f}" if result.points_per_1m_volume is not None else "n/a"
            )
            long_type = result.recommended_execution["long"]["order_type"]
            short_type = result.recommended_execution["short"]["order_type"]
            weekly = f"${result.weekly_cost_usd:,.2f}" if result.weekly_cost_usd is not None else "n/a"
            ok = "yes"
        else:
            cost_per_point = pts_1m = long_type = short_type = weekly = "-"
            ok = "no"
        click.echo(
            f"{symbol:<6} {route_label:<24} {cost_per_point:>12} {pts_1m:>10} "
            f"{long_type:<6} {short_type:<6} {weekly:>10}  {ok}"
        )

    incomplete = [r for _, _, _, r in scored if not r.is_complete]
    if incomplete:
        click.echo("")
        click.echo(f"{len(incomplete)} route(s) incomplete -- see data_freshness.incomplete_reasons")


@cli.command("job")
@click.argument("name", type=click.Choice(["nightly", "fee-watch"]))
@click.option("--as-of", type=click.DateTime(formats=["%Y-%m-%d"]), default=None)
@click.option(
    "--fixtures-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_FIXTURES_DIR,
    show_default=True,
    help="Used by fee-watch to build fixture-venue adapters; ignored by nightly.",
)
def job_cmd(name: str, as_of, fixtures_dir: Path) -> None:
    """Run a scheduled job (production, DB-backed)."""
    engine = make_engine()
    as_of_date = as_of.date() if as_of else None
    if name == "nightly":
        count = run_nightly(engine, as_of=as_of_date)
        click.echo(f"nightly: wrote {count} route_scores row(s)")
    elif name == "fee-watch":
        summary = run_fee_watch(engine, fixtures_dir=fixtures_dir, as_of=as_of_date)
        click.echo(
            f"fee-watch: {summary.updated} updated, {summary.alerted} alert(s), "
            f"{summary.unchanged} unchanged, {summary.skipped} skipped"
        )
        for slug, msg in summary.errors:
            click.echo(f"  error: {slug}: {msg}", err=True)
        if summary.errors:
            raise click.ClickException(f"{len(summary.errors)} venue(s) failed")


if __name__ == "__main__":
    cli()
