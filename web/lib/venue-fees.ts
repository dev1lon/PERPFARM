/**
 * Published trading fees per venue, in basis points.
 *
 * Fees are a first-order cost — on TxFlow they are most of a route's price — so
 * they must not depend on a weekly background job having run. `fee_schedules`
 * in the database is written by the fee watcher and is used as an override when
 * a row exists; this table is the documented fallback so a route is never
 * priced as if trading were free.
 *
 * ADDING A PROTOCOL: this table is the reference the whole site prices from.
 * One cost model serves every protocol and only the DATA differs, so a new
 * venue needs its own row here -- its own maker/taker numbers, and its own
 * source note saying where they were read from and whether a referral discount
 * is included. The fee tooltip in the calculator is built from whatever is in
 * here, so it names the right protocol on its own; nothing in the UI has to be
 * edited. A venue with no row is treated as unknown, never as free.
 *
 * Sources:
 *  - Variational: 0% maker / 0% taker on Omni (docs.variational.io/omni).
 *  - TxFlow: VIP 0 is 0.0150% maker / 0.0450% taker; signing up through a
 *    referral takes 5% off, which is what a new account actually pays. Higher
 *    VIP tiers pay less, so this is the conservative end.
 *  - Polymarket Perps: entry tier of the published ladder, 0.0125% maker /
 *    0.0400% taker under $1M of trailing 30-day volume
 *    (docs.polymarket.com/perps -> Fees).
 *  - RiseX: Tier 1 of its Fee Tier page, 1.00 bps maker / 3.00 bps taker until
 *    14-day weighted volume crosses $5M.
 *  - QFEX: entry tier for SINGLE STOCKS, 0.05% maker / 0.10% taker, no
 *    discount. QFEX prices by asset class and nearly every market it lists is
 *    a single stock -- the most expensive class -- so indices, commodities and
 *    FX are priced above what they cost, never below (docs.qfex.com/qfex/fees).
 *  - Entropy: the HIP-3 schedule, 0.030% maker / 0.090% taker -- twice
 *    Hyperliquid's standard perp rate, split between Hyperliquid and the
 *    deployer. Volume tiers and growth mode can take it lower, so this is the
 *    top of the range.
 */
export const REFERRAL_FEE_DISCOUNT = 0.95;

export type VenueFees = { makerBps: number; takerBps: number };

const PUBLISHED_FEES: Record<string, VenueFees> = {
  variational: { makerBps: 0, takerBps: 0 },
  txflow: { makerBps: 1.5 * REFERRAL_FEE_DISCOUNT, takerBps: 4.5 * REFERRAL_FEE_DISCOUNT },
  polymarket: { makerBps: 1.25, takerBps: 4.0 },
  risex: { makerBps: 1.0, takerBps: 3.0 },
  qfex: { makerBps: 5.0, takerBps: 10.0 },
  entropy: { makerBps: 3.0, takerBps: 9.0 },
};

/** Published schedule for a venue, or null when we have not verified one. */
export function publishedFees(slug: string): VenueFees | null {
  return PUBLISHED_FEES[slug] ?? null;
}
