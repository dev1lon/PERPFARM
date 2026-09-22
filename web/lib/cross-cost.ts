/**
 * Live cross-protocol execution cost, computed on demand from the latest
 * hourly snapshots of TWO venues. Mirrors the same-protocol pair Run (P6) but:
 *  - each leg crosses its OWN venue's book + pays its OWN fees (no self-match,
 *    so all four fills are taker);
 *  - funding does NOT net to zero -- it is the delta between the two venues'
 *    rates, and is reported separately from the route's execution cost.
 * Point value is never involved -- that's the user's manual number.
 */

import { getPool } from "@/lib/db";
import { asIsoTs, impactAtNotional, loadCostHistory, rowsFor } from "@/lib/cost-history";
import { cheaperAssignment, matchByTick, type RouteSample, type TakerBook } from "@/lib/route-samples";
import { quoteCurveImpactBps, quoteCurveMaxNotionalUsd } from "@/lib/quote-curve";
import {
  FUNDING_HOLD_HOURS,
  snapshotsAreFresh,
  HOURS_PER_YEAR,
  DEAD_MARKET_OI_USD,
  DEAD_MARKET_VOLUME_USD,
  MIN_PAIRS_FOR_BANDS,
  QUOTE_CLOSED_AFTER_MS,
  QUOTE_GONE_AFTER_MS,
  TICK_MATCH_TOLERANCE_MS,
  displayedOpenInterestUsd,
  isDeadMarket,
  oiBandsFor,
  quoteLagMs,
  referenceRunMs,
} from "@/lib/route-model";
import { instrumentClass, isSwap, isTradfiMarket, swapUnderlying, venueTicker, type InstrumentClass } from "@/lib/tradfi";
import { assetClassLabel, classFees, publishedFees, resolveFees } from "@/lib/venue-fees";

type VenueMarketRow = {
  slug: string;
  pair: string;
  /** The venue's own ticker (`xyz:GOLD`), before canonical renaming. */
  symbol: string;
  /** As the driver hands it over: node-postgres decodes timestamptz to Date. */
  book_ts: string | Date;
  spread_bps: string | number | null;
  impact_bps_10k: string | number | null;
  impact_bps_50k: string | number | null;
  impact_bps_100k: string | number | null;
  quote_curve_json: unknown;
  volume_24h_usd: string | number | null;
  open_interest_usd: string | number | null;
  funding: string | number | null;
  taker_bps: string | number | null;
  maker_bps: string | number | null;
  /** The venue's own instrument class, where it publishes one. */
  asset_class: string | null;
};

export type CrossPair = {
  pair: string;
  /** What the instrument is. See lib/tradfi.ts -- the venue's own class where
   *  it publishes one, our curated map otherwise, crypto when neither knows. */
  assetClass: InstrumentClass;
  oiAUsd: number;
  oiBUsd: number;
  /** Gross OI of the protocol the user started the calculator on. */
  mainOiUsd: number;
  /** The THINNER leg's 24h turnover: a hedge can only do the volume both books
   *  carry. Kept because the listing rule reads it. */
  volume24hMinUsd: number;
  /** 24h turnover ON THE PROTOCOL BEING FARMED, the same venue `mainOiUsd`
   *  reports. Volume and open interest each belong to one book, so a row that
   *  mixed the home venue's OI with the thinner leg's volume described two
   *  different venues in neighbouring columns. */
  mainVolume24hUsd: number;
  longVenue: string;
  shortVenue: string;
  /** Venue the resting LIMIT orders sit on (the cheaper side to be passive). */
  makerVenue: string;
  /** Venue the MARKET orders cross. */
  takerVenue: string;
  execCostUsd: number;
  feeCostUsd: number;
  spreadCostUsd: number;
  slippageCostUsd: number;
  fundingUsd: number | null;
  cycleCostUsd: number;
  /** The 24h p25-p75 band around the median cost. */
  costRangeLowUsd: number;
  costRangeHighUsd: number;
  /** Share of the last week's readings where the price gap left its usual
   *  place, and the rating that follows from it. */
  spreadBreakoutShare: number | null;
  spreadRisk: SpreadRisk;
  /** Each leg's ticker AS THAT VENUE SHOWS IT, keyed by venue slug. The row is
   *  named by the canonical pair, which is not always what a venue calls the
   *  market -- Variational's US500 is SPY here, trade.xyz's GOLD is XAU -- and
   *  someone searching the venue for the row's name would not find it. */
  tickers: Record<string, string>;
  /** Venues whose leg had no quote in that venue's latest run: shut for now (a
   *  swap's daily break). The route is priced from its last quoted hour. */
  closedVenues: string[];
};

export type CrossBand = { key: "high" | "medium" | "low" | "all"; oiRangeUsd: [number, number]; pairs: CrossPair[] };

export type CrossRankings = {
  venueA: string;
  venueB: string;
  accountVolumeUsd: number;
  fillNotionalUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  /** A leg is dropped only when BOTH its 24h volume and its open interest are
   *  under these (a dead listing); there are no other liquidity floors. */
  deadMarketVolumeUsd: number;
  deadMarketOiUsd: number;
  grouped: boolean;
  bands: CrossBand[];
  /** Every eligible pair, cheapest first -- what the "All" tab pages through. */
  pairs: CrossPair[];
  /** The fee schedule actually applied per venue, so the UI never hard-codes one. */
  /** One entry per schedule actually applied. A venue that prices by
   *  instrument class contributes one entry per class present in the answer,
   *  each naming its class; a venue with a single rate contributes one. */
  feeSchedule: Array<{ venue: string; makerBps: number; takerBps: number; assetClass?: string | null }>;
  /** Why pairs were excluded, so an empty result explains itself. */
  drops: Record<string, number>;
  /** Home-venue tickers with no counterpart on the hedge venue, for diagnosis
   *  of naming mismatches (the same instrument listed under two symbols). */
  unmatched: string[];
  /** What the headline number is, same vocabulary as the other calculators. */
  costBasis: "24h-median" | "latest-snapshot";
  /** Per-venue freshness, so a stalled collector is announced here exactly as
   *  it is on a single-protocol page instead of passing yesterday off as now. */
  sources: Array<{ venue: string; live: boolean }>;
  asOf: string | null;
};

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** What one venue costs, in bps of the turnover done on it, per order type.
 *
 *  A resting LIMIT is filled at its own price: it pays the maker fee and
 *  crosses nothing, so it carries no half-spread and no quote impact. A MARKET
 *  order pays the taker fee and crosses the book.
 *
 *  Missing fee data returns null rather than 0 — a venue with no fee schedule
 *  is unknown, not free, and silently pricing it at zero is what made TxFlow
 *  look cheaper than it is. */
function venueBps(
  row: VenueMarketRow,
  fillNotionalUsd: number,
  impactMode: "average" | "cheapest" = "average",
): { maker: number; taker: number; spreadBps: number; impactBps: number; makerFee: number; takerFee: number } | null {
  const spread = asNumber(row.spread_bps);
  // A venue that publishes a curve is priced from the curve ALONE. Falling back
  // to the coarse anchors when the curve stopped short handed back the impact
  // of a SMALLER fill (they clamped to their last reading), so a book measured
  // to $25k priced a $100k leg as if it would fill. Same rule as
  // sampleFromSnapshot, so the live reading and the 24h history agree.
  const impact = quoteCurveMaxNotionalUsd(row.quote_curve_json) === null
    ? impactAtNotional(fillNotionalUsd, [
        [10_000, asNumber(row.impact_bps_10k)],
        [50_000, asNumber(row.impact_bps_50k)],
        [100_000, asNumber(row.impact_bps_100k)],
      ])
    : quoteCurveImpactBps(row.quote_curve_json, fillNotionalUsd, impactMode);
  // THIS MARKET'S CLASS schedule wins, then the stored venue row, then the
  // venue's published headline rate. The stored row is one venue-wide rate
  // (QFEX's single-stock 5/10, trade.xyz's Standard Mode 3/9), so letting it
  // win charged QFEX's FX pairs the stock rate, and would charge trade.xyz's
  // growth-mode markets ten times -- and its core crypto twice -- what they
  // cost, the day the fee watcher writes a row. schedulesOf() below and the
  // worker already read them in this order. Only a venue we have neither for
  // is treated as unknown.
  const resolved = resolveFees(row.slug, row.asset_class, {
    makerBps: asNumber(row.maker_bps),
    takerBps: asNumber(row.taker_bps),
  });
  const takerFee = resolved?.takerBps ?? null;
  const makerFee = resolved?.makerBps ?? null;
  if (spread === null || impact === null || takerFee === null || makerFee === null) return null;
  return {
    maker: makerFee,
    taker: takerFee + spread / 2 + impact,
    spreadBps: spread / 2,
    impactBps: impact,
    makerFee,
    takerFee,
  };
}

async function loadVenueMarkets(slugs: string[]): Promise<VenueMarketRow[]> {
  // Cached in this instance's memory until the next collection, like the cost
  // history it is priced against: the query depends on the two venues and the
  // hour, never on the size the visitor typed.
  return rowsFor<VenueMarketRow>(`cross:${[...slugs].sort().join("+")}`, () =>
    getPool().query<VenueMarketRow>(
    `WITH v AS (SELECT id, slug FROM venues WHERE slug = ANY($1)),
     book AS (
       -- Deliberately UNBOUNDED: the newest row each market has, however old.
       -- A stalled collector must not blank the page -- an old number the user
       -- can see and judge beats an empty screen. The age is not hidden: the
       -- timestamp travels with the row and the answer reports per-venue
       -- freshness, which raises the "may be out of date" banner.
       SELECT DISTINCT ON (b.market_id)
         b.market_id, b.ts, b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k,
         to_jsonb(b) -> 'quote_curve_json' AS quote_curve_json
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       JOIN v ON v.id = m.venue_id
       ORDER BY b.market_id, b.ts DESC
     ),
     vol AS (
       SELECT DISTINCT ON (s.market_id)
         s.market_id, s.volume_24h_usd, s.open_interest_usd
       FROM volume_snapshots s
       JOIN markets m ON m.id = s.market_id
       JOIN v ON v.id = m.venue_id
       ORDER BY s.market_id, s.ts DESC
     ),
     fund AS (
       -- TRIMMED MEAN of the last 24 hours: drop the extreme 10% at each end,
       -- average the rest.
       --
       -- Funding is not like execution cost, and the two need different
       -- statistics. You cross the spread ONCE, so its typical value -- the
       -- median -- is what you will meet. Funding ACCRUES EVERY HOUR you hold,
       -- so the total is the sum, and the mean is the aggregate that matches
       -- it. A median answers "what did a typical hour look like", which is
       -- not the question.
       --
       -- Measured over 707 pair-venue series: for most pairs all three agree,
       -- but in the tail the median sits 3-5x further from the mean than a
       -- trimmed mean does, and on skewed pairs it is simply wrong -- KSTR's
       -- median is 0.000 against a mean of -1.059, and ONE's median even flips
       -- the sign. Trimming keeps the additive property while stopping one
       -- reading (TxFlow's BZ swings between -1288% and +612% annualised) from
       -- setting the number by itself.
       SELECT market_id, AVG(funding_rate_annualized) AS funding
       FROM (
         SELECT f.market_id, f.funding_rate_annualized,
                row_number() OVER (PARTITION BY f.market_id ORDER BY f.funding_rate_annualized) AS rank_asc,
                count(*) OVER (PARTITION BY f.market_id) AS n
         FROM funding_snapshots f
         JOIN markets m ON m.id = f.market_id
         JOIN v ON v.id = m.venue_id
         WHERE f.ts >= now() - interval '24 hours'
       ) ranked
       -- Too few readings to trim: keep them all rather than throw away half.
       WHERE n < 5
          OR (rank_asc > floor(n * 0.1) AND rank_asc <= n - floor(n * 0.1))
       GROUP BY market_id
     ),
     fee AS (
       SELECT DISTINCT ON (venue_id) venue_id, taker_bps, maker_bps
       FROM fee_schedules
       WHERE effective_from <= CURRENT_DATE AND venue_id IN (SELECT id FROM v)
       ORDER BY venue_id, effective_from DESC, created_at DESC
     )
     SELECT v.slug, m.symbol_canonical AS pair, m.symbol, m.asset_class, book.ts AS book_ts,
            book.spread_bps, book.impact_bps_10k, book.impact_bps_50k, book.impact_bps_100k, book.quote_curve_json,
            vol.volume_24h_usd, vol.open_interest_usd, fund.funding, fee.taker_bps, fee.maker_bps
     FROM markets m
     JOIN v ON v.id = m.venue_id
     JOIN book ON book.market_id = m.id
     JOIN vol ON vol.market_id = m.id
     LEFT JOIN fund ON fund.market_id = m.id
     LEFT JOIN fee ON fee.venue_id = m.venue_id
     WHERE m.is_active = true`,
      [slugs],
    ),
  );
}


/**
 * How often the two venues' prices come apart while a hedge is open.
 *
 * A cross-protocol hedge is long on one venue and short on the other, so it is
 * neutral only while the two agree on price. What costs money is not the gap
 * itself -- you meet it going in AND coming out, so a steady gap cancels -- but
 * the gap LEAVING its usual place while you hold.
 *
 * So the reading is a frequency, not an average: out of all the hours we have,
 * in how many did the gap sit further than a threshold from its own normal
 * level. That is the question a user actually asks ("how likely is this to come
 * apart on me"), and it survives a distribution that no average describes -- a
 * pair calm for 27 days and violent for 3 reads calm under a median, under a
 * mean, and even under a p75.
 *
 * Absent for a same-protocol route: both legs sit on one book at one price.
 */
export type SpreadRisk = "low" | "medium" | "high" | "unknown";

/** The thresholds behind these words (50 bps from the pair's own normal gap,
 *  5% and 15% of readings, at least 12 readings) live with the measure, in
 *  worker/perpfarm/jobs/spread_risk.py. They are not repeated here: two copies
 *  of a threshold is how the two sides start rating the same pair differently. */
export type SpreadRating = { share: number | null; risk: SpreadRisk };

/** How long a stored rating may be served after the job that wrote it.
 *
 *  The rating describes a week, so a few hours of staleness cannot change it.
 *  A cron that has been dead for a day is a different matter: the badge then
 *  reads "unknown", which is honest, rather than quoting a week that no longer
 *  includes the last one. */
const RATING_MAX_AGE_HOURS = 24;

/**
 * The stored rating for every pair listed on both venues.
 *
 * The measure itself lives in the worker (worker/perpfarm/jobs/spread_risk.py):
 * it is the same answer for every visitor until the next collection, and it
 * used to be re-derived per request from a week of hourly marks -- thousands of
 * rows pulled and aligned to produce one word per pair.
 *
 * Never throws. Migrations are applied by hand on this project, so between a
 * deploy and that command the table does not exist yet -- and a missing risk
 * badge is a far better outcome than a 502 on the whole calculator.
 */
async function loadSpreadRisk(
  slugA: string,
  slugB: string,
  pairs: string[],
): Promise<Map<string, SpreadRating>> {
  if (pairs.length === 0) return new Map();
  try {
    const { rows } = await getPool().query<{
      pair: string;
      breakout_share: string | number | null;
      rating: string;
    }>(
      // Rows are stored once per venue pair, ordered by id, so the lookup has
      // to accept either direction the user asked in.
      `SELECT r.symbol_canonical AS pair, r.breakout_share, r.rating
       FROM pair_spread_risk r
       JOIN venues a ON a.id = r.venue_a_id
       JOIN venues b ON b.id = r.venue_b_id
       WHERE ((a.slug = $1 AND b.slug = $2) OR (a.slug = $2 AND b.slug = $1))
         AND r.symbol_canonical = ANY($3)
         AND r.updated_at >= now() - make_interval(hours => $4)`,
      [slugA, slugB, pairs, RATING_MAX_AGE_HOURS],
    );
    return new Map(
      rows.map((row) => [
        row.pair,
        {
          share: asNumber(row.breakout_share),
          risk: (["low", "medium", "high"].includes(row.rating) ? row.rating : "unknown") as SpreadRisk,
        },
      ]),
    );
  } catch (error) {
    console.error("[cross-cost] spread-risk ratings unavailable, the badge will read unknown --", error);
    return new Map();
  }
}

function round(p: CrossPair): CrossPair {
  return {
    ...p,
    oiAUsd: Math.round(p.oiAUsd),
    oiBUsd: Math.round(p.oiBUsd),
    volume24hMinUsd: Math.round(p.volume24hMinUsd),
    mainVolume24hUsd: Math.round(p.mainVolume24hUsd),
    execCostUsd: Number(p.execCostUsd.toFixed(2)),
    feeCostUsd: Number(p.feeCostUsd.toFixed(2)),
    fundingUsd: p.fundingUsd === null ? null : Number(p.fundingUsd.toFixed(2)),
    cycleCostUsd: Number(p.cycleCostUsd.toFixed(2)),
    costRangeLowUsd: Number(p.costRangeLowUsd.toFixed(2)),
    costRangeHighUsd: Number(p.costRangeHighUsd.toFixed(2)),
    spreadBreakoutShare: p.spreadBreakoutShare === null ? null : Number(p.spreadBreakoutShare.toFixed(4)),
  };
}

/** The schedules a venue's priced markets actually paid, dearest first.
 *
 *  Restricted to the pairs that survived into the answer: a class listed on
 *  the venue but absent from the table would describe a fee nobody in it was
 *  charged. */
function schedulesOf(slug: string, rows: Map<string, VenueMarketRow>, pricedPairs: Set<string>) {
  const seen = new Map<string, { venue: string; makerBps: number; takerBps: number; assetClass: string | null }>();
  for (const row of rows.values()) {
    if (!pricedPairs.has(row.pair)) continue;
    const key = row.asset_class ?? "";
    if (seen.has(key)) continue;
    const byClass = classFees(slug, row.asset_class);
    const published = publishedFees(slug, row.asset_class);
    const makerBps = byClass?.makerBps ?? asNumber(row.maker_bps ?? null) ?? published?.makerBps ?? null;
    const takerBps = byClass?.takerBps ?? asNumber(row.taker_bps ?? null) ?? published?.takerBps ?? null;
    if (makerBps === null || takerBps === null) continue;
    seen.set(key, { venue: slug, makerBps, takerBps, assetClass: assetClassLabel(row.asset_class) });
  }
  return [...seen.values()].sort((a, b) => b.takerBps - a.takerBps);
}

// oiKey is the main venue's OI: a hedge must be liquid, but must never recategorise
// the market that the user chose to farm.
function bandFrom(key: Exclude<CrossBand["key"], "all">, candidates: Array<CrossPair & { oiKey: number }>, limit = 10): CrossBand {
  const ois = candidates.map((c) => c.oiKey);
  const pairs = [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, limit).map(round);
  return { key, oiRangeUsd: [Math.min(...ois), Math.max(...ois)], pairs };
}

export async function computeCrossRankings(
  slugA: string,
  slugB: string,
  accountVolumeUsd: number,
  tradfiOnly = false,
): Promise<CrossRankings> {
  // SEQUENTIAL on purpose. Each instance's pool holds a single connection
  // (see lib/db.ts -- Supabase caps the project's clients), so issuing these
  // three as a Promise.all did not run them in parallel: the first took the
  // connection and the other two sat in the pool's queue until they hit its
  // ten-second wait limit and threw "timeout exceeded when trying to connect",
  // turning the whole comparison into a 502. Awaiting them in turn costs the
  // same total time -- they were serialized regardless -- and none of them can
  // time out waiting for a connection the previous one has already released.
  const rows = await loadVenueMarkets([slugA, slugB]);
  // "average", not "cheapest": on a cross route one venue is crossed on the way
  // IN and crossed back on the way OUT, which are opposite sides of its book,
  // so neither side can be picked. The default is the same-venue rule, where
  // the first passive order does leave the cheaper direction to be crossed --
  // reading the history that way here understated an asymmetric book (10 bps
  // one way against 100 the other) by the whole of the difference.
  const histA = await loadCostHistory(slugA, accountVolumeUsd / 2, "average");
  const histB = await loadCostHistory(slugB, accountVolumeUsd / 2, "average");
  let observations = 0;
  const byVenue = new Map<string, Map<string, VenueMarketRow>>([
    [slugA, new Map()],
    [slugB, new Map()],
  ]);
  for (const r of rows) byVenue.get(r.slug)?.set(r.pair, r);
  const A = byVenue.get(slugA)!;
  const B = byVenue.get(slugB)!;

  // Marks are fetched only for the intersection, and only once it is known --
  // a hedge needs both legs, so a pair on one venue alone can never be rated.
  // Newest book each venue actually supplied, for the freshness line.
  const newestOf = (venue: Map<string, VenueMarketRow>) =>
    [...venue.values()].reduce<string | null>((newest, row) => {
      const ts = asIsoTs(row.book_ts);
      if (ts === null) return newest;
      return newest === null || Date.parse(ts) > Date.parse(newest) ? ts : newest;
    }, null);
  const newestA = newestOf(A);
  const newestB = newestOf(B);
  // The run each venue's legs are judged against for "closed now": the newest
  // one once it has settled, the one before while it is still landing.
  const referenceA = referenceRunMs([...A.values()].map((row) => row.book_ts));
  const referenceB = referenceRunMs([...B.values()].map((row) => row.book_ts));

  const sharedPairs = [...A.keys()].filter((pair) => B.has(pair));
  // A swap route is rated under the swap's own ticker -- the worker pairs the
  // swap with its underlying on the other venue -- and a swap is listed on one
  // venue only, so it is never among the shared tickers.
  const ratedPairs = [...new Set([...sharedPairs, ...[...A.keys(), ...B.keys()].filter(isSwap)])];
  const ratings = await loadSpreadRisk(slugA, slugB, ratedPairs);

  const fillNotionalUsd = accountVolumeUsd / 2;
  const candidates: Array<CrossPair & { oiKey: number }> = [];
  // Per venue, the tickers that were actually priced. Not the row key: a swap
  // route is keyed by the swap, yet its other leg traded the perp ticker.
  const pricedA = new Set<string>();
  const pricedB = new Set<string>();
  // Why pairs get dropped, so a strict filter can never silently empty the list.
  // Only counters that something actually increments. `noFunding` and
  // `wildFunding` outlived the filters they belonged to and reported a
  // permanent 0 -- a diagnostic that always says "nothing was dropped here" is
  // worse than no diagnostic, because it gets believed.
  const drops = { considered: 0, notListedOnBoth: 0, noMarketData: 0, noFeeOrBook: 0, deadMarket: 0, stoppedQuoting: 0 };
  /** Markets on the home venue with no counterpart found on the hedge venue. */
  const unmatched: string[] = [];
  // A swap is another liquidity source for the same pair, not a separate
  // market: Variational's XAUS is XAU. Index the hedge venue's swaps by the pair
  // they stand in for, so a home perp can also be hedged against a swap.
  const swapsOnB = new Map<string, Array<[string, VenueMarketRow]>>();
  for (const [symB, row] of B) {
    const underlying = swapUnderlying(symB);
    if (underlying === null) continue;
    swapsOnB.set(underlying, [...(swapsOnB.get(underlying) ?? []), [symB, row]]);
  }
  for (const [symA, ra] of A) {
    // The home protocol is the thing being farmed. A hedge leg must be
    // tradeable, but it never changes the home market's category or OI band.
    if (tradfiOnly && !isTradfiMarket(symA)) continue;
    // Counted BEFORE the intersection. This used to be counted after, which
    // made `considered` the size of the already-matched set and hid the
    // largest silent loss of all: the two venues spell some instruments
    // differently (Variational "SKHY" vs TxFlow "SKHYNIX"), so the same
    // company never matches and simply vanishes from the comparison.
    drops.considered++;
    // Every way this home market can be hedged on the other venue: the same
    // ticker; the underlying pair when the home market is itself a swap; and
    // any swap the hedge venue lists on this pair. Each becomes its own row,
    // so the perp route and the swap route on one pair can be compared.
    const hedges: Array<[string, VenueMarketRow]> = [];
    const direct = B.get(symA);
    if (direct) hedges.push([symA, direct]);
    const homeUnderlying = swapUnderlying(symA);
    const viaUnderlying = homeUnderlying === null ? undefined : B.get(homeUnderlying);
    if (homeUnderlying !== null && viaUnderlying) hedges.push([homeUnderlying, viaUnderlying]);
    for (const hedge of swapsOnB.get(symA) ?? []) hedges.push(hedge);
    if (hedges.length === 0) {
      drops.notListedOnBoth++;
      if (unmatched.length < 40) unmatched.push(symA);
      continue;
    }
    for (const [symB, rb] of hedges) {
    // A row is keyed by the swap whenever one leg is a swap, so it cannot
    // collide with the perp route on the same pair and still reads as a swap.
    const sym = isSwap(symB) ? symB : symA;
    const volA = asNumber(ra.volume_24h_usd);
    const volB = asNumber(rb.volume_24h_usd);
    const oiA = asNumber(ra.open_interest_usd);
    const oiB = asNumber(rb.open_interest_usd);
    const costA = venueBps(ra, fillNotionalUsd);
    const costB = venueBps(rb, fillNotionalUsd);
    if (volA === null || volB === null || oiA === null || oiB === null) { drops.noMarketData++; continue; }
    if (costA === null || costB === null) { drops.noFeeOrBook++; continue; }
    // Both legs are held to the same single rule: only a DEAD listing -- near-
    // zero volume AND near-zero open interest -- is dropped. There are no
    // per-protocol floors any more; a thin leg is priced, not hidden. The main
    // venue alone decides the displayed OI band below.
    const displayedOiA = displayedOpenInterestUsd(oiA, slugA);
    const displayedOiB = displayedOpenInterestUsd(oiB, slugB);
    if (isDeadMarket(volA, displayedOiA) || isDeadMarket(volB, displayedOiB)) { drops.deadMarket++; continue; }
    // A leg that missed its venue's latest run is shut for now -- a swap's
    // daily break -- and stays in the table marked closed, priced from its last
    // quoted hour. A leg that has missed a day of runs is not on a break.
    const lagA = quoteLagMs(ra.book_ts, referenceA);
    const lagB = quoteLagMs(rb.book_ts, referenceB);
    if (lagA > QUOTE_GONE_AFTER_MS || lagB > QUOTE_GONE_AFTER_MS) { drops.stoppedQuoting++; continue; }
    const closedVenues = [
      ...(lagA > QUOTE_CLOSED_AFTER_MS ? [slugA] : []),
      ...(lagB > QUOTE_CLOSED_AFTER_MS ? [slugB] : []),
    ];

    // Which venue should rest the LIMIT orders? Try both assignments and keep
    // the cheaper: passive on the venue whose maker fee beats what its taker
    // side (fee + half-spread + impact) would have cost.
    const restOnA = costA.maker + costB.taker;
    const restOnB = costB.maker + costA.taker;
    // This is the assignment of the LATEST books, and it prices execCostUsd
    // below -- the live figure. The orders the route DISPLAYS come from the
    // observation the headline was taken from instead, further down.
    const [, , makerSide, takerSide] =
      restOnA <= restOnB ? [slugA, slugB, costA, costB] : [slugB, slugA, costB, costA];

    // Each venue turns over `accountVolumeUsd` across its open and close.
    const execCostUsd = (accountVolumeUsd * (makerSide.maker + takerSide.taker)) / 10_000;

    // Funding is displayed separately. It must never exclude an otherwise
    // executable pair now that route ranking uses execution cost only.
    const fA = asNumber(ra.funding);
    const fB = asNumber(rb.funding);

    // WHICH LEG IS LONG is a free choice, so it is made rather than inherited.
    //
    // The position is delta-neutral either way, and the maker-side decision
    // above does not depend on it: execution cost is identical in both
    // directions. Only funding differs -- longs pay the funding rate, shorts
    // receive it -- so longing the venue with the LOWER rate turns funding into
    // a credit instead of a charge.
    //
    // Previously the page you happened to open decided it: the requested
    // protocol was always the long leg. The same pair therefore read +$5.58 on
    // one protocol's page and -$5.59 on the other's -- the identical trade,
    // shown as a gain or a loss depending on where you clicked.
    const rateA = fA ?? 0;
    const rateB = fB ?? 0;
    // Equal rates (both unknown, or genuinely level) used to make the page's
    // own protocol the long every time, so one trade printed opposite
    // directions depending on which page asked. A tie goes to a fixed order.
    const longFirst = rateA < rateB || (rateA === rateB && slugA < slugB);
    const longVenue = longFirst ? slugA : slugB;
    const shortVenue = longFirst ? slugB : slugA;
    const fundingUsd = fA === null || fB === null
      ? null
      : (fillNotionalUsd * (Math.min(fA, fB) - Math.max(fA, fB)) * FUNDING_HOLD_HOURS) / HOURS_PER_YEAR;
    // Funding is informative, not part of the execution-cost ranking: it can
    // move either way during the hold and is shown separately in the UI.
    //
    // The 24h band prices the WHOLE ROUTE at each hourly tick and takes
    // percentiles of that, rather than of either leg on its own: the cost is a
    // joint property of both books at the same moment, and the maker side can
    // change between ticks. Both series come from the same cron, so index i is
    // the same tick on both venues.
    // Each observation carries its own parts, so the breakdown shown under a
    // route is the SAME observation as its headline. Taking the parts from the
    // newest snapshot while the headline came from the median made them
    // disagree: XRP read spread $4.41 + slippage $0.23 + fees $2.85 = $7.49
    // under a headline of $5.28, because its book had just widened.
    //
    // The ASSIGNMENT travels with the observation, and the two venues' series
    // are lined up BY TIME. Both rules live in lib/route-samples.ts, where they
    // can be tested: this function reads Postgres through Next's request cache
    // and cannot run outside a request, which is how both defects survived.
    const bookOf = (cost: typeof costA, at: string | Date): TakerBook & { ts: string | null } => ({
      // `taker` carries the fee; the book alone is what a route sample prices.
      legBps: cost.taker - cost.takerFee,
      spreadBps: cost.spreadBps * 2,
      impactBps: cost.impactBps,
      ts: asIsoTs(at),
    });
    const latest: RouteSample = cheaperAssignment({
      accountVolumeUsd,
      venueA: slugA,
      costA,
      bookA: bookOf(costA, ra.book_ts),
      venueB: slugB,
      costB,
      bookB: bookOf(costB, rb.book_ts),
      // The NEWER of the two reads, compared as instants: sorting Dates as
      // strings would order them by weekday name.
      ts: [asIsoTs(ra.book_ts), asIsoTs(rb.book_ts)]
        .filter((value): value is string => value !== null)
        .sort((left, right) => Date.parse(left) - Date.parse(right))
        .at(-1) ?? null,
    });

    // Each leg's own history: a swap leg and a perp leg are different tickers.
    const historyA = histA.get(symA) ?? [];
    const historyB = histB.get(symB) ?? [];
    const routeSamples: RouteSample[] = matchByTick(historyA, historyB, TICK_MATCH_TOLERANCE_MS).map(
      ({ a, b }) => cheaperAssignment({
        accountVolumeUsd,
        venueA: slugA,
        costA,
        bookA: a,
        venueB: slugB,
        costB,
        bookB: b,
        // The older of the two readings, so a route never claims to be fresher
        // than the leg that has not been quoted since.
        ts: [a.ts, b.ts].filter((value): value is string => value !== null).sort().at(0) ?? null,
      }),
    );
    const sorted = [...routeSamples].sort((left, right) => left.totalUsd - right.totalUsd);
    // Nearest-rank, so the parts belong to a real observation and still add up.
    const at = (q: number): RouteSample =>
      sorted.length === 0 ? latest : sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q))]!;
    const median = at(0.5);
    const cycleCostUsd = median.totalUsd;
    const costRangeLowUsd = at(0.25).totalUsd;
    const costRangeHighUsd = at(0.75).totalUsd;
    const spreadCostUsd = median.spreadUsd;
    const slippageCostUsd = median.slippageUsd;
    const feeCostUsd = median.feeUsd;
    // Only ticks that MATCHED on both venues count. Reporting the longer of
    // the two series described observations that were never made jointly.
    observations = Math.max(observations, sorted.length);

    // Ratings are stored under the row's own key: the shared ticker, or the
    // swap's ticker for a swap leg against its underlying (the worker rates
    // that pairing itself). A swap route therefore never borrows the rating of
    // the perp route on the same pair.
    const rating = ratings.get(sym);

    pricedA.add(symA);
    pricedB.add(symB);
    candidates.push({
      tickers: { [slugA]: venueTicker(ra.symbol), [slugB]: venueTicker(rb.symbol) },
      closedVenues,
      pair: sym,
      // The farmed venue's class first; the hedge venue answers only when the
      // farmed one publishes nothing. One instrument must not change class
      // depending on which side of the route the reader started from.
      assetClass: instrumentClass(sym, ra.asset_class ?? rb.asset_class),
      spreadBreakoutShare: rating?.share ?? null,
      spreadRisk: rating?.risk ?? "unknown",
      // From the SAME observation as cycleCostUsd and the breakdown above it,
      // so the order types a reader sees are the ones those dollars were
      // priced on.
      makerVenue: median.makerVenue,
      takerVenue: median.takerVenue,
      spreadCostUsd,
      slippageCostUsd,
      oiAUsd: displayedOiA,
      oiBUsd: displayedOiB,
      mainOiUsd: displayedOiA,
      volume24hMinUsd: Math.min(volA, volB),
      mainVolume24hUsd: volA,
      longVenue,
      shortVenue,
      execCostUsd,
      feeCostUsd,
      fundingUsd,
      cycleCostUsd,
      costRangeLowUsd,
      costRangeHighUsd,
      oiKey: displayedOiA,
    });
    }
  }

  // Bands always come from the main (farm) protocol -- both the OI value and
  // the thresholds. What the hedge venue considers a big market is irrelevant
  // to which band the market the user is farming belongs in.
  const MAIN_OI_BANDS = oiBandsFor(slugA);
  const bands = [
    bandFrom("high", candidates.filter((p) => p.oiKey > MAIN_OI_BANDS.high)),
    bandFrom("medium", candidates.filter((p) => p.oiKey >= MAIN_OI_BANDS.medium && p.oiKey <= MAIN_OI_BANDS.high)),
    // Everything under Medium is Low: the bands sort the table, they no longer
    // cut markets out of it.
    bandFrom("low", candidates.filter((p) => p.oiKey < MAIN_OI_BANDS.medium)),
  ].filter((band) => band.pairs.length > 0);

  return {
    drops,
    unmatched,
    venueA: slugA,
    venueB: slugB,
    accountVolumeUsd,
    fillNotionalUsd,
    totalCycleVolumeUsd: accountVolumeUsd * 2,
    holdHours: FUNDING_HOLD_HOURS,
    deadMarketVolumeUsd: DEAD_MARKET_VOLUME_USD,
    deadMarketOiUsd: DEAD_MARKET_OI_USD,
    // Same rule as the same-protocol table: with only a few shared markets the
    // bands are noise -- entropy x qfex shares ONE pair, and splitting it into
    // three tabs offers two that can never fill.
    grouped: candidates.length >= MIN_PAIRS_FOR_BANDS,
    costBasis: observations > 1 ? "24h-median" : "latest-snapshot",
    sources: [
      { venue: slugA, live: snapshotsAreFresh(newestA) },
      { venue: slugB, live: snapshotsAreFresh(newestB) },
    ],
    asOf: [newestA, newestB]
      .filter((ts): ts is string => ts !== null)
      .sort((left, right) => Date.parse(left) - Date.parse(right))
      .at(-1) ?? null,
    bands,
    pairs: [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).map(round),
    feeSchedule: [
      ...schedulesOf(slugA, A, pricedA),
      ...schedulesOf(slugB, B, pricedB),
    ],
  };
}

/*
 * `selfMatchCheapest` and `cheapestPartner` used to live here. They were dead
 * code: the hourly worker (worker/perpfarm/jobs/hedge_recommendations.py) is
 * the only thing that picks a hedge partner now. Keeping a second, drifting
 * implementation that enumerated every venue in the database with no readiness
 * filter is precisely how a fixture venue became a published recommendation.
 */
