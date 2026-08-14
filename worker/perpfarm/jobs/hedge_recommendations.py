"""Materialize the small "lowest-cost route" card once per snapshot run.

The calculator still computes an explicitly selected route on demand.  This
job is for the compact recommendation card only: it evaluates every available
counterparty after hourly snapshots finish, then persists the cheapest partner
for each home venue.  Page loads therefore perform one indexed read, never a
route scan.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import Engine, text
from sqlalchemy.dialects.postgresql import insert

from perpfarm.adapters.registry import FIXTURE_SLUGS
from perpfarm.schema import hedge_route_recommendations


REFERENCE_VOLUME_USD = 100_000.0
MIN_VOLUME_USD = 1_000.0
MIN_OPEN_INTEREST_USD = 10_000.0

# Per-protocol display convention. Variational's user-side snapshots are
# confirmed to need the OLP counterparty added; TxFlow has no confirmed
# adjustment, so its raw OI stays raw.
OI_DISPLAY_FACTOR: dict[str, float] = {"variational": 2.0, "txflow": 1.0}
MIN_OPEN_INTEREST_BY_SLUG: dict[str, float] = {
    "variational": 50_000.0,
    "txflow": MIN_OPEN_INTEREST_USD,
}

# Keep these fallbacks in lockstep with web/lib/venue-fees.ts.  A fee-watch
# row wins; the documented fallback prevents an unknown row from looking free.
PUBLISHED_FEES: dict[str, tuple[float, float]] = {
    "variational": (0.0, 0.0),
    "txflow": (1.5 * 0.95, 4.5 * 0.95),
}


@dataclass(frozen=True)
class Market:
    venue_id: int
    slug: str
    symbol: str
    spread_bps: float | None
    impact_10k: float | None
    impact_50k: float | None
    impact_100k: float | None
    quote_curve: object
    volume_24h_usd: float | None
    open_interest_usd: float | None
    maker_bps: float | None
    taker_bps: float | None


@dataclass
class RecommendationSummary:
    written: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


def _number(value: object) -> float | None:
    try:
        number = float(value)  # Decimal from Postgres and numeric JSON values
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


#: Above this ratio between two measured sizes, a straight line stops following
#: the book's shape and the segment is fitted as `displacement = a * size^k`.
#: Kept identical to POWER_FIT_MIN_SPAN_RATIO in web/lib/quote-curve.ts, where
#: the value was measured (leave-one-out over 682 production curves): the power
#: fit made TxFlow's closely-spaced ladder worse and Variational's 100x gap
#: markedly better. Variational publishes 1k / 100k / 1m, so both of its
#: segments are wide -- the worker interpolating them linearly meant it and the
#: website priced the same market differently, and the worker's number is what
#: picks the hedge partner shown on the page.
POWER_FIT_MIN_SPAN_RATIO = 10.0


def _interpolate_displacement(
    left_size: float,
    left_displacement: float,
    right_size: float,
    right_displacement: float,
    notional_usd: float,
) -> float:
    """Move away from the touch at `notional_usd`, between two measured sizes."""

    wide_gap = left_size > 0 and right_size >= left_size * POWER_FIT_MIN_SPAN_RATIO
    # Needs two positive displacements to take logs of. The first segment starts
    # at the touch, where displacement is zero by definition, so it stays linear.
    if wide_gap and left_displacement > 0 and right_displacement > 0:
        exponent = math.log(right_displacement / left_displacement) / math.log(right_size / left_size)
        if math.isfinite(exponent):
            return left_displacement * (notional_usd / left_size) ** exponent
    position = (notional_usd - left_size) / (right_size - left_size)
    return left_displacement + (right_displacement - left_displacement) * position


def _curve_impact_bps(value: object, notional_usd: float, *, cheapest: bool) -> float | None:
    raw: Any = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, dict):
        return None
    reference = _number(raw.get("reference_price"))
    points_raw = raw.get("points")
    if reference is None or reference <= 0 or not isinstance(points_raw, list):
        return None

    points: dict[float, tuple[float, float]] = {}
    for point in points_raw:
        if not isinstance(point, dict):
            continue
        size = _number(point.get("notional_usd"))
        bid = _number(point.get("bid"))
        ask = _number(point.get("ask"))
        if size is not None and bid is not None and ask is not None and size >= 0 and bid > 0 and ask > 0:
            points[size] = (bid, ask)
    anchors = sorted(points.items())
    if len(anchors) < 2 or anchors[0][0] != 0 or notional_usd < 0 or notional_usd > anchors[-1][0]:
        return None

    base_bid, base_ask = anchors[0][1]
    bid, ask = base_bid, base_ask
    for index in range(1, len(anchors)):
        left_size, (left_bid, left_ask) = anchors[index - 1]
        right_size, (right_bid, right_ask) = anchors[index]
        if notional_usd <= right_size:
            # Interpolate the move AWAY FROM THE TOUCH, not the raw price: that
            # displacement is the quantity with a shape worth following. Same
            # derivation as web/lib/quote-curve.ts.
            ask = base_ask + _interpolate_displacement(
                left_size, left_ask - base_ask, right_size, right_ask - base_ask, notional_usd
            )
            bid = base_bid - _interpolate_displacement(
                left_size, base_bid - left_bid, right_size, base_bid - right_bid, notional_usd
            )
            break
    buy = max(ask - base_ask, 0) / reference * 10_000
    sell = max(base_bid - bid, 0) / reference * 10_000
    return min(buy, sell) if cheapest else (buy + sell) / 2


def _bucket_impact_bps(market: Market, notional_usd: float) -> float | None:
    anchors = [(0.0, 0.0)] + [
        (size, impact)
        for size, impact in ((10_000.0, market.impact_10k), (50_000.0, market.impact_50k), (100_000.0, market.impact_100k))
        if impact is not None
    ]
    if len(anchors) < 2:
        return None
    anchors.sort(key=lambda item: item[0])
    if notional_usd <= anchors[0][0]:
        return anchors[0][1]
    for index in range(1, len(anchors)):
        left_size, left_impact = anchors[index - 1]
        right_size, right_impact = anchors[index]
        if notional_usd <= right_size:
            return left_impact + (right_impact - left_impact) * (notional_usd - left_size) / (right_size - left_size)
    return anchors[-1][1]


def _venue_bps(market: Market, fill_notional_usd: float, *, cheapest: bool) -> tuple[float, float] | None:
    spread = market.spread_bps
    impact = _curve_impact_bps(market.quote_curve, fill_notional_usd, cheapest=cheapest)
    if impact is None:
        impact = _bucket_impact_bps(market, fill_notional_usd)
    fallback = PUBLISHED_FEES.get(market.slug)
    maker = market.maker_bps if market.maker_bps is not None else (fallback[0] if fallback else None)
    taker = market.taker_bps if market.taker_bps is not None else (fallback[1] if fallback else None)
    if spread is None or impact is None or maker is None or taker is None:
        return None
    return maker, taker + spread / 2 + impact


def _displayed_oi(market: Market) -> float | None:
    if market.open_interest_usd is None:
        return None
    return market.open_interest_usd * OI_DISPLAY_FACTOR.get(market.slug, 1.0)


def _is_eligible(market: Market, *, oi_floor_usd: float) -> bool:
    displayed_oi = _displayed_oi(market)
    return (
        market.volume_24h_usd is not None
        and displayed_oi is not None
        and market.volume_24h_usd >= MIN_VOLUME_USD
        and displayed_oi >= oi_floor_usd
    )


def _self_match_cost(markets: list[Market]) -> float | None:
    fill = REFERENCE_VOLUME_USD / 2
    costs = []
    for market in markets:
        if not _is_eligible(market, oi_floor_usd=MIN_OPEN_INTEREST_BY_SLUG.get(market.slug, MIN_OPEN_INTEREST_USD)):
            continue
        bps = _venue_bps(market, fill, cheapest=True)
        if bps is not None:
            maker, taker = bps
            costs.append(REFERENCE_VOLUME_USD * (maker + taker) / 10_000)
    return min(costs) if costs else None


def _cross_cost(home: list[Market], partner: list[Market]) -> float | None:
    fill = REFERENCE_VOLUME_USD / 2
    partner_by_symbol = {market.symbol: market for market in partner}
    costs = []
    for main in home:
        hedge = partner_by_symbol.get(main.symbol)
        if hedge is None:
            continue
        if not _is_eligible(main, oi_floor_usd=MIN_OPEN_INTEREST_BY_SLUG.get(main.slug, MIN_OPEN_INTEREST_USD)):
            continue
        # The hedge needs a real book, but its own high/medium/low bands must
        # not remove the market selected on the home protocol.
        if not _is_eligible(hedge, oi_floor_usd=MIN_OPEN_INTEREST_USD):
            continue
        main_bps = _venue_bps(main, fill, cheapest=False)
        hedge_bps = _venue_bps(hedge, fill, cheapest=False)
        if main_bps is None or hedge_bps is None:
            continue
        main_maker, main_taker = main_bps
        hedge_maker, hedge_taker = hedge_bps
        costs.append(REFERENCE_VOLUME_USD * min(main_maker + hedge_taker, hedge_maker + main_taker) / 10_000)
    return min(costs) if costs else None


def _compute(markets: list[Market]) -> dict[int, tuple[int, float]]:
    """Return the cheapest partner and cost for each home venue."""

    by_venue: dict[int, list[Market]] = {}
    for market in markets:
        by_venue.setdefault(market.venue_id, []).append(market)
    result: dict[int, tuple[int, float]] = {}
    for venue_id, home in by_venue.items():
        best_cost = _self_match_cost(home)
        best_partner = venue_id if best_cost is not None else None
        for partner_id, partner_markets in by_venue.items():
            if partner_id == venue_id:
                continue
            cost = _cross_cost(home, partner_markets)
            if cost is not None and (best_cost is None or cost < best_cost):
                best_partner, best_cost = partner_id, cost
        if best_partner is not None and best_cost is not None:
            result[venue_id] = (best_partner, best_cost)
    return result


def run_hedge_recommendations(engine: Engine, *, ts: datetime) -> RecommendationSummary:
    """Persist this run's reference-size recommendation for every venue."""

    summary = RecommendationSummary()
    # Migration deploys independently from code on Render.  Do not make the
    # market-data cron fail during that short window.
    from sqlalchemy import inspect

    if not inspect(engine).has_table("hedge_route_recommendations"):
        summary.skipped = 1
        return summary

    # This job publishes straight to the website, so it must never consider a
    # synthetic venue.  `venue_alpha` / `venue_beta` carry made-up books and
    # zero fees, which makes them win any "cheapest route" comparison outright:
    # once seeded into a real database they are not merely noise, they are the
    # answer.  Filtering at the source is what keeps them out of every
    # downstream comparison, not just out of the row that gets written.
    query = text(
        """
        WITH active AS (
          SELECT m.id, m.venue_id, m.symbol_canonical, v.slug
          FROM markets m JOIN venues v ON v.id = m.venue_id
          WHERE m.is_active = true AND v.slug <> ALL(:fixture_slugs)
        ), book AS (
          -- DISTINCT ON alone returns the newest row that EXISTS, however old
          -- that is.  A venue whose collection stopped weeks ago would keep
          -- being priced off its last snapshot as if it were current, so the
          -- window is part of the query, not an afterthought.
          SELECT DISTINCT ON (b.market_id)
            b.market_id, b.spread_bps, b.impact_bps_10k, b.impact_bps_50k,
            b.impact_bps_100k, b.quote_curve_json
          FROM book_snapshots b
          JOIN active a ON a.id = b.market_id
          WHERE b.ts >= now() - interval '2 days'
          ORDER BY b.market_id, b.ts DESC
        ), volume AS (
          SELECT DISTINCT ON (s.market_id) s.market_id, s.volume_24h_usd, s.open_interest_usd
          FROM volume_snapshots s
          JOIN active a ON a.id = s.market_id
          WHERE s.ts >= now() - interval '2 days'
          ORDER BY s.market_id, s.ts DESC
        ), fee AS (
          SELECT DISTINCT ON (venue_id) venue_id, maker_bps, taker_bps
          FROM fee_schedules
          WHERE effective_from <= CURRENT_DATE
          ORDER BY venue_id, effective_from DESC, created_at DESC
        )
        SELECT a.venue_id, a.slug, a.symbol_canonical,
               book.spread_bps, book.impact_bps_10k, book.impact_bps_50k, book.impact_bps_100k, book.quote_curve_json,
               volume.volume_24h_usd, volume.open_interest_usd, fee.maker_bps, fee.taker_bps
        FROM active a
        JOIN book ON book.market_id = a.id
        JOIN volume ON volume.market_id = a.id
        LEFT JOIN fee ON fee.venue_id = a.venue_id
        """
    )
    try:
        with engine.begin() as conn:
            markets = [
                Market(
                    venue_id=row.venue_id,
                    slug=row.slug,
                    symbol=row.symbol_canonical,
                    spread_bps=_number(row.spread_bps),
                    impact_10k=_number(row.impact_bps_10k),
                    impact_50k=_number(row.impact_bps_50k),
                    impact_100k=_number(row.impact_bps_100k),
                    quote_curve=row.quote_curve_json,
                    volume_24h_usd=_number(row.volume_24h_usd),
                    open_interest_usd=_number(row.open_interest_usd),
                    maker_bps=_number(row.maker_bps),
                    taker_bps=_number(row.taker_bps),
                )
                for row in conn.execute(query, {"fixture_slugs": sorted(FIXTURE_SLUGS)})
            ]
            for venue_id, (partner_id, cost) in _compute(markets).items():
                stmt = insert(hedge_route_recommendations).values(
                    venue_id=venue_id,
                    partner_venue_id=partner_id,
                    ts=ts,
                    cycle_cost_usd=cost,
                ).on_conflict_do_update(
                    constraint="uq_hedge_route_recommendations_venue_ts",
                    set_={"partner_venue_id": partner_id, "cycle_cost_usd": cost},
                )
                conn.execute(stmt)
                summary.written += 1
    except Exception as exc:  # noqa: BLE001 -- must not invalidate stored market snapshots
        summary.errors.append(str(exc))
    return summary
