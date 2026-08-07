"""Hourly snapshot of Polymarket's Variational FDV prediction markets."""

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
from typing import Any

import httpx
from sqlalchemy import Engine
from sqlalchemy.dialects.postgresql import insert

from perpfarm.schema import variational_fdv_market_snapshots

POLYMARKET_EVENT_URL = (
    "https://gamma-api.polymarket.com/events/slug/"
    "variational-fdv-above-one-day-after-launch"
)


@dataclass(frozen=True)
class FdvMarketSnapshot:
    threshold: str
    probability_pct: float
    volume_usd: float


@dataclass(frozen=True)
class FdvEventSnapshot:
    event_volume_usd: float | None
    markets: tuple[FdvMarketSnapshot, ...]


@dataclass(frozen=True)
class FdvSnapshotSummary:
    ts: datetime
    written: int


def _as_number(value: object) -> float | None:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    if not isinstance(value, str):
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []


def _threshold_value(label: str) -> float:
    match = re.search(r"\$([\d.]+)\s*([MB])", label, re.IGNORECASE)
    if match is None:
        return float("inf")
    amount = _as_number(match.group(1))
    if amount is None:
        return float("inf")
    return amount * (1_000 if match.group(2).upper() == "B" else 1)


def parse_fdv_event(payload: object) -> FdvEventSnapshot:
    if not isinstance(payload, dict) or not isinstance(payload.get("markets"), list):
        raise ValueError("Polymarket returned an invalid FDV event")

    snapshots: list[FdvMarketSnapshot] = []
    for market in payload["markets"]:
        if not isinstance(market, dict):
            continue
        threshold = market.get("groupItemTitle")
        if not isinstance(threshold, str):
            question = market.get("question")
            threshold_match = re.search(r"\$[\d.]+\s*[MB]", question, re.IGNORECASE) if isinstance(question, str) else None
            threshold = threshold_match.group(0) if threshold_match else ""
        outcomes = _string_list(market.get("outcomes"))
        prices = [_as_number(value) for value in _string_list(market.get("outcomePrices"))]
        yes_index = next((index for index, outcome in enumerate(outcomes) if outcome.lower() == "yes"), -1)
        probability = prices[yes_index] if yes_index >= 0 and yes_index < len(prices) else None
        volume = _as_number(market.get("volume"))
        if threshold and probability is not None and volume is not None:
            snapshots.append(
                FdvMarketSnapshot(
                    threshold=threshold,
                    probability_pct=round(probability * 100),
                    volume_usd=volume,
                )
            )

    if not snapshots:
        raise ValueError("Polymarket did not return FDV markets")
    return FdvEventSnapshot(
        event_volume_usd=_as_number(payload.get("volume")),
        markets=tuple(sorted(snapshots, key=lambda market: _threshold_value(market.threshold))),
    )


def fetch_fdv_event() -> FdvEventSnapshot:
    with httpx.Client(timeout=10) as client:
        response = client.get(POLYMARKET_EVENT_URL)
        response.raise_for_status()
        payload: Any = response.json()
    return parse_fdv_event(payload)


def run_polymarket_fdv_snapshot(engine: Engine, *, now: datetime | None = None) -> FdvSnapshotSummary:
    event = fetch_fdv_event()
    snapshot_ts = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(
        minute=0, second=0, microsecond=0
    )

    with engine.begin() as conn:
        for market in event.markets:
            statement = insert(variational_fdv_market_snapshots).values(
                ts=snapshot_ts,
                threshold=market.threshold,
                probability_pct=market.probability_pct,
                volume_usd=market.volume_usd,
                event_volume_usd=event.event_volume_usd,
            )
            conn.execute(
                statement.on_conflict_do_update(
                    constraint="uq_variational_fdv_market_snapshot",
                    set_={
                        "probability_pct": statement.excluded.probability_pct,
                        "volume_usd": statement.excluded.volume_usd,
                        "event_volume_usd": statement.excluded.event_volume_usd,
                    },
                )
            )

    return FdvSnapshotSummary(ts=snapshot_ts, written=len(event.markets))
