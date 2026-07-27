"""Market-data snapshot sync: writes book/funding/volume snapshots per active market.

Populates the three DB observation tables (`book_snapshots`,
`funding_snapshots`, `volume_snapshots`) used by the request-time route
calculator. `sync-markets` only maintains the market list; this job records
the quote-impact, funding, volume, and OI history needed for ranking.

It runs hourly so a 24-hour median contains multiple independent samples
rather than one stale observation.

Each market's fetch (network/API calls, can raise `NotImplementedError` for
an unwired adapter, or any other exception for a transient failure) is
isolated from its DB write, and each write is its own small transaction --
deliberately not one transaction for the whole run, so one bad market can't
poison writes already committed for others.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Engine, select

from perpfarm.adapters.base import MarketUnavailable, VenueAdapter
from perpfarm.adapters.registry import FIXTURE_SLUGS, build_adapter
from perpfarm.schema import book_snapshots, funding_snapshots, markets, venues, volume_snapshots


@dataclass
class SnapshotSyncSummary:
    written: int = 0
    skipped: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)


def run_sync_snapshots(engine: Engine, *, fixtures_dir: Path) -> SnapshotSyncSummary:
    ts = datetime.now(timezone.utc)
    summary = SnapshotSyncSummary()

    with engine.connect() as read_conn:
        rows = read_conn.execute(
            select(venues.c.slug, markets.c.id, markets.c.symbol)
            .select_from(markets.join(venues, markets.c.venue_id == venues.c.id))
            .where(markets.c.is_active.is_(True))
            # Never snapshot fixture venues: they should never be in a real DB,
            # but if a stale row survives a cleanup this keeps the cron from
            # choking on it (and from resurrecting fixture book data).
            .where(venues.c.slug.not_in(FIXTURE_SLUGS))
        ).all()

    # One adapter per venue for the whole run, not per market: real adapters
    # cache venue-level API responses (e.g. Hibachi's exchange-info, needed
    # for orderbook granularity) on the instance, so rebuilding per market
    # would re-fetch that once per market instead of once per venue.
    adapters: dict[str, VenueAdapter] = {}

    for slug, market_id, symbol in rows:
        try:
            if slug not in adapters:
                adapters[slug] = build_adapter(slug, fixtures_dir)
            adapter = adapters[slug]
            book = adapter.get_orderbook_top(symbol)
            funding = adapter.get_funding(symbol)
            volume = adapter.get_volume(symbol)
        except (NotImplementedError, MarketUnavailable):
            # unwired adapter, or a market that's temporarily closed (weekend
            # FX/metals): expected, skip -- don't fail the whole run.
            summary.skipped += 1
            continue
        except Exception as exc:  # noqa: BLE001 -- one market must not sink the batch
            summary.errors.append((f"{slug}:{symbol}", str(exc)))
            continue

        try:
            with engine.begin() as conn:
                conn.execute(
                    book_snapshots.insert().values(
                        market_id=market_id,
                        ts=ts,
                        best_bid=book.best_bid,
                        best_ask=book.best_ask,
                        spread_bps=book.spread_bps,
                        impact_bps_10k=book.impact_bps_10k,
                        impact_bps_50k=book.impact_bps_50k,
                        impact_bps_100k=book.impact_bps_100k,
                        depth_usd_10k=book.depth_usd_10k,
                        depth_usd_50k=book.depth_usd_50k,
                        depth_usd_100k=book.depth_usd_100k,
                    )
                )
                conn.execute(
                    funding_snapshots.insert().values(
                        market_id=market_id,
                        ts=ts,
                        funding_rate_raw=funding.funding_rate_raw,
                        interval_hours=funding.interval_hours,
                        funding_rate_annualized=funding.funding_rate_annualized,
                    )
                )
                conn.execute(
                    volume_snapshots.insert().values(
                        market_id=market_id,
                        ts=ts,
                        volume_24h_usd=volume.volume_24h_usd,
                        open_interest_usd=volume.open_interest_usd,
                    )
                )
        except Exception as exc:  # noqa: BLE001 -- same isolation as the fetch phase
            summary.errors.append((f"{slug}:{symbol}", str(exc)))
            continue

        summary.written += 1

    return summary
