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

A venue in maintenance answers nothing for a few minutes, but the cron only
comes back in an hour -- so one badly timed run used to cost a whole hour of
that venue's history. Whatever a later attempt could still fix is therefore
retried inside the same run, a few minutes apart, until the hour runs out.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Engine, inspect, select

from perpfarm.adapters.base import MarketUnavailable, OrderbookTop, VenueAdapter
from perpfarm.adapters.registry import FIXTURE_SLUGS, build_adapter
from perpfarm.jobs.hedge_recommendations import run_hedge_recommendations
from perpfarm.schema import (
    book_snapshots,
    funding_snapshots,
    mark_snapshots,
    markets,
    venues,
    volume_snapshots,
)

#: Five minutes apart, five times: the last attempt lands ~25 minutes in, so a
#: venue that comes back from maintenance any time inside that window still
#: gets its reading for the hour.
RETRY_DELAY_SECONDS = 300
MAX_RETRY_ROUNDS = 5
#: Hard stop, measured from the job's own start. The retries above cannot reach
#: it on their own; this exists so a run that is ALREADY slow (a hanging venue
#: API, hundreds of markets) can never still be retrying when the next hourly
#: cron starts writing the same rows.
RETRY_WINDOW_MINUTES = 45

#: How many markets' rows are held before they are written. Each batch is one
#: transaction and four statements, so a 700-market run costs ~28 round trips to
#: the database instead of ~2 800. Small enough that an interrupted run loses at
#: most this many markets' readings.
WRITE_BATCH_SIZE = 100

#: One market's fate in one attempt.
#: - "written"     -- snapshots committed.
#: - "unwired"     -- no adapter for this venue yet. Permanent; never retried.
#: - "unavailable" -- the venue answered, this market is closed (weekend FX).
#: - "error"       -- anything else: network, API 5xx, a failed DB write.
Outcome = tuple[str, str]
#: `(venue slug, market id, venue-native symbol)` -- one unit of collection.
Target = tuple[str, int, str]


@dataclass
class SnapshotSyncSummary:
    written: int = 0
    skipped: int = 0
    # Which markets were skipped and why. A bare count could not answer "why is
    # UVXY two hours stale?" -- the reason was discarded at the moment we had it.
    skips: list[tuple[str, str]] = field(default_factory=list)
    errors: list[tuple[str, str]] = field(default_factory=list)
    #: Retry rounds actually run, and markets they rescued. Both zero is the
    #: normal hour; a non-zero `recovered` is history that used to be lost.
    retry_rounds: int = 0
    recovered: int = 0


def _serialize_quote_curve(book: OrderbookTop) -> dict[str, object] | None:
    """Keep a venue's actual quote/depth anchors in one snapshot row."""

    curve = book.quote_curve
    if curve is None:
        return None
    return {
        "reference_price": curve.reference_price,
        "points": [
            {"notional_usd": point.notional_usd, "bid": point.bid, "ask": point.ask}
            for point in curve.points
        ],
    }


def _mark_price(book: OrderbookTop) -> float | None:
    """The venue's own price for this instrument, for the drift measure.

    Prefers the quote curve's reference price -- that is the venue's mark. A
    book without a curve falls back to the mid, which answers the same question
    to within a spread, and a spread is far smaller than the gaps this measures.
    """

    if book.quote_curve is not None and book.quote_curve.reference_price > 0:
        return float(book.quote_curve.reference_price)
    if book.best_bid > 0 and book.best_ask > 0:
        return (float(book.best_bid) + float(book.best_ask)) / 2
    return None


@dataclass
class _Reading:
    """One market's rows, read but not yet written."""

    target: Target
    book: dict[str, object]
    funding: dict[str, object]
    volume: dict[str, object]
    mark: dict[str, object] | None


def _read_market(
    adapter: VenueAdapter,
    *,
    target: Target,
    ts: datetime,
    has_native_quote_curve: bool,
    has_mark_snapshots: bool,
) -> tuple[_Reading | None, Outcome | None]:
    """Read one market from its venue. Never raises; never touches the DB."""

    _slug, market_id, symbol = target
    try:
        book = adapter.get_orderbook_top(symbol)
        funding = adapter.get_funding(symbol)
        volume = adapter.get_volume(symbol)
    except NotImplementedError as reason:
        return None, ("unwired", str(reason) or type(reason).__name__)
    except MarketUnavailable as reason:
        return None, ("unavailable", str(reason) or type(reason).__name__)
    except Exception as exc:  # noqa: BLE001 -- one market must not sink the batch
        return None, ("error", str(exc))

    book_values: dict[str, object] = {
        "market_id": market_id,
        "ts": ts,
        "best_bid": book.best_bid,
        "best_ask": book.best_ask,
        "spread_bps": book.spread_bps,
        "impact_bps_10k": book.impact_bps_10k,
        "impact_bps_50k": book.impact_bps_50k,
        "impact_bps_100k": book.impact_bps_100k,
        "depth_usd_10k": book.depth_usd_10k,
        "depth_usd_50k": book.depth_usd_50k,
        "depth_usd_100k": book.depth_usd_100k,
    }
    # Present on every row of a batch or on none of them: one executemany
    # cannot mix two column sets. It is a run-level flag, so it does not vary.
    if has_native_quote_curve:
        book_values["quote_curve_json"] = _serialize_quote_curve(book)
    mark = _mark_price(book)
    return (
        _Reading(
            target=target,
            book=book_values,
            funding={
                "market_id": market_id,
                "ts": ts,
                "funding_rate_raw": funding.funding_rate_raw,
                "interval_hours": funding.interval_hours,
                "funding_rate_annualized": funding.funding_rate_annualized,
            },
            volume={
                "market_id": market_id,
                "ts": ts,
                "volume_24h_usd": volume.volume_24h_usd,
                "open_interest_usd": volume.open_interest_usd,
            },
            mark=(
                {"market_id": market_id, "ts": ts, "mark": mark}
                if has_mark_snapshots and mark is not None
                else None
            ),
        ),
        None,
    )


def _write_one(engine: Engine, reading: _Reading) -> Outcome:
    """One market, one transaction -- the fallback when a batch fails."""

    try:
        with engine.begin() as conn:
            conn.execute(book_snapshots.insert().values(**reading.book))
            conn.execute(funding_snapshots.insert().values(**reading.funding))
            if reading.mark is not None:
                conn.execute(mark_snapshots.insert().values(**reading.mark))
            conn.execute(volume_snapshots.insert().values(**reading.volume))
    except Exception as exc:  # noqa: BLE001 -- same isolation as the fetch phase
        return "error", str(exc)
    return "written", ""


def _write_batch(engine: Engine, readings: list[_Reading]) -> dict[Target, Outcome]:
    """Write a batch of markets in one transaction, four statements.

    Every row carries exactly the values `_read_market` produced, stamped with
    the run's own timestamp -- batching changes how many round trips a run costs
    (four per hundred markets instead of four per market), never a stored value.

    A batch that fails is retried one market at a time, so a single bad row
    costs its own market and not the ninety-nine around it. That is the
    isolation the per-market transactions existed for, kept at the price of one
    extra pass in the rare case that something actually fails.
    """

    if not readings:
        return {}
    try:
        with engine.begin() as conn:
            conn.execute(book_snapshots.insert(), [reading.book for reading in readings])
            conn.execute(funding_snapshots.insert(), [reading.funding for reading in readings])
            marks = [reading.mark for reading in readings if reading.mark is not None]
            if marks:
                conn.execute(mark_snapshots.insert(), marks)
            conn.execute(volume_snapshots.insert(), [reading.volume for reading in readings])
    except Exception:  # noqa: BLE001 -- fall back to per-market isolation
        return {reading.target: _write_one(engine, reading) for reading in readings}
    return {reading.target: ("written", "") for reading in readings}


def _run_round(
    engine: Engine,
    targets: list[Target],
    *,
    fixtures_dir: Path,
    ts: datetime,
    has_native_quote_curve: bool,
    has_mark_snapshots: bool,
) -> dict[Target, Outcome]:
    """One full pass over `targets`, returning what happened to each."""

    # One adapter per venue for the whole pass, not per market: real adapters
    # cache venue-level API responses (e.g. Hibachi's exchange-info, needed
    # for orderbook granularity) on the instance, so rebuilding per market
    # would re-fetch that once per market instead of once per venue. They are
    # NOT carried across rounds, though -- a venue that was mid-deploy may have
    # answered that venue-level call with something useless, and a retry that
    # reuses it would keep failing for a reason that is already fixed.
    adapters: dict[str, VenueAdapter] = {}
    outcomes: dict[Target, Outcome] = {}
    batch: list[_Reading] = []

    for target in targets:
        slug, _market_id, _symbol = target
        if slug not in adapters:
            try:
                adapters[slug] = build_adapter(slug, fixtures_dir)
            except NotImplementedError as reason:
                outcomes[target] = ("unwired", str(reason) or type(reason).__name__)
                continue
            except Exception as exc:  # noqa: BLE001 -- a venue must not sink the batch
                outcomes[target] = ("error", str(exc))
                continue
        reading, failure = _read_market(
            adapters[slug],
            target=target,
            ts=ts,
            has_native_quote_curve=has_native_quote_curve,
            has_mark_snapshots=has_mark_snapshots,
        )
        if failure is not None:
            outcomes[target] = failure
            continue
        assert reading is not None  # no failure means a reading
        batch.append(reading)
        # Flushed as it fills rather than at the end of the pass: an interrupted
        # run then keeps everything up to the last full batch, which is what
        # committing per market used to give.
        if len(batch) >= WRITE_BATCH_SIZE:
            outcomes.update(_write_batch(engine, batch))
            batch = []

    outcomes.update(_write_batch(engine, batch))
    return outcomes


def _retry_targets(outcomes: dict[Target, Outcome]) -> list[Target]:
    """Which of a round's failures a later attempt could still fix.

    An unwired adapter never fixes itself, so it is never retried. A market its
    venue reports as closed does not reopen in five minutes either -- unless
    NOTHING on that venue answered, which is what maintenance looks like from
    here, and is exactly the case worth coming back for.
    """

    answered = {slug for (slug, _, _), (kind, _) in outcomes.items() if kind == "written"}
    return [
        target
        for target, (kind, _) in outcomes.items()
        if kind == "error" or (kind == "unavailable" and target[0] not in answered)
    ]


def run_sync_snapshots(
    engine: Engine,
    *,
    fixtures_dir: Path,
    sleep: Callable[[float], None] = time.sleep,
) -> SnapshotSyncSummary:
    summary = SnapshotSyncSummary()
    # The migration is deliberately manual in Render. Keep the hourly job
    # backwards-compatible during the deploy window: existing snapshot writes
    # continue until the JSONB column is present, then native curves begin to
    # be retained automatically without another code change.
    has_native_quote_curve = any(
        column["name"] == "quote_curve_json" for column in inspect(engine).get_columns("book_snapshots")
    )
    # Same deploy-window rule as the column above: the migration runs by hand,
    # so the job has to keep writing everything else until the table appears.
    has_mark_snapshots = inspect(engine).has_table("mark_snapshots")

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

    started = datetime.now(timezone.utc)
    pending: list[Target] = [(slug, market_id, symbol) for slug, market_id, symbol in rows]
    outcomes: dict[Target, Outcome] = {}
    first_pass: dict[Target, Outcome] = {}

    for attempt in range(MAX_RETRY_ROUNDS + 1):
        if attempt:
            sleep(RETRY_DELAY_SECONDS)
            summary.retry_rounds = attempt
        # Each round stamps its own time. These rows really were read twenty
        # minutes after the rest, and the freshness the site reports is measured
        # off that timestamp -- backdating a retry to the top of the hour would
        # make a venue that missed the run look like it never did.
        round_outcomes = _run_round(
            engine,
            pending,
            fixtures_dir=fixtures_dir,
            ts=datetime.now(timezone.utc),
            has_native_quote_curve=has_native_quote_curve,
            has_mark_snapshots=has_mark_snapshots,
        )
        outcomes.update(round_outcomes)
        if not attempt:
            first_pass = dict(round_outcomes)

        pending = _retry_targets(round_outcomes)
        if not pending:
            break
        if (datetime.now(timezone.utc) - started).total_seconds() / 60 >= RETRY_WINDOW_MINUTES:
            break

    for target, (kind, reason) in outcomes.items():
        slug, _, symbol = target
        name = f"{slug}:{symbol}"
        if kind == "written":
            if first_pass.get(target, ("", ""))[0] != "written":
                summary.recovered += 1
            summary.written += 1
        elif kind == "error":
            summary.errors.append((name, reason))
        else:
            summary.skipped += 1
            summary.skips.append((name, reason))

    # This is deliberately after every market write, retries included. The
    # compact hedge card must describe one coherent snapshot run, never
    # calculate every venue when somebody opens a page -- and a venue that came
    # back on the third attempt has to be in the comparison it feeds.
    recommendations = run_hedge_recommendations(engine, ts=datetime.now(timezone.utc))
    if recommendations.errors:
        summary.errors.extend(("hedge-recommendations", error) for error in recommendations.errors)

    return summary
