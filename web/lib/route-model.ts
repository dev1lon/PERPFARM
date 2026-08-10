/**
 * The one definition of how a farming route is priced and bucketed.
 *
 * Three calculators quote the same product -- Variational same-protocol, TxFlow
 * same-protocol, and the cross-protocol route -- and each used to carry its own
 * copy of these numbers. They drifted: the funding horizon was 24h in one, 12h
 * in another and absent in the third, and the OI bands differed by two orders
 * of magnitude, so the same market landed in "high" on one page and "low" on
 * the next. Importing from here is what keeps the three answers comparable.
 */

/**
 * Funding is quoted for a fixed 12-hour hold on every protocol.
 *
 * A hold length has to be assumed to put a number on funding at all, and a
 * constant one keeps pairs comparable. It is NOT part of the route's cost: it
 * has its own sign, it can be a credit as easily as a charge, and it drifts
 * during the hold. Ranking uses execution cost; funding is reported beside it.
 */
export const FUNDING_HOLD_HOURS = 12;

/** Funding is averaged over this window before the 12-hour hold is applied. */
export const FUNDING_AVERAGE_WINDOW_HOURS = 24;

export const HOURS_PER_YEAR = 8_760;

/** Below this 24h volume a market is dead, not cheap. */
export const MIN_VOLUME_USD = 1_000;

/**
 * How a protocol's stored open interest becomes the number we display.
 *
 * Protocols do not agree on what "open interest" counts, so a single global
 * multiplier is guaranteed to be wrong for someone. The rule is to show what
 * the protocol's OWN interface shows, verified per protocol:
 *
 *  - Variational stores long + short and its UI shows twice that (checked
 *    against the venue UI on 2026-08-09).
 *  - TxFlow has no confirmed display adjustment, so we retain its raw API
 *    value. Doubling it made the same market read $51k on its own page and
 *    $102k in the cross table.
 *
 * Anything unverified stays at 1: showing a venue's raw number is a smaller
 * error than confidently doubling it for no reason.
 */
const OI_DISPLAY_FACTOR: Record<string, number> = {
  variational: 2,
  txflow: 1,
};

export function oiDisplayFactor(venueSlug: string): number {
  return OI_DISPLAY_FACTOR[venueSlug] ?? 1;
}

/** Normalize a stored OI observation to this protocol's displayed convention. */
export function displayedOpenInterestUsd(rawOiUsd: number, venueSlug: string): number {
  return rawOiUsd * oiDisplayFactor(venueSlug);
}

export type OiBands = { high: number; medium: number; low: number };

/**
 * OI thresholds, in each protocol's displayed convention. Variational's is
 * gross (long + short); TxFlow's is its unadjusted raw API value. Lower open interest means fewer farmers
 * splitting the same emission, at a wider spread -- so the bands are a
 * points-per-cost trade-off control, not a quality ranking.
 *
 * The CONVENTION and the formula are shared; the numbers cannot be. Protocol
 * OI universes differ by three orders of magnitude -- Variational's markets run
 * $51k to $410M, TxFlow's $7k to $20M -- so a single set of cutoffs puts every
 * Variational market in one band and makes the filter a no-op there.
 */
const DEFAULT_OI_BANDS: OiBands = { high: 300_000, medium: 100_000, low: 10_000 };

const OI_BANDS_BY_VENUE: Record<string, OiBands> = {
  // Set against TxFlow's live book, where $358k is a large TradFi market.
  txflow: DEFAULT_OI_BANDS,
  // Variational is a far deeper venue; these are its previously calibrated
  // cutoffs and are what its "Medium OI" guidance refers to.
  variational: { high: 20_000_000, medium: 3_000_000, low: 50_000 },
};

export function oiBandsFor(venueSlug: string): OiBands {
  return OI_BANDS_BY_VENUE[venueSlug] ?? DEFAULT_OI_BANDS;
}

/** Kept for callers that band a market without knowing its protocol. */
export const OI_BANDS = DEFAULT_OI_BANDS;

/** No route is recommended below the bottom of a protocol's lowest band. */
export function minOpenInterestUsd(venueSlug: string): number {
  return oiBandsFor(venueSlug).low;
}

export type OiBandKey = "high" | "medium" | "low";

/** Band for a displayed OI figure on a given protocol, or null when under floor. */
export function oiBandFor(displayedOiUsd: number, venueSlug: string): OiBandKey | null {
  const bands = oiBandsFor(venueSlug);
  if (displayedOiUsd > bands.high) return "high";
  if (displayedOiUsd >= bands.medium) return "medium";
  if (displayedOiUsd >= bands.low) return "low";
  return null;
}

export type CostTier = "low" | "medium" | "high";

/**
 * How expensive the ORDER BOOK is, graded on the same scale everywhere.
 *
 * Fees are excluded deliberately. They are identical for every pair on a
 * protocol, so grading them says nothing about the pair and everything about
 * the venue -- and with one absolute scale the badge collapsed: measured on
 * live data, "Low" was unreachable on TxFlow (its 5.7 bps fee alone exceeds
 * any low threshold) while "High" was unreachable on Variational (its worst
 * pair costs 4.6 bps in total). One of the three colours never appeared on
 * each protocol.
 *
 * What actually varies pair to pair is spread and quote impact. Grading that
 * lets one rule serve every protocol: the venue's fee shifts the origin, the
 * book decides the colour.
 */
const BOOK_COST_LOW_BPS = 1.5;
const BOOK_COST_MEDIUM_BPS = 4;

export function executionTier(cycleCostUsd: number, feeCostUsd: number, accountVolumeUsd: number): CostTier {
  if (accountVolumeUsd <= 0) return "high";
  const bookBps = ((cycleCostUsd - feeCostUsd) / accountVolumeUsd) * 10_000;
  return bookBps <= BOOK_COST_LOW_BPS ? "low" : bookBps <= BOOK_COST_MEDIUM_BPS ? "medium" : "high";
}
