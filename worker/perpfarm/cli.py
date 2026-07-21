from pathlib import Path

import click

from perpfarm.db import make_engine
from perpfarm.ingest.manual import IngestError, ingest_manual
from perpfarm.ingest.markets import sync_markets
from perpfarm.ingest.venues import bootstrap_venues
from perpfarm.jobs.catalog import refresh_catalog
from perpfarm.jobs.fee_watch import run_fee_watch
from perpfarm.jobs.sync_snapshots import run_sync_snapshots

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


def _do_refresh_catalog(engine, fixtures_dir: Path, data_dir: Path) -> None:
    """Shared by the `refresh-catalog` command and the auto-refresh at the
    start of the nightly job. Echoes a summary; raises ClickException if any
    venue's market sync failed."""
    summary = refresh_catalog(engine, fixtures_dir=fixtures_dir, data_dir=data_dir)
    click.echo(
        f"refresh-catalog: {summary.venues} venue(s), {summary.manual_rows} manual row(s), "
        f"{summary.markets_synced} market(s) synced, {summary.markets_skipped} venue(s) not wired up"
    )
    for slug, msg in summary.errors:
        click.echo(f"  error: {slug}: {msg}", err=True)
    if summary.errors:
        raise click.ClickException(f"{len(summary.errors)} venue(s) failed to sync markets")


@cli.command("refresh-catalog")
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
def refresh_catalog_cmd(fixtures_dir: Path, data_dir: Path) -> None:
    """Register venues + ingest manual data + sync all market lists (one shot).

    Idempotent -- safe to run on a schedule (the daily cron runs this). Picks
    up any venue/market/manual change so new listings enter the DB and
    sync-snapshots starts collecting them.
    """
    engine = make_engine()
    try:
        _do_refresh_catalog(engine, fixtures_dir, data_dir)
    except IngestError as exc:
        raise click.ClickException(str(exc)) from exc


@cli.command("job")
@click.argument("name", type=click.Choice(["fee-watch", "sync-snapshots"]))
@click.option("--as-of", type=click.DateTime(formats=["%Y-%m-%d"]), default=None)
@click.option(
    "--fixtures-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_FIXTURES_DIR,
    show_default=True,
    help="Used by fee-watch/sync-snapshots to build fixture-venue adapters.",
)
@click.option(
    "--data-dir",
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    default=DEFAULT_DATA_DIR,
    show_default=True,
    help="Manual-YAML dir; used by the catalog refresh that runs before sync-snapshots.",
)
@click.option(
    "--skip-refresh",
    is_flag=True,
    help="Skip the catalog refresh that runs before sync-snapshots.",
)
def job_cmd(name: str, as_of, fixtures_dir: Path, data_dir: Path, skip_refresh: bool) -> None:
    """Run a scheduled job (production, DB-backed)."""
    engine = make_engine()
    as_of_date = as_of.date() if as_of else None
    if name == "fee-watch":
        summary = run_fee_watch(engine, fixtures_dir=fixtures_dir, as_of=as_of_date)
        click.echo(
            f"fee-watch: {summary.updated} updated, {summary.alerted} alert(s), "
            f"{summary.unchanged} unchanged, {summary.skipped} skipped"
        )
        for slug, msg in summary.errors:
            click.echo(f"  error: {slug}: {msg}", err=True)
        if summary.errors:
            raise click.ClickException(f"{len(summary.errors)} venue(s) failed")
    elif name == "sync-snapshots":
        # Refresh the catalog first so new listings enter the DB and get
        # collected this same hour. Non-fatal: a catalog hiccup (one venue's
        # market-list API down) must never stop snapshot collection.
        if not skip_refresh:
            try:
                _do_refresh_catalog(engine, fixtures_dir, data_dir)
            except (IngestError, click.ClickException) as exc:
                click.echo(f"  refresh-catalog skipped: {exc}", err=True)
        summary = run_sync_snapshots(engine, fixtures_dir=fixtures_dir)
        click.echo(
            f"sync-snapshots: {summary.written} written, {summary.skipped} skipped"
        )
        for market, msg in summary.errors:
            click.echo(f"  error: {market}: {msg}", err=True)
        if summary.errors:
            raise click.ClickException(f"{len(summary.errors)} market(s) failed")


if __name__ == "__main__":
    cli()
