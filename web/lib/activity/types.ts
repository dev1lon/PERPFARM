/**
 * The one shape every protocol's activity chart is served in.
 *
 * The chart component is shared, so the contract has to be too. Each protocol
 * fills it from whatever sources it actually has -- Variational from its own
 * stats feed, DefiLlama and our saved snapshots; TxFlow from its official Dune
 * dashboard -- but none of them may invent a field or drop one.
 */
import type { ActivityPoint } from "@/lib/dune";

export type { ActivityPoint };

/** How far back any activity series may reach. */
export const HISTORY_DAYS = 180;

export type ActivityResponse = {
  asOf: string;
  days: number;
  volume: {
    series: ActivityPoint[];
    /** How many days came from our own saved observations. */
    observedDays: number;
    latest24h: number | null;
  };
  openInterest: {
    series: ActivityPoint[];
    observedDays: number;
    latest: number | null;
  };
  uniqueTraders: {
    series: ActivityPoint[];
    latest: number | null;
    /** Named so the chart can label a lower bound as one. */
    source: "dune" | "official-site";
    metric: "uniqueTraders" | "activeAddresses";
  };
};
