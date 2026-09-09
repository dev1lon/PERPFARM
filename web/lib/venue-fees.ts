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
 *  - QFEX: priced BY ASSET CLASS, no discount (docs.qfex.com/qfex/fees) --
 *    0.05%/0.10% on a single stock, 0.02%/0.05% on an index or a commodity,
 *    0.01%/0.02% on an FX pair. Charging every market the single-stock rate
 *    made its 23 non-equity markets cost up to five times what they do, so the
 *    class of each market is read from QFEX itself and stored with it.
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
  // Base tier. Nado's schedule is volume-tiered and the tier table is
  // published as an image, so 3.5 bps is the taker rate its own worked example
  // uses; maker rebates are described as a benefit of HIGHER tiers, so the
  // base-tier maker is not paid rather than credited a rebate we cannot read.
  // docs.nado.xyz/core/fees-and-rebates
  nado: { makerBps: 0.0, takerBps: 3.5 },
};

/**
 * Venues that charge by INSTRUMENT CLASS rather than one venue-wide rate.
 *
 * Keyed by the class string the venue itself publishes and we store on the
 * market (`markets.asset_class`), so a class we have never seen -- a new
 * product line -- falls back to the venue's headline rate above instead of
 * being priced as free.
 */
const ASSET_CLASS_FEES: Record<string, Record<string, VenueFees>> = {
  qfex: {
    EQUITY: { makerBps: 5.0, takerBps: 10.0 },
    INDEX: { makerBps: 2.0, takerBps: 5.0 },
    COMMODITY: { makerBps: 2.0, takerBps: 5.0 },
    FX: { makerBps: 1.0, takerBps: 2.0 },
  },
};

/** How to name a class in the fee note under a route. */
const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: "stocks",
  INDEX: "indices",
  COMMODITY: "commodities",
  FX: "FX",
};

export function assetClassLabel(assetClass: string | null | undefined): string | null {
  if (!assetClass) return null;
  return ASSET_CLASS_LABELS[assetClass.toUpperCase()] ?? assetClass.toLowerCase();
}

/** True where the venue's rate depends on which instrument is traded. */
export function feesVaryByAssetClass(slug: string): boolean {
  return slug in ASSET_CLASS_FEES;
}

/**
 * Published schedule for a venue, or null when we have not verified one.
 *
 * `assetClass` is the venue's own class for the market being priced. It is
 * consulted only for venues that publish a per-class schedule; everywhere else
 * the venue-wide rate is the answer and the argument is ignored.
 */
export function publishedFees(slug: string, assetClass?: string | null): VenueFees | null {
  const byClass = ASSET_CLASS_FEES[slug];
  if (byClass && assetClass) {
    const forClass = byClass[assetClass.toUpperCase()];
    if (forClass) return forClass;
  }
  return PUBLISHED_FEES[slug] ?? null;
}
