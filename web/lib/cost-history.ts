/**
 * The cost model, shared by every protocol's calculator.
 *
 * One principle, one formula, one data path, whichever protocol asked:
 *
 *   legBps = spread/2 + quote impact at the fill size   (what ONE market
 *            order pays against mid; the resting limit legs cross nothing)
 *   cycle  = 2 x fill x (legBps + feeBps) / 10 000      (4 fills: 2 passive,
 *            2 crossing)
 *
 * The headline number is the 24h MEDIAN of that, with p25-p75 as the range,
 * so a single lucky or unlucky book snapshot cannot set the price. Protocols
 * differ only in their data (fees, depth, OI scale) -- never in how the number
 * is derived. TxFlow used to be priced from a single live snapshot while
 * Variational used percentiles, which is why one page could promise a "24h
 * median" the other had no way to produce.
 */
import { secondsUntilNextCollection } from "@/lib/cache";
import { getPool } from "@/lib/db";
import { quoteCurveImpactBps, quoteCurveMarkPrice, quoteCurveMarketSide } from "@/lib/quote-curve";

/**
 * The rows behind a pricing run, kept in this server instance's memory until
 * the next collection is due.
 *
 * The queries below do not depend on the fill size -- they pull a venue's
 * stored snapshots, and the size is applied afterwards, in arithmetic. So two
 * visitors pricing $20,000 and $21,000 were pulling the same tens of megabytes
 * of quote curves out of Postgres a second apart to compute two slightly
 * different numbers from identical rows.
 *
 * Held only until the next hourly collection, because that is the only thing
 * that can change the answer, and only for a few venues at a time. A cold
 * instance simply reads from the database as before: this is a saving, never a
 * source of truth.
 */
const MAX_CACHED_VENUES = 4;
const rowCache = new Map<string, { expiresAt: number; rows: unknown[] }>();

function cachedRows<T>(key: string): T[] | null {
  const entry = rowCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    rowCache.delete(key);
    return null;
  }
  return entry.rows as T[];
}

/** The cached rows for `key`, or the query's, remembered until the next hour. */
async function rowsFor<T>(key: string, query: () => Promise<{ rows: T[] }>): Promise<T[]> {
  return cachedRows<T>(key) ?? cacheRows(key, (await query()).rows);
}

function cacheRows<T>(key: string, rows: T[]): T[] {
  // A Map iterates in insertion order, so this evicts the venue that has gone
  // longest without being asked for.
  while (rowCache.size >= MAX_CACHED_VENUES) {
    const oldest = rowCache.keys().next();
    if (oldest.done) break;
    rowCache.delete(oldest.value);
  }
  rowCache.set(key, { expiresAt: Date.now() + secondsUntilNextCollection() * 1_000, rows });
  return rows;
}

/**
 * How much of the 24h window to actually pull.
 *
 * Every hourly snapshot of all ~540 Variational markets carries a quote curve,
 * so the raw pull is tens of megabytes and can outlast the request. Sampling
 * every other snapshot keeps the full window (and a representative spread of
 * quotes) at half the payload.
 */
const HISTORY_MAX_SNAPSHOTS = 24;
const HISTORY_SAMPLE_STRIDE = 2;
const HISTORY_WINDOW_HOURS = 24;

export type CostSample = {
  legBps: number;
  spreadBps: number;
  impactBps: number;
  /** The venue's mark at this tick. Two venues' marks at the same tick give the
   *  gap a cross-protocol hedge has to live with. Null on older rows that
   *  predate stored quote curves. */
  markPrice: number | null;
};

export type ImpactSnapshot = {
  spread_bps?: string | number | null;
  impact_bps_10k?: string | number | null;
  impact_bps_50k?: string | number | null;
  impact_bps_100k?: string | number | null;
  quote_curve_json?: unknown;
};

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Piecewise-linear impact at an arbitrary notional from the published buckets.
 * Impact is 0 at size 0; missing buckets are skipped; sizes past the last
 * anchor clamp to it.
 */
export function impactAtNotional(notional: number, anchors: Array<[number, number | null]>): number | null {
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

/** One stored book snapshot, priced at the requested fill size. */
export function sampleFromSnapshot(snapshot: ImpactSnapshot, fillNotionalUsd: number): CostSample | null {
  const spreadBps = asNumber(snapshot.spread_bps);
  const impactBps = quoteCurveImpactBps(snapshot.quote_curve_json, fillNotionalUsd, "cheapest") ?? impactAtNotional(fillNotionalUsd, [
    [10_000, asNumber(snapshot.impact_bps_10k)],
    [50_000, asNumber(snapshot.impact_bps_50k)],
    [100_000, asNumber(snapshot.impact_bps_100k)],
  ]);
  if (spreadBps === null || impactBps === null) return null;
  return { legBps: spreadBps / 2 + impactBps, spreadBps, impactBps, markPrice: quoteCurveMarkPrice(snapshot.quote_curve_json) };
}

/** Linear-interpolated percentile over `legBps`, carrying its components. */
export function percentileSample(samples: CostSample[], percentile: number): CostSample | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left.legBps - right.legBps);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex]!;
  const upper = sorted[upperIndex]!;
  const fraction = position - lowerIndex;
  return {
    legBps: lower.legBps + (upper.legBps - lower.legBps) * fraction,
    spreadBps: lower.spreadBps + (upper.spreadBps - lower.spreadBps) * fraction,
    impactBps: lower.impactBps + (upper.impactBps - lower.impactBps) * fraction,
    // The mark belongs to a real observation, so it is taken rather than blended.
    markPrice: lower.markPrice,
  };
}

type BookHistoryRow = ImpactSnapshot & { pair: string };

/**
 * 24h of stored book snapshots for one protocol, already priced at the fill
 * size and keyed by canonical pair.
 *
 * The worker snapshots every live protocol hourly, so this works for any of
 * them -- the caller passes a slug, not a hard-coded venue.
 */
export async function loadCostHistory(venueSlug: string, fillNotionalUsd: number): Promise<Map<string, CostSample[]>> {
  const rows = await rowsFor<BookHistoryRow>(`history:${venueSlug}`, () =>
    getPool().query<BookHistoryRow>(
      `WITH v AS (SELECT id FROM venues WHERE slug = $3),
     ranked AS (
       SELECT m.symbol_canonical AS pair,
              b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k,
              to_jsonb(b) -> 'quote_curve_json' AS quote_curve_json,
              row_number() OVER (PARTITION BY b.market_id ORDER BY b.ts DESC) AS rn
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       WHERE m.venue_id = (SELECT id FROM v)
         AND b.ts >= now() - make_interval(hours => $4)
     )
     SELECT pair, spread_bps, impact_bps_10k, impact_bps_50k, impact_bps_100k, quote_curve_json
     FROM ranked
     WHERE rn <= $1 AND (rn - 1) % $2 = 0`,
      [HISTORY_MAX_SNAPSHOTS, HISTORY_SAMPLE_STRIDE, venueSlug, HISTORY_WINDOW_HOURS],
    ),
  );

  const byPair = new Map<string, CostSample[]>();
  for (const row of rows) {
    const sample = sampleFromSnapshot(row, fillNotionalUsd);
    if (sample === null) continue;
    const existing = byPair.get(row.pair);
    if (existing) existing.push(sample);
    else byPair.set(row.pair, [sample]);
  }
  return byPair;
}

export type VenueMarket = {
  pair: string;
  /** When the newest snapshot behind this market was taken. */
  bookTs: string;
  volume24hUsd: number | null;
  /** As stored by the adapter, before any per-protocol display convention. */
  openInterestUsd: number | null;
  /** Which leg rests its limit orders: the side that is cheaper to cross. */
  firstLimitSide: "long" | "short";
  /** The 24h window, newest first, already priced at the fill size. */
  samples: CostSample[];
};

type VenueMarketRow = ImpactSnapshot & {
  pair: string;
  ts: string;
  rn: number;
  volume_24h_usd: string | number | null;
  open_interest_usd: string | number | null;
};

/**
 * Everything a calculator needs for one protocol, from stored snapshots only.
 *
 * There is no live venue call anywhere in the pricing path. A per-visitor scan
 * of a venue's API meant ~80 requests per run (TxFlow rate-limited us with 429s
 * for it), a number that changed between two runs a second apart, and the same
 * market reading differently on the protocol page than in the cross table. The
 * worker already records all of it hourly; the site reads what it recorded.
 */
export async function loadVenueMarkets(venueSlug: string, fillNotionalUsd: number): Promise<Map<string, VenueMarket>> {
  const rows = await rowsFor<VenueMarketRow>(`markets:${venueSlug}`, () =>
    getPool().query<VenueMarketRow>(
      `WITH v AS (SELECT id FROM venues WHERE slug = $3),
     ranked AS (
       SELECT m.symbol_canonical AS pair, b.ts,
              b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k,
              to_jsonb(b) -> 'quote_curve_json' AS quote_curve_json,
              row_number() OVER (PARTITION BY b.market_id ORDER BY b.ts DESC) AS rn
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       WHERE m.venue_id = (SELECT id FROM v) AND m.is_active = true
         AND b.ts >= now() - make_interval(hours => $4)
     ),
     vol AS (
       SELECT DISTINCT ON (s.market_id) m.symbol_canonical AS pair,
              s.volume_24h_usd, s.open_interest_usd
       FROM volume_snapshots s
       JOIN markets m ON m.id = s.market_id
       WHERE m.venue_id = (SELECT id FROM v) AND m.is_active = true
       ORDER BY s.market_id, s.ts DESC
     )
     SELECT ranked.pair, ranked.ts, ranked.rn,
            ranked.spread_bps, ranked.impact_bps_10k, ranked.impact_bps_50k,
            ranked.impact_bps_100k, ranked.quote_curve_json,
            vol.volume_24h_usd, vol.open_interest_usd
     FROM ranked LEFT JOIN vol ON vol.pair = ranked.pair
     WHERE ranked.rn <= $1 AND (ranked.rn - 1) % $2 = 0
     ORDER BY ranked.pair, ranked.rn`,
      [HISTORY_MAX_SNAPSHOTS, HISTORY_SAMPLE_STRIDE, venueSlug, HISTORY_WINDOW_HOURS],
    ),
  );

  const byPair = new Map<string, VenueMarket>();
  for (const row of rows) {
    const sample = sampleFromSnapshot(row, fillNotionalUsd);
    if (sample === null) continue;
    const existing = byPair.get(row.pair);
    if (existing) {
      existing.samples.push(sample);
      continue;
    }
    // rn = 1 sorts first, so the first row seen for a pair is its newest.
    // The stored quote curve carries bid AND ask per size, so the cheaper
    // side to cross is derivable from it -- no live book required.
    byPair.set(row.pair, {
      pair: row.pair,
      bookTs: row.ts,
      volume24hUsd: asNumber(row.volume_24h_usd),
      openInterestUsd: asNumber(row.open_interest_usd),
      firstLimitSide: quoteCurveMarketSide(row.quote_curve_json, fillNotionalUsd)?.firstLimitSide ?? "long",
      samples: [sample],
    });
  }
  return byPair;
}

export type CostQuote = {
  /** p50 of the 24h window -- the headline. */
  median: CostSample;
  low: CostSample;
  high: CostSample;
  latest: CostSample;
  /** How many observations backed it; 1 means only the live book. */
  observations: number;
};

/**
 * Combine the live reading with stored history into the quote every calculator
 * publishes. With no history the live sample answers all four, and the caller
 * reports the basis honestly rather than dressing one snapshot as a median.
 */
export function quoteFromSamples(live: CostSample | null, history: CostSample[]): CostQuote | null {
  const samples = live === null ? history : [live, ...history];
  if (samples.length === 0) return null;
  const median = percentileSample(samples, 0.5)!;
  return {
    median,
    low: percentileSample(samples, 0.25)!,
    high: percentileSample(samples, 0.75)!,
    latest: live ?? median,
    observations: samples.length,
  };
}
