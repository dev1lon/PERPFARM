export type Confidence = "confirmed" | "estimated" | "rumor";
export type OrderType = "maker" | "taker";

export interface LegCostBreakdown {
  venue: string;
  order_type: OrderType;
  fee_usd: number;
  spread_cost_usd: number;
  points: number;
  fill_risk: boolean;
  beyond_measured_depth: boolean;
}

export interface RouteRisks {
  fill_risk: boolean;
  beyond_measured_depth: boolean;
  wash_risk: boolean;
}

export interface CostBreakdown {
  notional_usd: number;
  hold_hours: number;
  long: LegCostBreakdown;
  short: LegCostBreakdown;
  funding_cost_usd: number;
  total_cost_usd: number;
  total_points: number;
  risks?: RouteRisks;
}

export interface LegRecommendation {
  order_type: OrderType;
  why: string;
}

export interface RecommendedExecution {
  long: LegRecommendation;
  short: LegRecommendation;
}

export interface DataFreshness {
  oldest_manual_date: string | null;
  min_confidence: Confidence | null;
  incomplete_reasons: string[];
}

export interface RouteScoreRow {
  symbolCanonical: string;
  longVenueSlug: string;
  longVenueName: string;
  shortVenueSlug: string;
  shortVenueName: string;
  ts: string;
  isComplete: boolean;
  costPerPointUsd: number | null;
  pointsPer1mVolume: number | null;
  dilutionScore: number | null;
  costBreakdown: CostBreakdown | Record<string, never>;
  recommendedExecution: RecommendedExecution | Record<string, never>;
  dataFreshness: DataFreshness;
}

export interface VenueSummary {
  slug: string;
  name: string;
  apiStatus: "live" | "stub";
  seasonName: string | null;
  seasonEndDate: string | null;
  makerBps: number | null;
  takerBps: number | null;
  confidence: Confidence | null;
  lastVerified: string | null;
  pairs: string[];
  cheapestCostPerPointUsd: number | null;
}

export interface FeeScheduleEntry {
  makerBps: number;
  takerBps: number;
  effectiveFrom: string;
  sourceUrl: string | null;
}

export interface VenueDetail {
  slug: string;
  name: string;
  apiStatus: "live" | "stub";
  meta: {
    raisedUsd: number | null;
    investors: string | null;
    communitySupplyPct: number | null;
    otcPointPriceUsd: number | null;
    seasonName: string | null;
    seasonEndDate: string | null;
    twitterUrl: string | null;
    docsUrl: string | null;
    referralLink: string | null;
    notesMd: string | null;
  } | null;
  pointsProgram: {
    descriptionMd: string;
    pointsPerUsdVolumeEstimate: number | null;
    weightNotes: string | null;
    confidence: Confidence;
    lastVerified: string;
    source: string | null;
  } | null;
  executionRules: {
    makerCountsForPoints: boolean;
    takerCountsForPoints: boolean;
    makerBoostMultiplier: number;
    notes: string | null;
  } | null;
  currentFees: FeeScheduleEntry | null;
  feeHistory: FeeScheduleEntry[];
  latestDistribution: {
    ts: string;
    pointsDistributedWeek: number | null;
    totalPointsOutstanding: number | null;
  } | null;
  markets: { symbol: string; symbolCanonical: string; isActive: boolean }[];
}

// ---- /api/venues/[slug]/recipes ----

export type Strategy = "cheapest" | "max_points" | "balanced";

export interface RecipeLeg {
  venue: string;
  side: "long" | "short";
  account: "A" | "B" | null; // set for same-venue (hedge=self) recipes only
  orderType: OrderType;
  why: string;
}

export interface RecipeRisks {
  washRisk: boolean;
  fillRisk: boolean;
  beyondMeasuredDepth: boolean;
}

export interface RecipeDetails {
  fundingCostUsd: number;
  totalPoints: number;
  pointsPer1mVolume: number | null;
  weeklyCostUsd: number | null;
  long: { feeUsd: number; spreadCostUsd: number; points: number };
  short: { feeUsd: number; spreadCostUsd: number; points: number };
}

export interface Recipe {
  pair: string;
  legs: [RecipeLeg, RecipeLeg];
  costPerPointUsd: number | null;
  vsVenueAvg: number | null;
  breakevenUsd: number | null;
  // no per-venue margin/leverage data exists yet (never fabricated) --
  // stays null until a real source is wired up
  marginNeededUsd: number | null;
  chips: string[];
  risks: RecipeRisks;
  details: RecipeDetails;
}

export interface RecipesResponse {
  venue: string;
  hedge: string;
  strategy: Strategy;
  notionalUsd: number;
  holdHours: number;
  recipes: Recipe[];
}
