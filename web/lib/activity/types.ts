/**
 * The one shape every protocol's activity chart is served in.
 *
 * The chart component is shared, so the contract has to be too. Each protocol
 * fills it from whatever sources it actually has -- Variational from DefiLlama
 * and our own saved snapshots, TxFlow from its official Dune dashboard -- but
 * none of them may invent a field or drop one.
 *
 * `uniqueTraders` is OPTIONAL and stays that way. TxFlow's official Dune
 * dashboard publishes a real daily history of it; Variational only ever
 * published today's number, which is a dot, not a chart -- so the field is
 * absent there rather than filled with a scraped single point.
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
  /** Present only where the protocol publishes a real daily history of it. */
  uniqueTraders?: {
    series: ActivityPoint[];
    observedDays: number;
    latest: number | null;
  };
};
