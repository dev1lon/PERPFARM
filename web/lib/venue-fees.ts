/**
 * Published trading fees per venue, in basis points.
 *
 * Fees are a first-order cost — on TxFlow they are most of a route's price — so
 * they must not depend on a weekly background job having run. `fee_schedules`
 * in the database is written by the fee watcher and is used as an override when
 * a row exists; this table is the documented fallback so a route is never
 * priced as if trading were free.
 *
 * Sources:
 *  - Variational: 0% maker / 0% taker on Omni (docs.variational.io/omni).
 *  - TxFlow: VIP 0 is 0.0150% maker / 0.0450% taker; signing up through a
 *    referral takes 5% off, which is what a new account actually pays. Higher
 *    VIP tiers pay less, so this is the conservative end.
 */
export const REFERRAL_FEE_DISCOUNT = 0.95;

export type VenueFees = { makerBps: number; takerBps: number };

const PUBLISHED_FEES: Record<string, VenueFees> = {
  variational: { makerBps: 0, takerBps: 0 },
  txflow: { makerBps: 1.5 * REFERRAL_FEE_DISCOUNT, takerBps: 4.5 * REFERRAL_FEE_DISCOUNT },
};

/** Published schedule for a venue, or null when we have not verified one. */
export function publishedFees(slug: string): VenueFees | null {
  return PUBLISHED_FEES[slug] ?? null;
}
