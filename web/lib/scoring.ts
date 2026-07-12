/**
 * TypeScript mirror of worker/perpfarm/scoring/engine.py -- see
 * docs/scoring.md for the spec both implementations must match. Used to
 * recompute cost_per_point client-side when the user changes notional or
 * hold time on the routes table, without a round trip to the API.
 *
 * Every route_scores row's cost_breakdown_json.long_inputs/short_inputs
 * carries the raw per-leg data this needs (see parseLegInputs below).
 */

export type OrderType = "maker" | "taker";

export interface LegInputs {
  venue: string;
  makerBps: number | null;
  takerBps: number | null;
  spreadBps: number | null;
  impactBps10k: number | null;
  impactBps50k: number | null;
  impactBps100k: number | null;
  depthUsd10k: number | null;
  depthUsd50k: number | null;
  depthUsd100k: number | null;
  fundingRateAnnualized7dMean: number | null;
  pointsPerUsdVolumeEstimate: number | null;
  pairWeightMultiplier: number;
  makerCountsForPoints: boolean | null;
  takerCountsForPoints: boolean | null;
  makerBoostMultiplier: number;
}

export interface ScoringParams {
  notionalUsd: number;
  holdHours: number;
  roundTripsPerWeek?: number;
}

export interface LegRoundTrip {
  orderType: OrderType;
  feeUsd: number;
  spreadCostUsd: number;
  points: number;
  fillRisk: boolean;
  beyondMeasuredDepth: boolean;
}

export interface RouteRisks {
  fillRisk: boolean;
  beyondMeasuredDepth: boolean;
}

export interface RecomputedRoute {
  costPerPointUsd: number | null;
  pointsPer1mVolume: number | null;
  weeklyCostUsd: number | null;
  totalCostUsd: number;
  totalPoints: number;
  fundingCostUsd: number;
  long: LegRoundTrip;
  short: LegRoundTrip;
  longWhy: string;
  shortWhy: string;
  risks: RouteRisks;
}

const HOURS_PER_YEAR = 8760;
const ORDER_TYPES: OrderType[] = ["maker", "taker"];
export const BREAKEVEN_GRID_USD: readonly number[] = [1_000, 2_000, 5_000, 10_000, 25_000, 50_000];
const IMPACT_MAX_BUCKET_USD = 100_000;

// Two accounts on the same venue can largely fill against each other rather
// than walking the public book -- this factor damps the impactBps* curve
// for same-venue (self-match) routes before it reaches recomputeRoute. It's
// a documented approximation, not a measurement; recomputeRoute itself has
// no notion of same-venue routes, see docs/scoring.md.
export const SELF_MATCH_IMPACT_FACTOR = 0.2;

// Maker fill_risk fires when the $50k-bucket book depth is thin relative to
// the notional being sized -- i.e. resting size this large may not fill.
export const FILL_RISK_DEPTH_MULTIPLIER = 4.0;

/** Reads the raw snake_case JSON stored in cost_breakdown_json.{long,short}_inputs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLegInputs(raw: any): LegInputs {
  return {
    venue: raw.venue,
    makerBps: raw.maker_bps,
    takerBps: raw.taker_bps,
    spreadBps: raw.spread_bps,
    impactBps10k: raw.impact_bps_10k,
    impactBps50k: raw.impact_bps_50k,
    impactBps100k: raw.impact_bps_100k,
    depthUsd10k: raw.depth_usd_10k,
    depthUsd50k: raw.depth_usd_50k,
    depthUsd100k: raw.depth_usd_100k,
    fundingRateAnnualized7dMean: raw.funding_rate_annualized_7d_mean,
    pointsPerUsdVolumeEstimate: raw.points_per_usd_volume_estimate,
    pairWeightMultiplier: raw.pair_weight_multiplier,
    makerCountsForPoints: raw.maker_counts_for_points,
    takerCountsForPoints: raw.taker_counts_for_points,
    makerBoostMultiplier: raw.maker_boost_multiplier,
  };
}

interface ImpactResult {
  bps: number;
  beyondMeasuredDepth: boolean;
}

/** Returns { bps, beyondMeasuredDepth }. The second value is true when we
 * have no real measurement to go on -- either the buckets were never
 * sampled, or notionalUsd exceeds the largest measured bucket -- in which
 * case bps is a clamped/zeroed estimate, not a real one. */
export function impactBps(leg: LegInputs, notionalUsd: number): ImpactResult {
  const buckets: [number, number | null][] = [
    [10_000, leg.impactBps10k],
    [50_000, leg.impactBps50k],
    [100_000, leg.impactBps100k],
  ];
  if (!buckets.every(([, v]) => v !== null)) {
    return { bps: 0, beyondMeasuredDepth: true };
  }

  const xs = buckets.map(([x]) => x);
  const ys = buckets.map(([, y]) => y as number);
  if (notionalUsd >= IMPACT_MAX_BUCKET_USD) {
    return { bps: ys[ys.length - 1], beyondMeasuredDepth: true };
  }
  if (notionalUsd <= xs[0]) {
    return { bps: ys[0], beyondMeasuredDepth: false };
  }
  for (let i = 0; i < xs.length - 1; i++) {
    if (xs[i] <= notionalUsd && notionalUsd <= xs[i + 1]) {
      const t = (notionalUsd - xs[i]) / (xs[i + 1] - xs[i]);
      return { bps: ys[i] + t * (ys[i + 1] - ys[i]), beyondMeasuredDepth: false };
    }
  }
  return { bps: ys[ys.length - 1], beyondMeasuredDepth: false }; // unreachable given the bounds above
}

/** Maker-only: resting size this large may not fill if the book is thin. */
export function fillRisk(leg: LegInputs, notionalUsd: number): boolean {
  if (leg.depthUsd50k === null) return false;
  return leg.depthUsd50k < FILL_RISK_DEPTH_MULTIPLIER * notionalUsd;
}

function feeBps(leg: LegInputs, orderType: OrderType): number {
  return (orderType === "maker" ? leg.makerBps : leg.takerBps) ?? 0;
}

/** Spread + price-impact cost on top of the fee. Zero for maker (assumed
 * fill at mid). Returns { bps, beyondMeasuredDepth }. */
function extraCostBps(leg: LegInputs, orderType: OrderType, notionalUsd: number): ImpactResult {
  if (orderType === "maker") return { bps: 0, beyondMeasuredDepth: false };
  const impact = impactBps(leg, notionalUsd);
  const spreadHalf = (leg.spreadBps ?? 0) / 2;
  return { bps: spreadHalf + impact.bps, beyondMeasuredDepth: impact.beyondMeasuredDepth };
}

function legPointsSingleFill(leg: LegInputs, orderType: OrderType, notionalUsd: number): number {
  const counts = orderType === "maker" ? leg.makerCountsForPoints : leg.takerCountsForPoints;
  if (!counts) return 0;
  const boost = orderType === "maker" ? leg.makerBoostMultiplier : 1.0;
  const pointsPerUsd = leg.pointsPerUsdVolumeEstimate ?? 0;
  return notionalUsd * pointsPerUsd * leg.pairWeightMultiplier * boost;
}

function legRoundTrip(leg: LegInputs, orderType: OrderType, notionalUsd: number): LegRoundTrip {
  const extra = extraCostBps(leg, orderType, notionalUsd);
  const feeUsd = (2 * notionalUsd * feeBps(leg, orderType)) / 10_000;
  const spreadCostUsd = (2 * notionalUsd * extra.bps) / 10_000;
  const points = 2 * legPointsSingleFill(leg, orderType, notionalUsd);
  const risk = orderType === "maker" ? fillRisk(leg, notionalUsd) : false;
  return {
    orderType,
    feeUsd,
    spreadCostUsd,
    points,
    fillRisk: risk,
    beyondMeasuredDepth: extra.beyondMeasuredDepth,
  };
}

function fundingCostUsd(
  longLeg: LegInputs,
  shortLeg: LegInputs,
  notionalUsd: number,
  holdHours: number
): number {
  const prorate = holdHours / HOURS_PER_YEAR;
  const longRate = longLeg.fundingRateAnnualized7dMean ?? 0;
  const shortRate = shortLeg.fundingRateAnnualized7dMean ?? 0;
  return notionalUsd * prorate * (longRate - shortRate);
}

function legWhy(chosen: LegRoundTrip, alt: LegRoundTrip): string {
  const chosenCounts = chosen.points > 0;
  const altCounts = alt.points > 0;
  const orderType = chosen.orderType;
  if (chosenCounts && !altCounts) {
    return `${orderType}: only ${orderType} fills earn points on this venue.`;
  }
  if (!chosenCounts && altCounts) {
    return `${orderType}: chosen anyway -- switching to ${alt.orderType} would earn points here but raises the route's blended cost/point more than it helps.`;
  }
  if (chosenCounts && altCounts) {
    return `${orderType}: both fill types earn points here; ${orderType} has the lower net cost.`;
  }
  return `${orderType}: neither fill type earns points on this venue; picked the lower-cost side.`;
}

function effectiveRoundTripsPerWeek(params: ScoringParams): number {
  if (params.roundTripsPerWeek !== undefined) return params.roundTripsPerWeek;
  return Math.max(1, Math.floor(168 / params.holdHours));
}

export function recomputeRoute(
  longLeg: LegInputs,
  shortLeg: LegInputs,
  params: ScoringParams
): RecomputedRoute {
  const notional = params.notionalUsd;
  const holdHours = params.holdHours;
  const funding = fundingCostUsd(longLeg, shortLeg, notional, holdHours);

  interface Combo {
    longType: OrderType;
    shortType: OrderType;
    long: LegRoundTrip;
    short: LegRoundTrip;
    totalPoints: number;
    totalCost: number;
    costPerPoint: number | null;
  }

  const combos: Combo[] = [];
  for (const longType of ORDER_TYPES) {
    for (const shortType of ORDER_TYPES) {
      const long = legRoundTrip(longLeg, longType, notional);
      const short = legRoundTrip(shortLeg, shortType, notional);
      const totalPoints = long.points + short.points;
      const totalCost = long.feeUsd + long.spreadCostUsd + short.feeUsd + short.spreadCostUsd + funding;
      const costPerPoint = totalPoints > 0 ? totalCost / totalPoints : null;
      combos.push({ longType, shortType, long, short, totalPoints, totalCost, costPerPoint });
    }
  }

  // Keep-first-on-tie, matching Python's stable `min()` -- `b` only replaces
  // `a` when strictly better. With the reversed comparison a full tie on
  // (costPerPoint, totalCost) would pick the LAST combo while Python picks
  // the FIRST, and the recommended order_type would diverge between engines.
  const viable = combos.filter((c) => c.costPerPoint !== null);
  const best =
    viable.length > 0
      ? viable.reduce((a, b) =>
          (b.costPerPoint as number) < (a.costPerPoint as number) ||
          ((b.costPerPoint as number) === (a.costPerPoint as number) && b.totalCost < a.totalCost)
            ? b
            : a
        )
      : combos.reduce((a, b) => (b.totalCost < a.totalCost ? b : a));

  const altLongType: OrderType = best.longType === "maker" ? "taker" : "maker";
  const altShortType: OrderType = best.shortType === "maker" ? "taker" : "maker";
  const altLong = legRoundTrip(longLeg, altLongType, notional);
  const altShort = legRoundTrip(shortLeg, altShortType, notional);

  const totalVolumeUsd = 4 * notional;
  const pointsPer1mVolume = totalVolumeUsd > 0 ? (best.totalPoints / totalVolumeUsd) * 1_000_000 : null;
  const weeklyCostUsd = best.totalCost * effectiveRoundTripsPerWeek(params);

  return {
    costPerPointUsd: best.costPerPoint,
    pointsPer1mVolume,
    weeklyCostUsd,
    totalCostUsd: best.totalCost,
    totalPoints: best.totalPoints,
    fundingCostUsd: funding,
    long: best.long,
    short: best.short,
    longWhy: legWhy(best.long, altLong),
    shortWhy: legWhy(best.short, altShort),
    risks: {
      fillRisk: best.long.fillRisk || best.short.fillRisk,
      beyondMeasuredDepth: best.long.beyondMeasuredDepth || best.short.beyondMeasuredDepth,
    },
  };
}

/** Largest notional in `grid` where cost_per_point stays <= `threshold`,
 * holding hold_hours (and round_trips_per_week) fixed. null if the route
 * never earns points, or no grid point qualifies.
 *
 * `threshold` is the caller's job to pick (e.g. the venue's average
 * cost_per_point across its routes at the default notional) -- this
 * function has no notion of "venue average", it only evaluates the grid. */
export function findBreakevenUsd(
  longLeg: LegInputs,
  shortLeg: LegInputs,
  params: ScoringParams,
  threshold: number,
  grid: readonly number[] = BREAKEVEN_GRID_USD
): number | null {
  let best: number | null = null;
  for (const n of grid) {
    const result = recomputeRoute(longLeg, shortLeg, {
      notionalUsd: n,
      holdHours: params.holdHours,
      roundTripsPerWeek: params.roundTripsPerWeek,
    });
    if (result.costPerPointUsd !== null && result.costPerPointUsd <= threshold) {
      best = n;
    }
  }
  return best;
}
