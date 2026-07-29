/**
 * Live cross-protocol execution cost, computed on demand from the latest
 * hourly snapshots of TWO venues. Mirrors the same-protocol pair Run (P6) but:
 *  - each leg crosses its OWN venue's book + pays its OWN fees (no self-match,
 *    so all four fills are taker);
 *  - funding does NOT net to zero -- it's the delta between the two venues'
 *    rates, and can be income. We pick the favourable direction (long the
 *    lower-funding venue, short the higher).
 * Point value is never involved -- that's the user's manual number.
 */

import { getPool } from "@/lib/db";
import { quoteCurveImpactBps } from "@/lib/quote-curve";

const HOLD_HOURS = 24;
const MIN_VOLUME_USD = 1_000; // dead-pair floor, applied to BOTH venues
const MIN_PAIRS_FOR_BANDS = 15;
const HOURS_PER_YEAR = 8_760;

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
};

export type CrossPair = {
  pair: string;
  oiAUsd: number;
  oiBUsd: number;
  volume24hMinUsd: number;
  longVenue: string;
  shortVenue: string;
  execCostUsd: number;
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

// One market leg's cost in bps on its venue: taker fee + half-spread + impact.
function legBps(
  row: VenueMarketRow,
  fillNotionalUsd: number,
  impactMode: "average" | "cheapest" = "average",
): number | null {
  const spread = asNumber(row.spread_bps);
  const impact = quoteCurveImpactBps(row.quote_curve_json, fillNotionalUsd, impactMode) ?? impactAtNotional(fillNotionalUsd, [
    [10_000, asNumber(row.impact_bps_10k)],
    [50_000, asNumber(row.impact_bps_50k)],
    [100_000, asNumber(row.impact_bps_100k)],
  ]);
  if (spread === null || impact === null) return null;
  const fee = asNumber(row.taker_bps) ?? 0;
  return fee + spread / 2 + impact;
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
       SELECT f.market_id, AVG(f.funding_rate_annualized) AS funding
       FROM funding_snapshots f
       JOIN markets m ON m.id = f.market_id
       JOIN v ON v.id = m.venue_id
       WHERE f.ts >= now() - interval '7 days'
       GROUP BY f.market_id
     ),
     fee AS (
       SELECT DISTINCT ON (venue_id) venue_id, taker_bps
       FROM fee_schedules
       WHERE effective_from <= CURRENT_DATE AND venue_id IN (SELECT id FROM v)
       ORDER BY venue_id, effective_from DESC, created_at DESC
     )
     SELECT v.slug, m.symbol_canonical AS pair,
            book.spread_bps, book.impact_bps_10k, book.impact_bps_50k, book.impact_bps_100k, book.quote_curve_json,
            vol.volume_24h_usd, vol.open_interest_usd, fund.funding, fee.taker_bps
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
    fundingUsd: Number(p.fundingUsd.toFixed(2)),
    cycleCostUsd: Number(p.cycleCostUsd.toFixed(2)),
  };
}

// oiKey = min OI of the two venues (the bottleneck: how much can actually be run).
function bandFrom(key: CrossBand["key"], candidates: Array<CrossPair & { oiKey: number }>, limit: number): CrossBand {
  const ois = candidates.map((c) => c.oiKey);
  const pairs = [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, limit).map(round);
  return { key, oiRangeUsd: [Math.min(...ois), Math.max(...ois)], pairs };
}

export async function computeCrossRankings(
  slugA: string,
  slugB: string,
  accountVolumeUsd: number,
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
  for (const [sym, ra] of A) {
    const rb = B.get(sym); // only pairs listed on BOTH venues can be hedged
    if (!rb) continue;
    const volA = asNumber(ra.volume_24h_usd);
    const volB = asNumber(rb.volume_24h_usd);
    const oiA = asNumber(ra.open_interest_usd);
    const oiB = asNumber(rb.open_interest_usd);
    const bpsA = legBps(ra, fillNotionalUsd);
    const bpsB = legBps(rb, fillNotionalUsd);
    if (volA === null || volB === null || oiA === null || oiB === null || bpsA === null || bpsB === null) continue;
    if (oiA <= 0 || oiB <= 0 || volA < MIN_VOLUME_USD || volB < MIN_VOLUME_USD) continue;

    // Four taker fills (open+close on each venue); 2*fill = accountVolume per venue.
    const execCostUsd = (accountVolumeUsd * (bpsA + bpsB)) / 10_000;
    // Long the lower-funding venue, short the higher -> favourable (<=0) delta.
    const fA = asNumber(ra.funding) ?? 0;
    const fB = asNumber(rb.funding) ?? 0;
    const [longVenue, shortVenue, fLong, fShort] = fA <= fB ? [slugA, slugB, fA, fB] : [slugB, slugA, fB, fA];
    const fundingUsd = (fillNotionalUsd * (fLong - fShort) * HOLD_HOURS) / HOURS_PER_YEAR;
    const cycleCostUsd = execCostUsd + fundingUsd;

    candidates.push({
      pair: sym,
      oiAUsd: oiA * 2,
      oiBUsd: oiB * 2,
      volume24hMinUsd: Math.min(volA, volB),
      longVenue,
      shortVenue,
      execCostUsd,
      fundingUsd,
      cycleCostUsd,
      oiKey: Math.min(oiA, oiB) * 2,
    });
  }

  let grouped: boolean;
  let bands: CrossBand[];
  if (candidates.length < MIN_PAIRS_FOR_BANDS) {
    grouped = false;
    bands = candidates.length ? [bandFrom("all", candidates, candidates.length)] : [];
  } else {
    grouped = true;
    const byOi = [...candidates].sort((a, b) => b.oiKey - a.oiKey);
    const size = Math.ceil(byOi.length / 3);
    bands = [
      bandFrom("high", byOi.slice(0, size), 10),
      bandFrom("medium", byOi.slice(size, size * 2), 10),
      bandFrom("low", byOi.slice(size * 2), 10),
    ];
  }

  return {
    venueA: slugA,
    venueB: slugB,
    accountVolumeUsd,
    fillNotionalUsd,
    totalCycleVolumeUsd: accountVolumeUsd * 2,
    holdHours: HOLD_HOURS,
    minVolumeUsd: MIN_VOLUME_USD,
    grouped,
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
    const bps = legBps(r, fillNotionalUsd, "cheapest");
    if (vol === null || oi === null || bps === null || oi <= 0 || vol < MIN_VOLUME_USD) continue;
    const cost = (accountVolumeUsd * bps) / 10_000; // 2 market legs
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
      .reduce<number | null>((min, p) => (min === null || p.cycleCostUsd < min ? p.cycleCostUsd : min), null);
    if (cheapest !== null && (best === null || cheapest < best.cycleCostUsd)) {
      best = { partnerSlug: partner, cycleCostUsd: cheapest };
    }
  }
  return best;
}
