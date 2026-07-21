export type Confidence = "confirmed" | "estimated" | "rumor";

export interface VenueSummary {
  slug: string;
  name: string;
  apiStatus: "live" | "stub";
  seasonName: string | null;
  seasonEndDate: string | null;
  makerBps: number | null;
  takerBps: number | null;
  pairs: string[];
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
    // The point price is ALWAYS manual (farm field / OTC), never computed.
    otcPointPriceUsd: number | null;
    seasonName: string | null;
    seasonEndDate: string | null;
    twitterUrl: string | null;
    docsUrl: string | null;
    referralLink: string | null;
    notesMd: string | null;
  } | null;
  executionRules: {
    makerCountsForPoints: boolean;
    takerCountsForPoints: boolean;
    makerBoostMultiplier: number;
    notes: string | null;
  } | null;
  currentFees: FeeScheduleEntry | null;
  feeHistory: FeeScheduleEntry[];
  markets: { symbol: string; symbolCanonical: string; isActive: boolean }[];
}
