# Scoring spec

Single source of truth for the cost-per-point math. The Python implementation
(`worker/perpfarm/scoring/engine.py`) and the client-side TS recompute
(`web/lib/scoring.ts`, used for the notional/hold-time sliders) must both
match this document — if they diverge, this document wins and both get fixed
to match it.

## Inputs

Per **leg** (one venue's market for the route's canonical pair):

| field | source | notes |
|---|---|---|
| `maker_bps`, `taker_bps` | `fee_schedules`, latest row with `effective_from <= as_of` | can be negative (rebate) |
| `spread_bps` | median of `book_snapshots.spread_bps` over the last 24h | |
| `impact_bps_10k/50k/100k` | median of `book_snapshots.impact_bps_*` (VWAP-walk price impact beyond the touch) over the last 24h | nullable |
| `depth_usd_10k/50k/100k` | median of `book_snapshots.depth_usd_*` (USD notional actually reachable within each walk) over the last 24h | nullable; drives `fill_risk`, not cost |
| `funding_rate_annualized_7d_mean` | mean of `funding_snapshots.funding_rate_annualized` over the last 7d | |
| `points_per_usd_volume_estimate` | `points_programs.points_per_usd_volume_estimate` | |
| `pair_weight_multiplier` | `pair_weights.weight_multiplier` for this venue+symbol, default `1.0` if no row | absence is not "missing data" |
| `maker_counts_for_points`, `taker_counts_for_points` | `execution_rules` | |
| `maker_boost_multiplier` | `execution_rules.maker_boost_multiplier`, default `1.0` | only applies to maker fills |
| `manual_confidence` | weakest of `points_programs.confidence` and `pair_weights.confidence` (if present) | `rumor` < `estimated` < `confirmed`, weakest wins |
| `manual_last_verified` | oldest of the same two rows' `last_verified` | |
| `points_distributed_week`, `total_points_outstanding` | latest `points_distributions` row for the venue | dilution only, never blocks completeness |

Route-level **parameters** (`ScoringParams`):

- `notional_usd` (N) — default `10_000`
- `hold_hours` (H) — default `24`
- `round_trips_per_week` — default `None`, meaning `floor(168 / H)` (back-to-back trips at the given hold time)

`as_of` (the date used to pick the effective fee schedule row) is resolved by
the *caller* when it assembles `LegInputs` — `score_route` itself takes no
date and reads no system clock, so results are reproducible given the same
inputs.

## Completeness gate

A route is **incomplete** (`is_complete = false`, `cost_per_point_usd = null`)
if either leg is missing any of: `maker_bps`, `taker_bps`, `spread_bps`,
`funding_rate_annualized_7d_mean`, `points_per_usd_volume_estimate`, or
`maker_counts_for_points`/`taker_counts_for_points`.

Note `impact_bps_*`/`depth_usd_*` are **not** in this list — a missing or
out-of-range impact measurement degrades gracefully to a flag
(`beyond_measured_depth`, see below), not a hard gate. This is intentionally
broader than "missing manual data": automated data gaps (no book/funding
snapshots yet) gate the same way, because without them the maker-vs-taker
comparison literally cannot be computed. Never fill a gap with a guessed
number and score anyway — an incomplete route reports why
(`data_freshness_json.incomplete_reasons`), not a silently wrong number.

Dilution inputs (`points_distributed_week`, `total_points_outstanding`) are
excluded from this gate — dilution is display context, not a cost input.

## 1. Taker price impact estimate

```
impact_bps(leg, N) -> (bps, beyond_measured_depth):
  if all three buckets (10k, 50k, 100k) present AND N < 100_000:
    piecewise-linear interpolation over (10k, 50k, 100k), clamped
    to the nearest bucket below 10k
    -> (interpolated_bps, false)
  else:
    # buckets never measured, OR N is beyond the largest measured bucket --
    # either way we don't have a real number for this size
    -> (0 if unmeasured else bucket_100k_value, true)
```

`beyond_measured_depth=true` does not block scoring (see completeness gate)
-- it's a loud "this estimate is unreliable at this size" signal that flows
into `risks.beyond_measured_depth` on the route.

## 2. Execution cost per leg, per order type, one round trip (entry + exit)

```
fee_bps(leg, "maker") = leg.maker_bps
fee_bps(leg, "taker") = leg.taker_bps

extra_bps(leg, "maker", N) = 0                                        # assumed fill at mid
extra_bps(leg, "taker", N) = spread_bps / 2 + impact_bps(leg, N).bps   # cross the touch + walk the book

fee_usd(leg, type, N)    = 2 * N * fee_bps(leg, type) / 10000
spread_cost_usd(leg, type, N) = 2 * N * extra_bps(leg, type, N) / 10000
```

The `2 *` is entry + exit (spec: "Entry + exit, both legs"). Taker cost is
now **half-spread plus impact**, not one-or-the-other: crossing the touch
and walking deeper into the book are separate, additive costs.

### Maker fill risk

```
fill_risk(leg, N) = depth_usd_50k is not null AND depth_usd_50k < 4 * N
```

Maker legs pay no spread/impact cost (assumed fill at mid), but a resting
order sized against a thin book may simply not fill. `fill_risk` is only
evaluated for the leg's chosen order type when it's `"maker"`; it flows into
`risks.fill_risk` on the route (OR'd across both legs).

### Same-venue (self-match) routes

`long_venue == short_venue` is a first-class route type -- a farmer running
two accounts on one venue, hedging against themselves. `score_route` has
**no notion of this** -- it's not a parameter, not a branch. Instead, the
*caller* (`worker/perpfarm/jobs/nightly.py`, `scoring/fixture_loader.py`,
`web/lib/fixtures-source.ts`) damps `impact_bps_10k/50k/100k` by
`SELF_MATCH_IMPACT_FACTOR` (default `0.2`) on both legs before constructing
`LegInputs`, on the theory that two of your own orders mostly meet each
other rather than walking the public book. This is a documented
approximation, not a measurement. The caller also sets
`risks.wash_risk = true` for these routes (a plain venue-slug comparison --
`score_route` doesn't compute this either).

## 3. Funding cost over the hold period H

```
funding_cost_usd(long_leg, short_leg, N, H) =
    N * (H / 8760) * (long_leg.funding_rate_annualized_7d_mean
                     - short_leg.funding_rate_annualized_7d_mean)
```

8760 = hours/year. Sign is preserved — a negative result is a net funding
*credit* over the hold period, not clamped to zero. This single number is
route-level (it doesn't depend on either leg's maker/taker choice).

## 4. Points earned, one round trip (entry + exit)

```
leg_points(leg, type, N):
  counts = leg.maker_counts_for_points if type == "maker" else leg.taker_counts_for_points
  if not counts: return 0
  boost = leg.maker_boost_multiplier if type == "maker" else 1.0
  return N * leg.points_per_usd_volume_estimate * leg.pair_weight_multiplier * boost

round_trip_points(leg, type, N) = 2 * leg_points(leg, type, N)
```

Points scale with the same entry+exit convention as cost (2×N of counted
volume per leg where the chosen order type counts) — most venues count both
fills toward points-earning volume, so cost and points use the same volume
base and stay comparable.

## 5. Execution recommendation: joint 2×2 search

For each of the 4 combinations of `(long_type, short_type)` in
`{maker, taker} × {maker, taker}`:

```
total_cost(combo)   = fee_usd(long) + spread_cost_usd(long)
                     + fee_usd(short) + spread_cost_usd(short)
                     + funding_cost_usd
total_points(combo) = round_trip_points(long) + round_trip_points(short)
cost_per_point(combo) = total_cost(combo) / total_points(combo)   if total_points(combo) > 0
                       = undefined (not viable)                    otherwise
```

Pick the viable combo with the lowest `cost_per_point`; ties break on lower
`total_cost`. A tie on **both** breaks deterministically to the first combo
in iteration order — `(maker,maker)`, `(maker,taker)`, `(taker,maker)`,
`(taker,taker)` — and both engines must implement keep-first-on-tie (the
`full_tie_prefers_first_combo` parity scenario pins this). If no combo earns
any points at all, `cost_per_point_usd` is `null` (route is data-complete
but economically can't farm this pair on either venue right now) and the
cheapest combo by `total_cost` is reported for display.

**This is a joint optimization, not two independent per-leg choices.**
A leg that earns zero points either way should still take whichever order
type is cheaper for that leg — and it's possible (see the unit tests) for a
leg to end up on the side that earns *it* no points, if that keeps the
route's blended cost-per-point lower than paying for extra points at a bad
marginal rate. The one-line "why" per leg is generated by comparing the
chosen order type against the alternative for that leg alone.

## 6. Output metrics

```
points_per_1m_volume = total_points / (4 * N) * 1_000_000
```

`4 * N` = both legs' entry+exit dollar volume. This makes the metric
independent of N — a comparability number across routes with different
notionals.

```
weekly_cost_usd = total_cost(best_combo) * round_trips_per_week
```

## Breakeven notional (display only, never affects cost_per_point)

```
find_breakeven_notional(long_leg, short_leg, params, threshold,
                         grid=[1000, 2000, 5000, 10000, 25000, 50000]):
  best = null
  for N in grid:
    result = score_route(long_leg, short_leg, params with notional_usd=N)
    if result.is_complete and result.cost_per_point_usd <= threshold:
      best = N          # keep scanning -- take the largest qualifying N
  return best
```

`hold_hours`/`round_trips_per_week` are held fixed at the caller's chosen
values; only notional varies across the grid. `threshold` is **not** a fixed
dollar figure the engine knows about -- the caller picks it (e.g. a venue's
average `cost_per_point_usd` across its routes at the default notional) and
passes it in. This powers a "works best up to ~$N per entry" display line;
it never feeds back into `cost_per_point_usd` itself.

## Dilution score (display only, never affects cost_per_point)

```
venue_weekly_dilution_ratio = points_distributed_week / total_points_outstanding
    (null if either input is missing or total_points_outstanding == 0)

dilution_score = max(long_leg_ratio, short_leg_ratio)   # ignoring nulls; null if both null
```

The higher-dilution venue dominates the route's dilution risk. Season
deadline countdowns are a `venue_meta.season_end_date` display concern at
the API layer, not part of `route_scores` — they don't depend on which
route is being viewed.

## Output shape (`route_scores` JSONB columns)

`cost_breakdown_json`:

```json
{
  "notional_usd": 10000,
  "hold_hours": 24,
  "long": {"venue": "venue_alpha", "order_type": "maker", "fee_usd": -4.0, "spread_cost_usd": 0.0, "points": 20000, "fill_risk": false, "beyond_measured_depth": false},
  "short": {"venue": "venue_beta", "order_type": "taker", "fee_usd": 8.0, "spread_cost_usd": 3.0, "points": 16000, "fill_risk": false, "beyond_measured_depth": false},
  "funding_cost_usd": 0.82,
  "total_cost_usd": 7.82,
  "total_points": 36000,
  "long_inputs": {
    "venue": "venue_alpha", "maker_bps": 0.0, "taker_bps": 5.0, "spread_bps": 2.0,
    "impact_bps_10k": 1.0, "impact_bps_50k": 2.0, "impact_bps_100k": 4.0,
    "depth_usd_10k": 10000, "depth_usd_50k": 50000, "depth_usd_100k": 100000,
    "funding_rate_annualized_7d_mean": 0.05, "points_per_usd_volume_estimate": 1.0,
    "pair_weight_multiplier": 1.0, "maker_counts_for_points": true,
    "taker_counts_for_points": false, "maker_boost_multiplier": 1.0
  },
  "short_inputs": { "...": "same shape as long_inputs, for the short leg" },
  "risks": { "fill_risk": false, "beyond_measured_depth": false, "wash_risk": false }
}
```

`long_inputs`/`short_inputs` are the raw per-leg inputs (see the Inputs table
above) as of this scoring run. They only exist when `is_complete` is true.
**This is what makes the notional/hold-time sliders on the frontend a true
recompute, not an approximation**: because impact is a piecewise-linear
function of notional (step 1), the chosen `fee_usd` / `spread_cost_usd`
numbers above cannot simply be rescaled by `newNotional / notional_usd` — a
client changing the notional or hold time must re-run steps 1-5 from these
raw inputs (`web/lib/scoring.ts` mirrors `worker/perpfarm/scoring/engine.py`
function-for-function for this reason).

`risks` comes from `RouteScoreResult.risks` (`fill_risk`,
`beyond_measured_depth`) plus `wash_risk`, which the *caller* adds (a plain
`long_venue == short_venue` check -- `score_route` doesn't compute it). Only
present when `is_complete` is true.

`recommended_execution_json`:

```json
{
  "long": {"order_type": "maker", "why": "maker: only maker fills earn points on this venue."},
  "short": {"order_type": "taker", "why": "taker: only taker fills earn points on this venue."}
}
```

`data_freshness_json`:

```json
{"oldest_manual_date": "2026-07-01", "min_confidence": "confirmed", "incomplete_reasons": []}
```
