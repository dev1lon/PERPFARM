/**
 * Shapes route_scores rows (from lib/data-source.ts::getRoutesForVenuePair)
 * into the recipe cards the /[venueSlug] wizard page renders, at whatever
 * notional/hold the caller asks for -- recomputed via lib/scoring.ts, not
 * read off the nightly-run defaults, so the sliders stay a true recompute.
 *
 * Sorting/ranking by strategy is presentation logic, not scoring math -- it
 * has no Python counterpart and doesn't need one (see docs/scoring.md's
 * breakeven section for the one piece of this file that *does* have a
 * parity requirement: findBreakevenUsd).
 */

import {
  findBreakevenUsd,
  parseLegInputs,
  recomputeRoute,
  type LegInputs,
  type RecomputedRoute,
  type ScoringParams,
} from "./scoring";
import type { Recipe, RecipeLeg, RecipesResponse, RouteScoreRow, Strategy } from "./types";

interface ScoredRoute {
  route: RouteScoreRow;
  longLeg: LegInputs;
  shortLeg: LegInputs;
  result: RecomputedRoute;
}

function scoreRoutes(routes: RouteScoreRow[], params: ScoringParams): ScoredRoute[] {
  const scored: ScoredRoute[] = [];
  for (const route of routes) {
    const breakdown = route.costBreakdown as unknown as Record<string, unknown>;
    if (!route.isComplete || !breakdown.long_inputs || !breakdown.short_inputs) continue;
    const longLeg = parseLegInputs(breakdown.long_inputs);
    const shortLeg = parseLegInputs(breakdown.short_inputs);
    const result = recomputeRoute(longLeg, shortLeg, params);
    if (result.costPerPointUsd === null) continue; // never earns points -- not a usable recipe
    scored.push({ route, longLeg, shortLeg, result });
  }
  return scored;
}

/** One recipe per pair: when both directions exist (cross-venue hedge),
 * keep whichever direction is cheaper. */
function dedupeByPair(scored: ScoredRoute[]): ScoredRoute[] {
  const byPair = new Map<string, ScoredRoute>();
  for (const s of scored) {
    const existing = byPair.get(s.route.symbolCanonical);
    if (!existing || (s.result.costPerPointUsd as number) < (existing.result.costPerPointUsd as number)) {
      byPair.set(s.route.symbolCanonical, s);
    }
  }
  return Array.from(byPair.values());
}

function averageCostPerPoint(scored: ScoredRoute[]): number | null {
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, s) => acc + (s.result.costPerPointUsd as number), 0);
  return sum / scored.length;
}

function rankByStrategy(scored: ScoredRoute[], strategy: Strategy): ScoredRoute[] {
  const ranked = [...scored];
  if (strategy === "cheapest") {
    ranked.sort((a, b) => (a.result.costPerPointUsd as number) - (b.result.costPerPointUsd as number));
    return ranked;
  }
  if (strategy === "max_points") {
    ranked.sort((a, b) => (b.result.pointsPer1mVolume ?? 0) - (a.result.pointsPer1mVolume ?? 0));
    return ranked;
  }

  // balanced: normalize cost (lower is better) and points/1M (higher is
  // better) to [0, 1] across the candidate set, combine 50/50.
  const costs = ranked.map((s) => s.result.costPerPointUsd as number);
  const pts = ranked.map((s) => s.result.pointsPer1mVolume ?? 0);
  const minCost = Math.min(...costs);
  const costRange = Math.max(...costs) - minCost || 1;
  const minPts = Math.min(...pts);
  const ptsRange = Math.max(...pts) - minPts || 1;

  const balancedScore = (s: ScoredRoute): number => {
    const costScore = 1 - ((s.result.costPerPointUsd as number) - minCost) / costRange;
    const pointsScore = ((s.result.pointsPer1mVolume ?? 0) - minPts) / ptsRange;
    return 0.5 * costScore + 0.5 * pointsScore;
  };

  ranked.sort((a, b) => balancedScore(b) - balancedScore(a));
  return ranked;
}

function buildLegs(route: RouteScoreRow, result: RecomputedRoute): [RecipeLeg, RecipeLeg] {
  const isSelfMatch = route.longVenueSlug === route.shortVenueSlug;
  return [
    {
      venue: route.longVenueSlug,
      side: "long",
      account: isSelfMatch ? "A" : null,
      orderType: result.long.orderType,
      why: result.longWhy,
    },
    {
      venue: route.shortVenueSlug,
      side: "short",
      account: isSelfMatch ? "B" : null,
      orderType: result.short.orderType,
      why: result.shortWhy,
    },
  ];
}

function buildRecipe(s: ScoredRoute, venueAvg: number | null, params: ScoringParams): Recipe {
  const isSelfMatch = s.route.longVenueSlug === s.route.shortVenueSlug;
  const costPerPoint = s.result.costPerPointUsd as number;

  const vsVenueAvg =
    venueAvg !== null && venueAvg !== 0 ? (venueAvg - costPerPoint) / Math.abs(venueAvg) : null;

  // "Works best up to ~$X" ceiling: the venue average when we have one
  // (comparability across this venue's other recipes), else this recipe's
  // own cost/point (degenerate but still answers "how big can I go").
  const breakevenThreshold = venueAvg ?? costPerPoint;
  const breakevenUsd = findBreakevenUsd(s.longLeg, s.shortLeg, params, breakevenThreshold);

  const boosted = s.longLeg.pairWeightMultiplier > 1 || s.shortLeg.pairWeightMultiplier > 1;

  return {
    pair: s.route.symbolCanonical,
    legs: buildLegs(s.route, s.result),
    costPerPointUsd: costPerPoint,
    vsVenueAvg,
    breakevenUsd,
    marginNeededUsd: null, // no per-venue margin/leverage data source exists yet
    chips: boosted ? ["boosted"] : [],
    risks: {
      washRisk: isSelfMatch,
      fillRisk: s.result.risks.fillRisk,
      beyondMeasuredDepth: s.result.risks.beyondMeasuredDepth,
    },
    details: {
      fundingCostUsd: s.result.fundingCostUsd,
      totalPoints: s.result.totalPoints,
      pointsPer1mVolume: s.result.pointsPer1mVolume,
      weeklyCostUsd: s.result.weeklyCostUsd,
      long: {
        feeUsd: s.result.long.feeUsd,
        spreadCostUsd: s.result.long.spreadCostUsd,
        points: s.result.long.points,
      },
      short: {
        feeUsd: s.result.short.feeUsd,
        spreadCostUsd: s.result.short.spreadCostUsd,
        points: s.result.short.points,
      },
    },
  };
}

export function buildRecipesResponse(
  venueSlug: string,
  hedgeSlug: string,
  routes: RouteScoreRow[],
  strategy: Strategy,
  params: ScoringParams
): RecipesResponse {
  const scored = dedupeByPair(scoreRoutes(routes, params));
  const venueAvg = averageCostPerPoint(scored);
  const ranked = rankByStrategy(scored, strategy);

  return {
    venue: venueSlug,
    hedge: hedgeSlug,
    strategy,
    notionalUsd: params.notionalUsd,
    holdHours: params.holdHours,
    recipes: ranked.map((s) => buildRecipe(s, venueAvg, params)),
  };
}
