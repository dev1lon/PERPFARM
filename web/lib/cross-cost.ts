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
import { loadCostHistory, type CostSample } from "@/lib/cost-history";
import { quoteCurveImpactBps } from "@/lib/quote-curve";
import {
  FUNDING_HOLD_HOURS,
  HOURS_PER_YEAR,
  MIN_VOLUME_USD,
  OI_BANDS,
  displayedOpenInterestUsd,
  minOpenInterestUsd,
  oiBandsFor,
} from "@/lib/route-model";
import { isTradfiMarket } from "@/lib/tradfi";
import { publishedFees } from "@/lib/venue-fees";

type VenueMarketRow = {
  slug: string;
  pair: string;
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
};

export type CrossPair = {
  pair: string;
  oiAUsd: number;
  oiBUsd: number;
  /** Gross OI of the protocol the user started the calculator on. */
  mainOiUsd: number;
  volume24hMinUsd: number;
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
  /** Cost from the newest tick alone, and the 24h p25-p75 band. */
  latestCycleCostUsd: number;
  costRangeLowUsd: number;
  costRangeHighUsd: number;
};

export type CrossBand = { key: "high" | "medium" | "low" | "all"; oiRangeUsd: [number, number]; pairs: CrossPair[] };

export type CrossRankings = {
  venueA: string;
  venueB: string;
  accountVolumeUsd: number;
  fillNotionalUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  minVolumeUsd: number;
  grouped: boolean;
  bands: CrossBand[];
  /** Why pairs were excluded, so an empty result explains itself. */
  drops: Record<string, number>;
  /** Home-venue tickers with no counterpart on the hedge venue, for diagnosis
   *  of naming mismatches (the same instrument listed under two symbols). */
  unmatched: string[];
  /** What the headline number is, same vocabulary as the other calculators. */
  costBasis: "24h-median" | "latest-snapshot";
};

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Piecewise-linear impact at an arbitrary notional from the published buckets
// (0 at size 0; missing buckets skipped; past the last anchor clamps to it).
function impactAtNotional(notional: number, anchors: Array<[number, number | null]>): number | null {
  const points: Array<[number, number]> = [[0, 0]];
  for (const [x, y] of anchors) if (y !== null) points.push([x, y]);
  if (points.length < 2) return null;
  points.sort((a, b) => a[0] - b[0]);
  if (notional <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (notional <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (notional - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
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
  const impact = quoteCurveImpactBps(row.quote_curve_json, fillNotionalUsd, impactMode) ?? impactAtNotional(fillNotionalUsd, [
    [10_000, asNumber(row.impact_bps_10k)],
    [50_000, asNumber(row.impact_bps_50k)],
    [100_000, asNumber(row.impact_bps_100k)],
  ]);
  // A stored schedule wins; otherwise fall back to the venue's published one.
  // Only a venue we have neither for is treated as unknown.
  const published = publishedFees(row.slug);
  const takerFee = asNumber(row.taker_bps) ?? published?.takerBps ?? null;
  const makerFee = asNumber(row.maker_bps) ?? published?.makerBps ?? null;
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
  const { rows } = await getPool().query<VenueMarketRow>(
    `WITH v AS (SELECT id, slug FROM venues WHERE slug = ANY($1)),
     book AS (
       SELECT DISTINCT ON (b.market_id)
         b.market_id, b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k,
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
     SELECT v.slug, m.symbol_canonical AS pair,
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
  );
  return rows;
}

function round(p: CrossPair): CrossPair {
  return {
    ...p,
    oiAUsd: Math.round(p.oiAUsd),
    oiBUsd: Math.round(p.oiBUsd),
    volume24hMinUsd: Math.round(p.volume24hMinUsd),
    execCostUsd: Number(p.execCostUsd.toFixed(2)),
    feeCostUsd: Number(p.feeCostUsd.toFixed(2)),
    fundingUsd: p.fundingUsd === null ? null : Number(p.fundingUsd.toFixed(2)),
    cycleCostUsd: Number(p.cycleCostUsd.toFixed(2)),
    latestCycleCostUsd: Number(p.latestCycleCostUsd.toFixed(2)),
    costRangeLowUsd: Number(p.costRangeLowUsd.toFixed(2)),
    costRangeHighUsd: Number(p.costRangeHighUsd.toFixed(2)),
  };
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
  const [rows, histA, histB] = await Promise.all([
    loadVenueMarkets([slugA, slugB]),
    loadCostHistory(slugA, accountVolumeUsd / 2),
    loadCostHistory(slugB, accountVolumeUsd / 2),
  ]);
  let observations = 0;
  const byVenue = new Map<string, Map<string, VenueMarketRow>>([
    [slugA, new Map()],
    [slugB, new Map()],
  ]);
  for (const r of rows) byVenue.get(r.slug)?.set(r.pair, r);
  const A = byVenue.get(slugA)!;
  const B = byVenue.get(slugB)!;

  const fillNotionalUsd = accountVolumeUsd / 2;
  const candidates: Array<CrossPair & { oiKey: number }> = [];
  // Why pairs get dropped, so a strict filter can never silently empty the list.
  // Only counters that something actually increments. `noFunding` and
  // `wildFunding` outlived the filters they belonged to and reported a
  // permanent 0 -- a diagnostic that always says "nothing was dropped here" is
  // worse than no diagnostic, because it gets believed.
  const drops = { considered: 0, notListedOnBoth: 0, noMarketData: 0, noFeeOrBook: 0, thinVolume: 0, thinOi: 0 };
  /** Markets on the home venue with no counterpart found on the hedge venue. */
  const unmatched: string[] = [];
  for (const [sym, ra] of A) {
    // The home protocol is the thing being farmed. A hedge leg must be
    // tradeable, but it never changes the home market's category or OI band.
    if (tradfiOnly && !isTradfiMarket(sym)) continue;
    // Counted BEFORE the intersection. This used to be counted after, which
    // made `considered` the size of the already-matched set and hid the
    // largest silent loss of all: the two venues spell some instruments
    // differently (Variational "SKHY" vs TxFlow "SKHYNIX"), so the same
    // company never matches and simply vanishes from the comparison.
    drops.considered++;
    const rb = B.get(sym); // only pairs listed on BOTH venues can be hedged
    if (!rb) {
      drops.notListedOnBoth++;
      if (unmatched.length < 40) unmatched.push(sym);
      continue;
    }
    const volA = asNumber(ra.volume_24h_usd);
    const volB = asNumber(rb.volume_24h_usd);
    const oiA = asNumber(ra.open_interest_usd);
    const oiB = asNumber(rb.open_interest_usd);
    const costA = venueBps(ra, fillNotionalUsd);
    const costB = venueBps(rb, fillNotionalUsd);
    if (volA === null || volB === null || oiA === null || oiB === null) { drops.noMarketData++; continue; }
    if (costA === null || costB === null) { drops.noFeeOrBook++; continue; }
    if (volA < MIN_VOLUME_USD || volB < MIN_VOLUME_USD) { drops.thinVolume++; continue; }
    // Both books must at least be real markets. The main venue alone decides
    // the displayed OI band and the recommendation category below.
    // The main leg is held to its own protocol's floor, because that is the
    // market being farmed. The hedge only has to be a real market, so it is
    // held to the absolute floor -- a deep hedge venue's higher cutoff must
    // not delete a perfectly good market on the venue the user chose.
    const displayedOiA = displayedOpenInterestUsd(oiA, slugA);
    const displayedOiB = displayedOpenInterestUsd(oiB, slugB);
    if (displayedOiA < minOpenInterestUsd(slugA) || displayedOiB < OI_BANDS.low) { drops.thinOi++; continue; }

    // Which venue should rest the LIMIT orders? Try both assignments and keep
    // the cheaper: passive on the venue whose maker fee beats what its taker
    // side (fee + half-spread + impact) would have cost.
    const restOnA = costA.maker + costB.taker;
    const restOnB = costB.maker + costA.taker;
    const [makerVenue, takerVenue, makerSide, takerSide] =
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
    const longFirst = rateA <= rateB;
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
    type RouteSample = { totalUsd: number; spreadUsd: number; slippageUsd: number; feeUsd: number };
    const usd = (bps: number) => (accountVolumeUsd * bps) / 10_000;
    const routeOf = (maker: typeof costA, taker: typeof costB, takerBook: CostSample): RouteSample => {
      const feeBps = maker.makerFee + taker.takerFee;
      return {
        totalUsd: usd(feeBps + takerBook.legBps),
        spreadUsd: usd(takerBook.spreadBps / 2),
        slippageUsd: usd(takerBook.impactBps),
        feeUsd: usd(feeBps),
      };
    };
    const latest: RouteSample = restOnA <= restOnB
      ? routeOf(costA, costB, { legBps: costB.taker - costB.takerFee, spreadBps: costB.spreadBps * 2, impactBps: costB.impactBps })
      : routeOf(costB, costA, { legBps: costA.taker - costA.takerFee, spreadBps: costA.spreadBps * 2, impactBps: costA.impactBps });

    const historyA = histA.get(sym) ?? [];
    const historyB = histB.get(sym) ?? [];
    const routeSamples: RouteSample[] = [];
    for (let i = 0; i < Math.min(historyA.length, historyB.length); i++) {
      const a = historyA[i]!;
      const b = historyB[i]!;
      // The maker side is re-decided at every tick: which venue is cheaper to
      // rest on can change as the two books move against each other.
      const onA = routeOf(costA, costB, b);
      const onB = routeOf(costB, costA, a);
      routeSamples.push(onA.totalUsd <= onB.totalUsd ? onA : onB);
    }
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
    observations = Math.max(observations, sorted.length);

    candidates.push({
      pair: sym,
      makerVenue,
      takerVenue,
      spreadCostUsd,
      slippageCostUsd,
      oiAUsd: displayedOiA,
      oiBUsd: displayedOiB,
      mainOiUsd: displayedOiA,
      volume24hMinUsd: Math.min(volA, volB),
      longVenue,
      shortVenue,
      execCostUsd,
      feeCostUsd,
      fundingUsd,
      cycleCostUsd,
      latestCycleCostUsd: execCostUsd,
      costRangeLowUsd,
      costRangeHighUsd,
      oiKey: displayedOiA,
    });
  }

  // Bands always come from the main (farm) protocol -- both the OI value and
  // the thresholds. What the hedge venue considers a big market is irrelevant
  // to which band the market the user is farming belongs in.
  const MAIN_OI_BANDS = oiBandsFor(slugA);
  const bands = [
    bandFrom("high", candidates.filter((p) => p.oiKey > MAIN_OI_BANDS.high)),
    bandFrom("medium", candidates.filter((p) => p.oiKey >= MAIN_OI_BANDS.medium && p.oiKey <= MAIN_OI_BANDS.high)),
    bandFrom("low", candidates.filter((p) => p.oiKey >= MAIN_OI_BANDS.low && p.oiKey < MAIN_OI_BANDS.medium)),
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
    minVolumeUsd: MIN_VOLUME_USD,
    grouped: true,
    costBasis: observations > 1 ? "24h-median" : "latest-snapshot",
    bands,
  };
}

/*
 * `selfMatchCheapest` and `cheapestPartner` used to live here. They were dead
 * code: the hourly worker (worker/perpfarm/jobs/hedge_recommendations.py) is
 * the only thing that picks a hedge partner now. Keeping a second, drifting
 * implementation that enumerated every venue in the database with no readiness
 * filter is precisely how a fixture venue became a published recommendation.
 */
