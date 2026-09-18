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
  // Standard Mode, tier 0: 0.030% maker / 0.090% taker
  // (docs.trade.xyz/perpetuals/mechanics). Growth-mode markets are a tenth of
  // it and are priced per market in ASSET_CLASS_FEES below.
  tradexyz: { makerBps: 3.0, takerBps: 9.0 },
  // Read from Hibachi's own exchange-info feeConfig (tradeMakerFeeRate 0,
  // tradeTakerFeeRate 0.00045), which is also what its fee row stores.
  hibachi: { makerBps: 0.0, takerBps: 4.5 },
  // Lighter on Robinhood Chain: a standard account pays 0% maker / 0% taker
  // (apidocs.rh.lighter.xyz/docs/account-types), which is also what every
  // market's own fee fields report. Premium accounts pay for lower latency;
  // they are not the account a farmer opens by default.
  lighterrh: { makerBps: 0.0, takerBps: 0.0 },
  // Hyperliquid core, tier 0 (0.015% maker / 0.045% taker). TrueNorth adds no
  // builder fee, so its route uses these exchange rates unchanged -- the rate,
  // its source and the date it was read live in TRUE_NORTH_BUILDER_FEE
  // (lib/truenorth-execution.ts), never as the 10 bps ceiling beside it.
  hyperliquid: { makerBps: 1.5, takerBps: 4.5 },
  // Ondo's live enabled-contract schedule (0.01% maker / 0.025% taker).
  ondo: { makerBps: 1.0, takerBps: 2.5 },
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
    // GROWTH MODE, announced 2026-09-14 and read per market from
    // api.qfex.com/fees: 0 bps maker, with 1.5 bps taker on the equities
    // (SNDK, ANTHROPIC) against 0.6 on crude. Priced at the dearer end, so
    // crude is charged above its cost rather than below it. The discount now
    // lands at the time of trade; it used to arrive later as a rebate, which
    // this model never counted anyway.
    GROWTH_MODE: { makerBps: 0.0, takerBps: 1.5 },
  },
  // Not an instrument class: trade.xyz charges by FEE MODE, and Hyperliquid
  // states the mode per market. The collector stores GROWTH_MODE on each market
  // in growth mode (worker/perpfarm/adapters/tradexyz.py) -- 0.0030% maker /
  // 0.0090% taker, a tenth of Standard Mode. Pricing all 120 markets at the
  // standard rate would have overstated 113 of them tenfold.
  tradexyz: {
    GROWTH_MODE: { makerBps: 0.3, takerBps: 0.9 },
    // trade.xyz's crypto is Hyperliquid's own core book, not the xyz dex, and
    // pays the core schedule: tier 0, 0.015% maker / 0.045% taker
    // (docs.hyperliquid.xyz, "Fees") -- half the HIP-3 rate above. The
    // collector stores CRYPTO on each core market. trade.xyz publishes no
    // builder fee of its own on these, so none is added.
    CRYPTO: { makerBps: 1.5, takerBps: 4.5 },
  },
};

/** How to name a class in the fee note under a route. */
const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: "stocks",
  // Ondo files its own stocks under STOCK; QFEX and the curated map say EQUITY.
  STOCK: "stocks",
  INDEX: "indices",
  ETF: "ETFs",
  COMMODITY: "commodities",
  FX: "FX",
  GROWTH_MODE: "growth-mode markets",
  // Plain "crypto": the class is stored by three venues now, and the note that
  // named one of them ("crypto (Hyperliquid core)") read as a claim about Ondo's
  // book once Ondo started storing it too.
  CRYPTO: "crypto",
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
/**
 * The venue's rate for THIS market's class, and nothing else: null when the
 * venue has no per-class schedule or the class is not one it prices by.
 *
 * Callers that also hold the venue-wide `fee_schedules` row must let this win
 * over that row. The row is one headline rate (QFEX's is its single-stock
 * 5/10 bps; trade.xyz's is Standard Mode 3/9), so reading the row first
 * charged QFEX's FX pairs the stock rate and would charge every trade.xyz
 * growth-mode market ten times what it costs.
 */
export function classFees(slug: string, assetClass?: string | null): VenueFees | null {
  const byClass = ASSET_CLASS_FEES[slug];
  if (!byClass || !assetClass) return null;
  return byClass[assetClass.toUpperCase()] ?? null;
}

export function publishedFees(slug: string, assetClass?: string | null): VenueFees | null {
  const byClass = ASSET_CLASS_FEES[slug];
  if (byClass && assetClass) {
    const forClass = byClass[assetClass.toUpperCase()];
    if (forClass) return forClass;
  }
  return PUBLISHED_FEES[slug] ?? null;
}

/**
 * THE order of fee sources, for every caller.
 *
 *   1. this market's CLASS schedule -- a venue that prices by instrument class
 *      (QFEX) or by fee mode (trade.xyz, Hyperliquid) charges an index a fifth
 *      of a single stock, so one venue-wide rate is wrong on most of its list;
 *   2. the STORED row the fee watcher wrote, which is one venue-wide rate;
 *   3. the published headline above, so a venue is never priced as free.
 *
 * It lived in three places and one of them was different: the cross table read
 * the stored row, the same-protocol table never did. The day the fee watcher
 * writes a row, those two answers part company for the same venue -- and the
 * worker (hedge_recommendations.py, `by_class` then `market.maker_bps` then
 * PUBLISHED_FEES) already read them in this order.
 */
export function resolveFees(
  slug: string,
  assetClass: string | null | undefined,
  stored?: { makerBps: number | null; takerBps: number | null } | null,
): VenueFees | null {
  const byClass = classFees(slug, assetClass);
  if (byClass) return byClass;
  const published = publishedFees(slug, assetClass);
  const makerBps = stored?.makerBps ?? published?.makerBps ?? null;
  const takerBps = stored?.takerBps ?? published?.takerBps ?? null;
  return makerBps === null || takerBps === null ? null : { makerBps, takerBps };
}
