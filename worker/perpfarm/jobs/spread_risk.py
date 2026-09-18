"""How far two venues' prices for the same instrument wander apart.

What the badge on a cross-protocol route answers: not how WIDE the gap between
two venues is -- a steady gap is met going in and coming out, so it cancels --
but how often that gap LEAVES its usual place while you hold. So the reading is
a frequency: out of all the hours both venues recorded, in how many did the gap
sit further than 50 bps from its own normal level.

This used to be computed on the website, per request: a week of hourly marks
for every shared pair, pulled and aligned for each visitor, for an answer that
cannot change until the next collection. It is computed here once an hour
instead, and the site reads one row per pair.

The constants below are the same ones the website published, and
`tests/test_website_parity.py` compares them against the TypeScript source so
the two cannot drift apart.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import Engine, text

from perpfarm.swaps import SWAP_UNDERLYING as _SWAP_UNDERLYING
from perpfarm.adapters.registry import FIXTURE_SLUGS

#: A reading counts as "come apart" past this distance from the pair's own
#: normal gap. 0.5% is the gap experienced funding farmers already treat as
#: wide, and on a $10k leg it is ~$50 -- more than a route costs to execute.
SPREAD_BREAKOUT_BPS = 50.0
#: Share of readings beyond that distance.
SPREAD_RISK_LOW_SHARE = 0.05
SPREAD_RISK_MEDIUM_SHARE = 0.15
#: Fewer readings than this cannot support a frequency at all.
MIN_TICKS_FOR_RISK = 12
#: The window the badge reads. A week is what the pruner keeps hourly.
SPREAD_WINDOW_DAYS = 7

#: Re-exported from perpfarm.swaps, which two jobs now share: route
#: recommendations pair a swap against another venue's perp exactly as the
#: website does. Imported here under the old name so nothing that reads
#: `spread_risk.SWAP_UNDERLYING` -- the website parity test included -- has to
#: learn a new one.
SWAP_UNDERLYING = _SWAP_UNDERLYING

#: Marks for every venue over the window, for the instruments listed on more
#: than one venue, plus every swap and its underlying. Pulled once and paired
#: up in memory: with N venues the alternative is N x (N-1) / 2 queries over the
#: same rows.
_MARKS_SQL = """
SELECT m.venue_id, m.symbol_canonical AS pair, s.ts, s.mark
FROM mark_snapshots s
JOIN markets m ON m.id = s.market_id
JOIN venues v ON v.id = m.venue_id
WHERE m.is_active
  AND v.slug <> ALL(:excluded_slugs)
  AND s.ts >= now() - make_interval(days => :days)
  AND (
    m.symbol_canonical IN (
      SELECT symbol_canonical
      FROM markets
      WHERE is_active
      GROUP BY symbol_canonical
      HAVING COUNT(DISTINCT venue_id) > 1
    )
    OR m.symbol_canonical = ANY(:swap_legs)
  )
ORDER BY m.venue_id, m.symbol_canonical, s.ts
"""

_UPSERT_SQL = """
INSERT INTO pair_spread_risk (
  venue_a_id, venue_b_id, symbol_canonical,
  observations, median_gap_bps, breakout_share, rating, updated_at
)
VALUES (:venue_a_id, :venue_b_id, :pair, :observations, :median, :share, :rating, now())
ON CONFLICT (venue_a_id, venue_b_id, symbol_canonical) DO UPDATE
SET observations = EXCLUDED.observations,
    median_gap_bps = EXCLUDED.median_gap_bps,
    breakout_share = EXCLUDED.breakout_share,
    rating = EXCLUDED.rating,
    updated_at = now()
"""

Tick = tuple[datetime, float]


@dataclass
class SpreadRiskSummary:
    rated: int = 0
    #: Rating -> how many pairs got it, for the run log.
    by_rating: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


def aligned_gaps_bps(series_a: list[Tick], series_b: list[Tick]) -> list[float]:
    """Gaps in bps at ticks BOTH venues recorded.

    Same timestamp on both sides or nothing: the whole measure is a small
    difference, so comparing prices taken minutes apart would report the
    market's own movement as venue disagreement.
    """

    by_ts = dict(series_b)
    gaps: list[float] = []
    for ts, mark in series_a:
        other = by_ts.get(ts)
        if other is None or other <= 0 or mark <= 0:
            continue
        mid = (mark + other) / 2
        gaps.append(((mark - other) / mid) * 10_000)
    return gaps


def median_gap_bps(gaps: list[float]) -> float | None:
    """The pair's normal gap: the upper middle reading, as the site defined it."""

    if not gaps:
        return None
    ordered = sorted(gaps)
    return ordered[len(ordered) // 2]


def breakout_share(gaps: list[float]) -> float | None:
    """Share of readings where the gap left its usual place, or None if too few."""

    if len(gaps) < MIN_TICKS_FOR_RISK:
        return None
    normal = median_gap_bps(gaps)
    assert normal is not None  # non-empty: len >= MIN_TICKS_FOR_RISK
    breakouts = sum(1 for gap in gaps if abs(gap - normal) > SPREAD_BREAKOUT_BPS)
    return breakouts / len(gaps)


def spread_risk_of(share: float | None) -> str:
    if share is None:
        return "unknown"
    if share <= SPREAD_RISK_LOW_SHARE:
        return "low"
    if share <= SPREAD_RISK_MEDIUM_SHARE:
        return "medium"
    return "high"


def rated_legs(
    markets_a: dict[str, list[Tick]], markets_b: dict[str, list[Tick]]
) -> list[tuple[str, list[Tick], list[Tick]]]:
    """Every route two venues share, with each venue's own series.

    The same ticker on both, and a swap on one venue against its underlying on
    the other. A swap route is stored under the SWAP's ticker, which is how the
    site keys it (web/lib/cross-cost.ts), so it can never overwrite the perp
    route on the same pair. The swap and the perp sit at a steady basis to each
    other (gold swap 4317 vs perp 4326); that offset is the pair's normal gap and
    cancels, exactly as a steady gap between two perps does.
    """

    legs = [(pair, markets_a[pair], markets_b[pair]) for pair in sorted(set(markets_a) & set(markets_b))]
    shared = {pair for pair, _, _ in legs}
    for swap, underlying in sorted(SWAP_UNDERLYING.items()):
        if swap in shared:
            continue
        if swap in markets_a and underlying in markets_b:
            legs.append((swap, markets_a[swap], markets_b[underlying]))
        elif swap in markets_b and underlying in markets_a:
            legs.append((swap, markets_a[underlying], markets_b[swap]))
    return legs


def _load_marks(engine: Engine, *, days: int) -> dict[int, dict[str, list[Tick]]]:
    by_venue: dict[int, dict[str, list[Tick]]] = {}
    swap_legs = sorted({*SWAP_UNDERLYING, *SWAP_UNDERLYING.values()})
    with engine.begin() as conn:
        rows = conn.execute(
            text(_MARKS_SQL),
            {"days": days, "excluded_slugs": list(FIXTURE_SLUGS), "swap_legs": swap_legs},
        ).all()
    for row in rows:
        by_venue.setdefault(int(row.venue_id), {}).setdefault(str(row.pair), []).append(
            (row.ts, float(row.mark))
        )
    return by_venue


def run_spread_risk(engine: Engine, *, days: int = SPREAD_WINDOW_DAYS) -> SpreadRiskSummary:
    """Rate every instrument listed on more than one venue. Never raises."""

    summary = SpreadRiskSummary()
    try:
        by_venue = _load_marks(engine, days=days)
    except Exception as exc:  # noqa: BLE001 -- housekeeping must not sink the run
        summary.errors.append(str(exc))
        return summary

    venue_ids = sorted(by_venue)
    ratings: list[dict[str, object]] = []
    for index, venue_a in enumerate(venue_ids):
        for venue_b in venue_ids[index + 1 :]:
            markets_a = by_venue[venue_a]
            markets_b = by_venue[venue_b]
            for pair, series_a, series_b in rated_legs(markets_a, markets_b):
                gaps = aligned_gaps_bps(series_a, series_b)
                share = breakout_share(gaps)
                ratings.append(
                    {
                        "venue_a_id": venue_a,
                        "venue_b_id": venue_b,
                        "pair": pair,
                        "observations": len(gaps),
                        "median": median_gap_bps(gaps),
                        "share": share,
                        "rating": spread_risk_of(share),
                    }
                )

    if not ratings:
        return summary
    try:
        with engine.begin() as conn:
            conn.execute(text(_UPSERT_SQL), ratings)
    except Exception as exc:  # noqa: BLE001
        summary.errors.append(str(exc))
        return summary

    summary.rated = len(ratings)
    for row in ratings:
        rating = str(row["rating"])
        summary.by_rating[rating] = summary.by_rating.get(rating, 0) + 1
    return summary
