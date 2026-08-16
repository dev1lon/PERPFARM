"""One-off measurement: does it matter WHEN the 24h median is taken?

The site prices a route by interpolating each of the last 24 hours' quote
curves to the user's fill size, then taking the median of those costs. Doing
that per visitor is what makes the book-history scan the largest single source
of database egress.

The proposed alternative is to have the worker take the median at each size the
venue itself publishes, store those, and interpolate the medians on the page.
Both are defensible statistics, but they are not the same arithmetic:

    now:      median( interpolate(snapshot, size) )   over 24 snapshots
    proposed: interpolate( median(snapshot, anchor) ) over the stored anchors

They agree exactly whenever the same hour sits in the middle at every size,
which is what usually happens -- a book widens as a whole. They diverge on
markets whose SHAPE changes: tight at the touch, hollow deeper in.

This script measures the divergence on real production snapshots instead of
guessing at it. It writes nothing and changes nothing.

    DATABASE_URL=... python -m perpfarm.jobs.median_order_check
    DATABASE_URL=... python -m perpfarm.jobs.median_order_check --venue txflow

Read the output as: if `p95_abs_pct` is a fraction of a percent, the cheaper
scheme is free of consequence. If the tail is percent-sized, the saving costs
accuracy on exactly the illiquid markets where accuracy matters most.
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import text

from perpfarm.db import make_engine
from perpfarm.jobs.hedge_recommendations import _curve_impact_bps, _number

#: Fill sizes to report. A fill is half the volume the user enters, so these
#: correspond to $10k-$200k entered -- the range the calculator allows.
FILL_SIZES_USD = (5_000.0, 10_000.0, 25_000.0, 50_000.0, 100_000.0)

#: Same window and sampling the website uses (web/lib/cost-history.ts).
HISTORY_HOURS = 24
MAX_SNAPSHOTS = 24
SAMPLE_STRIDE = 2

_SNAPSHOTS_SQL = """
WITH v AS (SELECT id FROM venues WHERE slug = :slug),
ranked AS (
  SELECT m.symbol_canonical AS pair, b.ts, b.spread_bps, b.quote_curve_json,
         row_number() OVER (PARTITION BY b.market_id ORDER BY b.ts DESC) AS rn
  FROM book_snapshots b
  JOIN markets m ON m.id = b.market_id
  WHERE m.venue_id = (SELECT id FROM v) AND m.is_active = true
    AND b.ts >= now() - make_interval(hours => :hours)
)
SELECT pair, spread_bps, quote_curve_json
FROM ranked
WHERE rn <= :max_snapshots AND (rn - 1) % :stride = 0
ORDER BY pair, rn
"""


@dataclass
class Snapshot:
    spread_bps: float
    curve: dict


def _load(engine, slug: str) -> dict[str, list[Snapshot]]:
    by_pair: dict[str, list[Snapshot]] = defaultdict(list)
    with engine.connect() as conn:
        rows = conn.execute(
            text(_SNAPSHOTS_SQL),
            {
                "slug": slug,
                "hours": HISTORY_HOURS,
                "max_snapshots": MAX_SNAPSHOTS,
                "stride": SAMPLE_STRIDE,
            },
        )
        for row in rows:
            spread = _number(row.spread_bps)
            curve = row.quote_curve_json
            if isinstance(curve, str):
                try:
                    curve = json.loads(curve)
                except json.JSONDecodeError:
                    continue
            if spread is None or not isinstance(curve, dict):
                continue
            by_pair[row.pair].append(Snapshot(spread_bps=spread, curve=curve))
    return by_pair


def _anchor_sizes(snapshots: list[Snapshot]) -> list[float]:
    """Sizes the venue publishes, as seen across the window."""
    sizes: set[float] = set()
    for snapshot in snapshots:
        for point in snapshot.curve.get("points", []):
            size = _number(point.get("notional_usd")) if isinstance(point, dict) else None
            if size is not None:
                sizes.add(size)
    return sorted(sizes)


def _cost_today(snapshots: list[Snapshot], fill_usd: float) -> float | None:
    """Median over the window of (half-spread + impact), the way the site does it."""
    legs = []
    for snapshot in snapshots:
        impact = _curve_impact_bps(snapshot.curve, fill_usd, cheapest=True)
        if impact is not None:
            legs.append(snapshot.spread_bps / 2 + impact)
    return statistics.median(legs) if legs else None


def _cost_precomputed(snapshots: list[Snapshot], fill_usd: float) -> float | None:
    """Median at each published anchor first, then interpolate to the fill size.

    The median curve is assembled from the per-anchor medians and fed through
    the SAME interpolation the site uses, so only the order of operations
    differs from `_cost_today`.
    """
    sizes = _anchor_sizes(snapshots)
    if len(sizes) < 2:
        return None

    reference = statistics.median(
        [r for r in (_number(s.curve.get("reference_price")) for s in snapshots) if r]
    )
    if not reference:
        return None

    median_points = []
    for size in sizes:
        bids, asks = [], []
        for snapshot in snapshots:
            for point in snapshot.curve.get("points", []):
                if not isinstance(point, dict) or _number(point.get("notional_usd")) != size:
                    continue
                bid, ask = _number(point.get("bid")), _number(point.get("ask"))
                if bid is not None and ask is not None:
                    bids.append(bid)
                    asks.append(ask)
        if bids and asks:
            median_points.append(
                {
                    "notional_usd": size,
                    "bid": statistics.median(bids),
                    "ask": statistics.median(asks),
                }
            )

    if len(median_points) < 2:
        return None
    impact = _curve_impact_bps(
        {"reference_price": reference, "points": median_points}, fill_usd, cheapest=True
    )
    if impact is None:
        return None
    median_spread = statistics.median([s.spread_bps for s in snapshots])
    return median_spread / 2 + impact


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * fraction)))
    return ordered[index]


def run(slug: str, *, top: int = 10) -> None:
    engine = make_engine()
    by_pair = _load(engine, slug)
    if not by_pair:
        print(f"{slug}: no snapshots in the last {HISTORY_HOURS}h")
        return

    windows = [len(s) for s in by_pair.values()]
    print(f"venue={slug} markets={len(by_pair)} snapshots/market={min(windows)}-{max(windows)}")
    print()

    for fill in FILL_SIZES_USD:
        differences: list[tuple[float, float, str, float, float]] = []
        for pair, snapshots in by_pair.items():
            today = _cost_today(snapshots, fill)
            proposed = _cost_precomputed(snapshots, fill)
            if today is None or proposed is None or today <= 0:
                continue
            absolute = abs(proposed - today)
            differences.append((absolute / today * 100, absolute, pair, today, proposed))
        if not differences:
            print(f"fill ${fill:,.0f}: no comparable markets")
            continue

        percentages = [d[0] for d in differences]
        # A $1.00 route is the user's own yardstick: a leg priced at `bps` costs
        # 2 x fill x bps / 10_000 per cycle, so the RELATIVE error is what
        # carries over to dollars whatever the volume.
        print(
            f"fill ${fill:,.0f}: markets={len(differences)} "
            f"median={statistics.median(percentages):.3f}% "
            f"p95={_percentile(percentages, 0.95):.3f}% "
            f"max={max(percentages):.3f}%  "
            f"-> $1.00 route reads ${1 + statistics.median(percentages) / 100:.4f} typically, "
            f"${1 + max(percentages) / 100:.4f} worst case"
        )
        worst = sorted(differences, reverse=True)[:top]
        for percent, _absolute, pair, today, proposed in worst:
            print(f"    {pair:<12} {today:8.3f} bps -> {proposed:8.3f} bps  ({percent:+.2f}%)")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--venue", default="variational", help="venue slug to measure")
    parser.add_argument("--top", type=int, default=10, help="worst markets to list per size")
    args = parser.parse_args()
    run(args.venue, top=args.top)


if __name__ == "__main__":
    main()
