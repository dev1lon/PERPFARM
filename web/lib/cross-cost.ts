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
import { quoteCurveImpactBps } from "@/lib/quote-curve";
import { isTradfiMarket } from "@/lib/tradfi";
import { publishedFees } from "@/lib/venue-fees";

/** Funding is displayed separately for a fixed 12-hour hold. */
const FUNDING_HOLD_HOURS = 12;
const MIN_VOLUME_USD = 1_000; // dead-pair floor, applied to BOTH venues
/** Low-OI routes begin at $10k gross OI. Below it no route is recommended. */
const MIN_OPEN_INTEREST_USD = 10_000;
const HOURS_PER_YEAR = 8_760;
const MAIN_OI_BANDS = {
  high: 300_000,
  medium: 100_000,
  low: 10_000,
} as const;
/** A 24-hour average beyond 500% a year means the market is dislocated (or the
 *  feed is wrong). Either way it is not a route worth recommending, and a
 *  single bad rate must never win the "cheapest" sort. */
const MAX_ABS_FUNDING_ANNUALIZED = 5;

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
  fundingUsd: number;
  cycleCostUsd: number;
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
       -- The 12-hour estimate uses the latest 24 hours of funding readings.
       SELECT f.market_id, AVG(f.funding_rate_annualized) AS funding
       FROM funding_snapshots f
       JOIN markets m ON m.id = f.market_id
       JOIN v ON v.id = m.venue_id
       WHERE f.ts >= now() - interval '24 hours'
       GROUP BY f.market_id
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
    fundingUsd: Number(p.fundingUsd.toFixed(2)),
    cycleCostUsd: Number(p.cycleCostUsd.toFixed(2)),
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
  const rows = await loadVenueMarkets([slugA, slugB]);
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
  const drops = { considered: 0, noMarketData: 0, noFeeOrBook: 0, thinVolume: 0, thinOi: 0, noFunding: 0, wildFunding: 0 };
  for (const [sym, ra] of A) {
    // The home protocol is the thing being farmed. A hedge leg must be
    // tradeable, but it never changes the home market's category or OI band.
    if (tradfiOnly && !isTradfiMarket(slugA, sym)) continue;
    const rb = B.get(sym); // only pairs listed on BOTH venues can be hedged
    if (!rb) continue;
    const volA = asNumber(ra.volume_24h_usd);
    const volB = asNumber(rb.volume_24h_usd);
    const oiA = asNumber(ra.open_interest_usd);
    const oiB = asNumber(rb.open_interest_usd);
    const costA = venueBps(ra, fillNotionalUsd);
    const costB = venueBps(rb, fillNotionalUsd);
    drops.considered++;
    if (volA === null || volB === null || oiA === null || oiB === null) { drops.noMarketData++; continue; }
    if (costA === null || costB === null) { drops.noFeeOrBook++; continue; }
    if (volA < MIN_VOLUME_USD || volB < MIN_VOLUME_USD) { drops.thinVolume++; continue; }
    // Both books must at least be real markets. The main venue alone decides
    // the displayed OI band and the recommendation category below.
    if (oiA * 2 < MIN_OPEN_INTEREST_USD || oiB * 2 < MIN_OPEN_INTEREST_USD) { drops.thinOi++; continue; }

    // Which venue should rest the LIMIT orders? Try both assignments and keep
    // the cheaper: passive on the venue whose maker fee beats what its taker
    // side (fee + half-spread + impact) would have cost.
    const restOnA = costA.maker + costB.taker;
    const restOnB = costB.maker + costA.taker;
    const [makerVenue, takerVenue, makerSide, takerSide] =
      restOnA <= restOnB ? [slugA, slugB, costA, costB] : [slugB, slugA, costB, costA];

    // Each venue turns over `accountVolumeUsd` across its open and close.
    const execCostUsd = (accountVolumeUsd * (makerSide.maker + takerSide.taker)) / 10_000;
    const feeCostUsd = (accountVolumeUsd * (makerSide.makerFee + takerSide.takerFee)) / 10_000;
    const spreadCostUsd = (accountVolumeUsd * takerSide.spreadBps) / 10_000;
    const slippageCostUsd = (accountVolumeUsd * takerSide.impactBps) / 10_000;

    // Funding is the whole point of a cross route, so an unknown or absurd
    // rate disqualifies the pair instead of silently scoring as zero income.
    const fA = asNumber(ra.funding);
    const fB = asNumber(rb.funding);
    if (fA === null || fB === null) { drops.noFunding++; continue; }
    if (Math.abs(fA) > MAX_ABS_FUNDING_ANNUALIZED || Math.abs(fB) > MAX_ABS_FUNDING_ANNUALIZED) { drops.wildFunding++; continue; }
    // The requested protocol is always the main leg: long it, short the hedge.
    // That leaves funding visibly positive or negative instead of choosing a
    // direction just because it makes funding look favourable.
    const longVenue = slugA;
    const shortVenue = slugB;
    const fundingUsd = (fillNotionalUsd * (fA - fB) * FUNDING_HOLD_HOURS) / HOURS_PER_YEAR;
    // Funding is informative, not part of the execution-cost ranking: it can
    // move either way during the hold and is shown separately in the UI.
    const cycleCostUsd = execCostUsd;

    candidates.push({
      pair: sym,
      makerVenue,
      takerVenue,
      spreadCostUsd,
      slippageCostUsd,
      oiAUsd: oiA * 2,
      oiBUsd: oiB * 2,
      mainOiUsd: oiA * 2,
      volume24hMinUsd: Math.min(volA, volB),
      longVenue,
      shortVenue,
      execCostUsd,
      feeCostUsd,
      fundingUsd,
      cycleCostUsd,
      oiKey: oiA * 2,
    });
  }

  // OI bands always use the main (farm) venue, never the hedge venue.
  // Below $10k gross OI is deliberately not recommended.
  const bands = [
    bandFrom("high", candidates.filter((p) => p.oiKey > MAIN_OI_BANDS.high)),
    bandFrom("medium", candidates.filter((p) => p.oiKey >= MAIN_OI_BANDS.medium && p.oiKey <= MAIN_OI_BANDS.high)),
    bandFrom("low", candidates.filter((p) => p.oiKey >= MAIN_OI_BANDS.low && p.oiKey < MAIN_OI_BANDS.medium)),
  ].filter((band) => band.pairs.length > 0);

  return {
    drops,
    venueA: slugA,
    venueB: slugB,
    accountVolumeUsd,
    fillNotionalUsd,
    totalCycleVolumeUsd: accountVolumeUsd * 2,
    holdHours: FUNDING_HOLD_HOURS,
    minVolumeUsd: MIN_VOLUME_USD,
    grouped: true,
    bands,
  };
}

/**
 * Cheapest same-venue (self-match) pair for `slug`: two accounts on the same
 * book. Two market legs (the two limit legs are free), funding nets to zero at
 * equal long/short size. Usually THE cheapest hedge, so it's a candidate in
 * cheapestPartner below.
 */
export async function selfMatchCheapest(slug: string, accountVolumeUsd: number): Promise<number | null> {
  const rows = await loadVenueMarkets([slug]);
  const fillNotionalUsd = accountVolumeUsd / 2;
  let cheapest: number | null = null;
  for (const r of rows) {
    const vol = asNumber(r.volume_24h_usd);
    const oi = asNumber(r.open_interest_usd);
    const side = venueBps(r, fillNotionalUsd, "cheapest");
    if (vol === null || oi === null || side === null || vol < MIN_VOLUME_USD) continue;
    if (oi * 2 < MIN_OPEN_INTEREST_USD) continue;
    // Two market legs pay; the two resting limit legs pay the maker fee.
    const cost = (accountVolumeUsd * (side.taker + side.maker)) / 10_000;
    if (!Number.isFinite(cost)) continue;
    if (cheapest === null || cost < cheapest) cheapest = cost;
  }
  return cheapest;
}

/**
 * Cheapest hedge partner for `slug`, INCLUDING self-match: compares the
 * same-venue route against every other venue that has snapshot data, and
 * returns whichever is cheapest overall (often the venue itself). Powers the
 * "cheapest hedge" window, which shows only the partner protocol name.
 * Reference volume, since the window has no volume input.
 */
export async function cheapestPartner(
  slug: string,
  referenceVolumeUsd: number,
): Promise<{ partnerSlug: string; cycleCostUsd: number } | null> {
  let best: { partnerSlug: string; cycleCostUsd: number } | null = null;

  // Self-match candidate (usually the cheapest -- no cross fees, limit legs).
  const selfCost = await selfMatchCheapest(slug, referenceVolumeUsd);
  if (selfCost !== null) best = { partnerSlug: slug, cycleCostUsd: selfCost };

  const { rows } = await getPool().query<{ slug: string }>(
    `SELECT DISTINCT v.slug
     FROM venues v
     JOIN markets m ON m.venue_id = v.id
     JOIN book_snapshots b ON b.market_id = m.id
     WHERE v.slug <> $1 AND b.ts >= now() - interval '2 days'`,
    [slug],
  );
  for (const { slug: partner } of rows) {
    const ranking = await computeCrossRankings(slug, partner, referenceVolumeUsd);
    const cheapest = ranking.bands
      .flatMap((band) => band.pairs)
      .filter((p) => Number.isFinite(p.cycleCostUsd))
      .reduce<number | null>((min, p) => (min === null || p.cycleCostUsd < min ? p.cycleCostUsd : min), null);
    if (cheapest !== null && (best === null || cheapest < best.cycleCostUsd)) {
      best = { partnerSlug: partner, cycleCostUsd: cheapest };
    }
  }
  return best;
}
