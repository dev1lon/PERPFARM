"""Fee-page diff watcher: detects maker/taker fee-schedule changes per venue.

For every registered venue, fetches the current fee schedule via its adapter
and compares it to the latest `fee_schedules` row. A change (or the venue's
first-ever observation) writes a new row; a change against a *prior*
observation also writes an `alerts` row (kind='fee_change') so a future
notifier can pick it up -- this job only detects and records, it does not
deliver notifications (no delivery channel is wired up yet).

Adapters that raise NotImplementedError (all real venues, as of this
writing -- see the TODO(verify) markers in perpfarm/adapters/*.py) are
skipped, not treated as errors: they simply haven't been wired up to a real
API yet, which is expected, not a fee-watch failure.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from hashlib import sha256
from pathlib import Path

from sqlalchemy import Engine, select

from perpfarm.adapters.base import FeeData
from perpfarm.adapters.registry import REGISTRY, build_adapter
from perpfarm.schema import alerts, fee_schedules, venues


def fee_hash(maker_bps: float, taker_bps: float) -> str:
    """Stable fingerprint of a fee schedule, used to detect changes without
    storing/diffing a full raw page snapshot. Inputs are normalized through
    float() first: an adapter switching between int and float for the same
    value (JSON `5` vs `5.0`) must not read as a fee change."""
    return sha256(f"{float(maker_bps)}:{float(taker_bps)}".encode()).hexdigest()


@dataclass(frozen=True)
class FeeChange:
    """A detected change against the previous observation."""

    venue_slug: str
    previous_maker_bps: float
    previous_taker_bps: float
    current_maker_bps: float
    current_taker_bps: float
    source_url: str | None


def build_alert_payload(change: FeeChange) -> dict:
    return {
        "venue": change.venue_slug,
        "previous": {
            "maker_bps": change.previous_maker_bps,
            "taker_bps": change.previous_taker_bps,
        },
        "current": {
            "maker_bps": change.current_maker_bps,
            "taker_bps": change.current_taker_bps,
        },
        "source_url": change.source_url,
    }


@dataclass
class FeeWatchSummary:
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    alerted: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)


def _latest_fee_row(conn, venue_id: int):
    stmt = (
        select(fee_schedules.c.maker_bps, fee_schedules.c.taker_bps, fee_schedules.c.raw_hash)
        .where(fee_schedules.c.venue_id == venue_id)
        .order_by(fee_schedules.c.created_at.desc())
        .limit(1)
    )
    return conn.execute(stmt).first()


def run_fee_watch(
    engine: Engine,
    *,
    fixtures_dir: Path,
    as_of: date | None = None,
) -> FeeWatchSummary:
    as_of = as_of or datetime.now(timezone.utc).date()
    summary = FeeWatchSummary()

    with engine.begin() as conn:
        # NOT dict(conn.execute(...)): CursorResult has a .keys() method, so
        # dict() takes the mapping path and dies with "'CursorResult' object
        # is not subscriptable" instead of iterating the rows.
        venue_ids = {slug: venue_id for slug, venue_id in conn.execute(select(venues.c.slug, venues.c.id))}

        for reg in REGISTRY:
            # Fixtures quote made-up schedules -- venue_alpha's is a NEGATIVE
            # maker fee (a rebate).  Written into fee_schedules it does not just
            # add noise: it makes a synthetic venue the cheapest maker side on
            # the whole platform, so every "lowest cost route" comparison picks
            # it.  Every other writer already skips fixtures; this one did not.
            if reg.is_fixture:
                summary.skipped += 1
                continue

            venue_id = venue_ids.get(reg.slug)
            if venue_id is None:
                # not bootstrapped yet -- `perpfarm bootstrap-venues` hasn't
                # run for this venue; skip rather than fail the whole batch
                summary.skipped += 1
                continue

            try:
                adapter = build_adapter(reg.slug, fixtures_dir)
                fee: FeeData = adapter.get_fees()
            except NotImplementedError:
                summary.skipped += 1
                continue
            except Exception as exc:  # noqa: BLE001 -- one venue must not sink the batch
                summary.errors.append((reg.slug, str(exc)))
                continue

            new_hash = fee_hash(fee.maker_bps, fee.taker_bps)
            previous = _latest_fee_row(conn, venue_id)

            if previous is not None and previous.raw_hash == new_hash:
                summary.unchanged += 1
                continue

            conn.execute(
                fee_schedules.insert().values(
                    venue_id=venue_id,
                    maker_bps=fee.maker_bps,
                    taker_bps=fee.taker_bps,
                    effective_from=as_of,
                    source_url=fee.source_url,
                    raw_hash=new_hash,
                )
            )
            summary.updated += 1

            if previous is not None:
                change = FeeChange(
                    venue_slug=reg.slug,
                    # previous.*_bps come back from Postgres as decimal.Decimal
                    # (Numeric columns) -- not JSON-serializable as-is, and
                    # payload_json below is a JSONB column.
                    previous_maker_bps=float(previous.maker_bps),
                    previous_taker_bps=float(previous.taker_bps),
                    current_maker_bps=fee.maker_bps,
                    current_taker_bps=fee.taker_bps,
                    source_url=fee.source_url,
                )
                conn.execute(
                    alerts.insert().values(
                        venue_id=venue_id,
                        kind="fee_change",
                        payload_json=build_alert_payload(change),
                    )
                )
                summary.alerted += 1

    return summary
