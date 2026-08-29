"""TxFlow's own published analytics, taken from Dune once an hour and stored.

TxFlow's numbers live on its official Dune dashboard, and the website used to
read them at request time: five saved-query results per cache miss. That made
one of our charts depend on a third party being up at the moment a visitor
arrived, and it left us with no history of our own -- when a query on that
dashboard is edited, our chart changes with it and we have nothing to compare
against.

So the worker asks Dune, and the site reads Postgres. One row per day, in the
same `venue_daily_stats` table every other protocol's chart is drawn from.

The API key is read from the environment. Without it the job says so and does
nothing -- the site then falls back to asking Dune directly, exactly as before,
so a missing key costs freshness, never a chart.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Mapping, Sequence

import httpx
from sqlalchemy import Engine, text

DUNE_RESULTS_URL = "https://api.dune.com/api/v1/query"
DUNE_TIMEOUT_SECONDS = 25
#: Dune caps a result page; these daily series are far shorter than this.
DUNE_ROW_LIMIT = 1000

#: Column names each figure may arrive under, most specific first. Dune column
#: titles are prose ("Total Traders (latest day)"), so they are normalised to
#: letters and digits before matching -- and an EXACT match always beats a
#: substring one, because the volume query returns both `volume` and a
#: cumulative `total_volume`, and plotting the latter as a daily bar would draw
#: a line that only ever goes up.
VOLUME_NAMES = ("volume",)
VOLUME_24H_NAMES = ("totalvolume24h", "volume24h", "totalvolume")
OPEN_INTEREST_NAMES = ("totaloilatest1h", "totaloi", "openinterest", "oi")
NEW_TRADERS_NAMES = ("newtradersdaily", "newtraders", "newusers", "newaddresses")
TOTAL_TRADERS_NAMES = ("totaltraderslatestday", "totaltraders", "uniquetraders", "uniqueusers")
DATE_NAMES = ("date", "day", "blockdate", "period")


@dataclass(frozen=True)
class DuneVenue:
    """The saved queries that describe one protocol on its own dashboard."""

    slug: str
    volume_history: str
    open_interest: str
    new_traders: str
    #: Rolling figures, refreshed every 6h on Dune. They describe NOW rather
    #: than a calendar day, so they land on today's row -- which is what the
    #: site's headline already read, and what the Variational chart already
    #: does with that venue's live totals.
    volume_24h: str
    total_traders: str


DUNE_VENUES: tuple[DuneVenue, ...] = (
    DuneVenue(
        slug="txflow",
        volume_history="6679693",
        open_interest="6678737",
        new_traders="6679496",
        volume_24h="6678797",
        total_traders="6678847",
    ),
)

_UPSERT_SQL = """
INSERT INTO venue_daily_stats (
  venue_id, day, volume_24h_usd, open_interest_usd, unique_traders, source, updated_at
)
VALUES (:venue_id, :day, :volume, :open_interest, :traders, 'dune', now())
ON CONFLICT (venue_id, day) DO UPDATE
SET volume_24h_usd = COALESCE(EXCLUDED.volume_24h_usd, venue_daily_stats.volume_24h_usd),
    open_interest_usd = COALESCE(EXCLUDED.open_interest_usd, venue_daily_stats.open_interest_usd),
    unique_traders = COALESCE(EXCLUDED.unique_traders, venue_daily_stats.unique_traders),
    source = 'dune',
    updated_at = now()
"""


@dataclass
class DuneSyncSummary:
    written: int = 0
    #: True when there is no API key: not an error, just nothing to do.
    skipped: bool = False
    errors: list[str] = field(default_factory=list)


def _normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def column_value(row: Mapping[str, Any], names: Sequence[str]) -> Any:
    """The column matching one of `names`: exact match first, then substring."""

    columns = [(_normalise(key), value) for key, value in row.items()]
    for name in names:
        for normalised, value in columns:
            if normalised == name:
                return value
    for name in names:
        for normalised, value in columns:
            if name in normalised:
                return value
    return None


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        return None
    return parsed


def row_day(row: Mapping[str, Any]) -> date | None:
    raw = column_value(row, DATE_NAMES)
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    value = str(raw)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


def fetch_rows(query_id: str, api_key: str) -> list[dict[str, Any]]:
    """The saved result of one Dune query, or an empty list."""

    response = httpx.get(
        f"{DUNE_RESULTS_URL}/{query_id}/results",
        params={"limit": DUNE_ROW_LIMIT},
        headers={"X-Dune-Api-Key": api_key},
        timeout=DUNE_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("result", {}).get("rows") if isinstance(payload, dict) else None
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def daily_series(rows: Sequence[Mapping[str, Any]], names: Sequence[str]) -> dict[date, float]:
    """One value per day, keyed by the row's OWN date column.

    Never by row position: the order a Dune result arrives in is not part of
    any contract we control, and trusting it once drew TxFlow's launch day as
    today's open interest.
    """

    series: dict[date, float] = {}
    for row in rows:
        day = row_day(row)
        value = _number(column_value(row, names))
        if day is not None and value is not None:
            series[day] = value
    return series


def cumulative_traders(rows: Sequence[Mapping[str, Any]]) -> dict[date, int]:
    """Dune publishes NEW traders per day; the running total is built here.

    Only from those daily counts -- never rebased onto the separate all-time
    card, whose refresh time differs, because that offset would then be spread
    backwards over every past day.
    """

    daily = daily_series(rows, NEW_TRADERS_NAMES)
    running = 0.0
    totals: dict[date, int] = {}
    for day in sorted(daily):
        running += daily[day]
        totals[day] = int(running)
    return totals


def today_trader_count(traders: Mapping[date, int], card: float | None) -> int | None:
    """Today's distinct-trader count: the card, but never below what is known.

    The two Dune queries disagree by a few dozen -- the daily counts sum past
    the all-time card -- and on a day the daily series has not reached yet
    there is no entry for today at all. Storing the card raw then made the
    curve DROP: 6,905 traders yesterday, 6,849 today, which reads as 56 people
    un-trading. A distinct count cannot fall, so today never sits below the
    highest day already known.
    """

    if card is None:
        return None
    return int(max(card, max(traders.values(), default=0)))


def latest_card_value(rows: Sequence[Mapping[str, Any]], names: Sequence[str]) -> float | None:
    """The newest reading in a single-value card.

    Chosen by its own date column where the result has one, and otherwise by
    being the last numeric row -- all the ordering information such a result
    carries.
    """

    best_day: date | None = None
    best_value: float | None = None
    for row in rows:
        value = _number(column_value(row, names))
        if value is None:
            continue
        day = row_day(row)
        if best_value is None or day is None or best_day is None or day > best_day:
            best_day, best_value = day, value
    return best_value


def _venue_id(engine: Engine, slug: str) -> int | None:
    with engine.begin() as conn:
        return conn.execute(text("SELECT id FROM venues WHERE slug = :slug"), {"slug": slug}).scalar()


def run_dune_sync(engine: Engine, *, api_key: str | None = None) -> DuneSyncSummary:
    """Store every protocol whose numbers live on its own Dune dashboard.

    Never raises: a dashboard that is down, renamed or rate-limited leaves the
    stored history exactly as it was, which is the whole point of storing it.
    """

    summary = DuneSyncSummary()
    key = api_key if api_key is not None else os.environ.get("DUNE_API_KEY")
    if not key:
        summary.skipped = True
        return summary

    for venue in DUNE_VENUES:
        try:
            venue_id = _venue_id(engine, venue.slug)
            if venue_id is None:
                summary.errors.append(f"{venue.slug}: no venues row")
                continue

            volume = daily_series(fetch_rows(venue.volume_history, key), VOLUME_NAMES)
            open_interest = daily_series(fetch_rows(venue.open_interest, key), OPEN_INTEREST_NAMES)
            traders = cumulative_traders(fetch_rows(venue.new_traders, key))

            today = datetime.now(timezone.utc).date()
            latest_volume = latest_card_value(fetch_rows(venue.volume_24h, key), VOLUME_24H_NAMES)
            if latest_volume is not None:
                volume[today] = latest_volume
            latest_traders = today_trader_count(
                traders, latest_card_value(fetch_rows(venue.total_traders, key), TOTAL_TRADERS_NAMES)
            )
            if latest_traders is not None:
                traders[today] = latest_traders

            days = sorted(set(volume) | set(open_interest) | set(traders))
            if not days:
                summary.errors.append(f"{venue.slug}: Dune returned no dated rows")
                continue

            with engine.begin() as conn:
                conn.execute(
                    text(_UPSERT_SQL),
                    [
                        {
                            "venue_id": venue_id,
                            "day": day,
                            "volume": volume.get(day),
                            "open_interest": open_interest.get(day),
                            "traders": traders.get(day),
                        }
                        for day in days
                    ],
                )
            summary.written += len(days)
        except Exception as exc:  # noqa: BLE001 -- one venue must not sink the run
            summary.errors.append(f"{venue.slug}: {exc}")
    return summary
