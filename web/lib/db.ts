import { Pool } from "pg";
import type {
  CostBreakdown,
  DataFreshness,
  FeeScheduleEntry,
  RecommendedExecution,
  RouteDetail,
  RouteScoreRow,
  SnapshotPoint,
  VenueDetail,
  VenueSummary,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    // Managed Postgres (Supabase/Neon on the free staging env) requires TLS but
    // serves a cert that isn't in Node's default CA bundle -> "self-signed
    // certificate in certificate chain". When the URL asks for SSL, STRIP the
    // sslmode param (so `pg` doesn't derive its own strict verification from the
    // connection string and override us) and pass an explicit relaxed ssl
    // config. Render's internal prod URL has no sslmode -> left untouched, no TLS.
    const wantsSsl = /[?&]sslmode=(require|prefer|verify-full|verify-ca)/i.test(raw);
    const connectionString = wantsSsl
      ? raw.replace(/[?&]sslmode=[^&]*/i, "").replace(/[?&]+$/, "")
      : raw;
    pool = new Pool({
      connectionString,
      ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function mapRouteRow(row: DbRow): RouteScoreRow {
  return {
    symbolCanonical: row.symbol_canonical,
    longVenueSlug: row.long_slug,
    longVenueName: row.long_name,
    shortVenueSlug: row.short_slug,
    shortVenueName: row.short_name,
    ts: new Date(row.ts).toISOString(),
    isComplete: row.is_complete,
    costPerPointUsd: toNumberOrNull(row.cost_per_point_usd),
    pointsPer1mVolume: toNumberOrNull(row.points_per_1m_volume),
    dilutionScore: toNumberOrNull(row.dilution_score),
    costBreakdown: (row.cost_breakdown_json ?? {}) as CostBreakdown,
    recommendedExecution: (row.recommended_execution_json ?? {}) as RecommendedExecution,
    dataFreshness: row.data_freshness_json as DataFreshness,
  };
}

export type RouteSort = "cost_per_point" | "points_roi" | "funding" | "season_ending";

export interface RouteFilters {
  venue?: string;
  pair?: string;
  hideRumor?: boolean;
  sort?: RouteSort;
}

// Bare column/expression names, matching the flattened `scored` CTE below --
// never string-interpolate the sort choice itself, only select from this map.
const SORT_EXPR: Record<RouteSort, string> = {
  cost_per_point: "cost_per_point_usd",
  points_roi: "points_per_1m_volume",
  funding: "(cost_breakdown_json->>'funding_cost_usd')::numeric",
  season_ending: "season_ending_days",
};

const SORT_DIRECTION: Record<RouteSort, "ASC" | "DESC"> = {
  cost_per_point: "ASC",
  points_roi: "DESC",
  funding: "ASC",
  season_ending: "ASC",
};

/** Latest route_scores row per (pair, long venue, short venue), most recently scored first. */
export async function getLatestRouteScores(filters: RouteFilters = {}): Promise<RouteScoreRow[]> {
  const sort = filters.sort ?? "cost_per_point";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.venue) {
    params.push(filters.venue);
    conditions.push(`(long_slug = $${params.length} OR short_slug = $${params.length})`);
  }
  if (filters.pair) {
    params.push(filters.pair);
    conditions.push(`symbol_canonical = $${params.length}`);
  }
  if (filters.hideRumor) {
    conditions.push(`(data_freshness_json->>'min_confidence') IS DISTINCT FROM 'rumor'`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (symbol_canonical, long_venue_id, short_venue_id) *
      FROM route_scores
      ORDER BY symbol_canonical, long_venue_id, short_venue_id, ts DESC
    ),
    scored AS (
      SELECT
        r.*,
        lv.slug AS long_slug, lv.name AS long_name,
        sv.slug AS short_slug, sv.name AS short_name,
        LEAST(
          COALESCE((lvm.season_end_date - CURRENT_DATE), 999999),
          COALESCE((svm.season_end_date - CURRENT_DATE), 999999)
        ) AS season_ending_days
      FROM latest r
      JOIN venues lv ON lv.id = r.long_venue_id
      JOIN venues sv ON sv.id = r.short_venue_id
      LEFT JOIN venue_meta lvm ON lvm.venue_id = r.long_venue_id
      LEFT JOIN venue_meta svm ON svm.venue_id = r.short_venue_id
    )
    SELECT * FROM scored
    ${where}
    ORDER BY ${SORT_EXPR[sort]} ${SORT_DIRECTION[sort]} NULLS LAST,
             cost_per_point_usd ASC NULLS LAST
    LIMIT 200
  `;

  const { rows } = await getPool().query(sql, params);
  return rows.map(mapRouteRow);
}

/** Every latest route_scores row connecting `venueSlug` and `hedgeSlug`, in
 * both directions (or the single same-venue direction when they're equal --
 * `hedgeSlug === venueSlug` collapses both conditions to one row per pair).
 * Powers the /api/venues/[slug]/recipes endpoint; ranking/shaping into
 * recipes happens in lib/recipes.ts, not here. */
export async function getRoutesForVenuePair(
  venueSlug: string,
  hedgeSlug: string
): Promise<RouteScoreRow[]> {
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (symbol_canonical, long_venue_id, short_venue_id) *
      FROM route_scores
      ORDER BY symbol_canonical, long_venue_id, short_venue_id, ts DESC
    )
    SELECT
      r.*,
      lv.slug AS long_slug, lv.name AS long_name,
      sv.slug AS short_slug, sv.name AS short_name
    FROM latest r
    JOIN venues lv ON lv.id = r.long_venue_id
    JOIN venues sv ON sv.id = r.short_venue_id
    WHERE (lv.slug = $1 AND sv.slug = $2) OR (lv.slug = $2 AND sv.slug = $1)
  `;
  const { rows } = await getPool().query(sql, [venueSlug, hedgeSlug]);
  return rows.map(mapRouteRow);
}

async function getVenueIdBySlug(slug: string): Promise<number | null> {
  const { rows } = await getPool().query<{ id: number }>(
    "SELECT id FROM venues WHERE slug = $1",
    [slug]
  );
  return rows[0]?.id ?? null;
}

async function getMarketId(venueId: number, symbolCanonical: string): Promise<number | null> {
  const { rows } = await getPool().query<{ id: number }>(
    `SELECT id FROM markets WHERE venue_id = $1 AND symbol_canonical = $2
     ORDER BY is_active DESC LIMIT 1`,
    [venueId, symbolCanonical]
  );
  return rows[0]?.id ?? null;
}

async function getSnapshotSeries(
  table: "funding_snapshots" | "book_snapshots",
  valueColumn: string,
  marketId: number,
  sinceDays: number
): Promise<SnapshotPoint[]> {
  const { rows } = await getPool().query<{ ts: Date; value: string | number }>(
    `SELECT ts, ${valueColumn} AS value FROM ${table}
     WHERE market_id = $1 AND ts >= now() - ($2 || ' days')::interval
     ORDER BY ts ASC`,
    [marketId, sinceDays]
  );
  return rows
    .filter((r) => r.value !== null)
    .map((r) => ({ ts: new Date(r.ts).toISOString(), value: Number(r.value) }));
}

export async function getRouteDetail(
  symbolCanonical: string,
  longSlug: string,
  shortSlug: string
): Promise<RouteDetail | null> {
  const longVenueId = await getVenueIdBySlug(longSlug);
  const shortVenueId = await getVenueIdBySlug(shortSlug);
  if (longVenueId === null || shortVenueId === null) return null;

  const { rows: venueRows } = await getPool().query<{ slug: string; name: string; id: number }>(
    "SELECT id, slug, name FROM venues WHERE id = ANY($1)",
    [[longVenueId, shortVenueId]]
  );
  const longVenue = venueRows.find((v) => v.id === longVenueId);
  const shortVenue = venueRows.find((v) => v.id === shortVenueId);
  if (!longVenue || !shortVenue) return null;

  const { rows: historyRows } = await getPool().query<DbRow>(
    `SELECT ts, is_complete, cost_per_point_usd FROM route_scores
     WHERE symbol_canonical = $1 AND long_venue_id = $2 AND short_venue_id = $3
     ORDER BY ts DESC LIMIT 60`,
    [symbolCanonical, longVenueId, shortVenueId]
  );
  const history = historyRows
    .map((r) => ({
      ts: new Date(r.ts).toISOString(),
      costPerPointUsd: toNumberOrNull(r.cost_per_point_usd),
      isComplete: r.is_complete as boolean,
    }))
    .reverse();

  let latest: RouteScoreRow | null = null;
  if (historyRows[0]) {
    const { rows: latestRows } = await getPool().query<DbRow>(
      `SELECT r.*, lv.slug AS long_slug, lv.name AS long_name,
              sv.slug AS short_slug, sv.name AS short_name
       FROM route_scores r
       JOIN venues lv ON lv.id = r.long_venue_id
       JOIN venues sv ON sv.id = r.short_venue_id
       WHERE r.symbol_canonical = $1 AND r.long_venue_id = $2 AND r.short_venue_id = $3
       ORDER BY r.ts DESC LIMIT 1`,
      [symbolCanonical, longVenueId, shortVenueId]
    );
    latest = latestRows[0] ? mapRouteRow(latestRows[0]) : null;
  }

  const longMarketId = await getMarketId(longVenueId, symbolCanonical);
  const shortMarketId = await getMarketId(shortVenueId, symbolCanonical);

  const fundingHistory = {
    long: longMarketId
      ? await getSnapshotSeries("funding_snapshots", "funding_rate_annualized", longMarketId, 30)
      : [],
    short: shortMarketId
      ? await getSnapshotSeries("funding_snapshots", "funding_rate_annualized", shortMarketId, 30)
      : [],
  };
  const spreadHistory = {
    long: longMarketId
      ? await getSnapshotSeries("book_snapshots", "spread_bps", longMarketId, 30)
      : [],
    short: shortMarketId
      ? await getSnapshotSeries("book_snapshots", "spread_bps", shortMarketId, 30)
      : [],
  };

  return {
    symbolCanonical,
    long: { slug: longVenue.slug, name: longVenue.name },
    short: { slug: shortVenue.slug, name: shortVenue.name },
    latest,
    history,
    fundingHistory,
    spreadHistory,
  };
}

export async function getVenues(): Promise<VenueSummary[]> {
  const { rows } = await getPool().query<DbRow>(
    `SELECT
       v.slug, v.name, v.api_status,
       vm.season_name, vm.season_end_date,
       fs.maker_bps, fs.taker_bps,
       pp.confidence, pp.last_verified,
       COALESCE(mk.pairs, ARRAY[]::text[]) AS pairs,
       cp.cheapest AS cheapest_cost_per_point_usd
     FROM venues v
     LEFT JOIN venue_meta vm ON vm.venue_id = v.id
     LEFT JOIN LATERAL (
       SELECT maker_bps, taker_bps FROM fee_schedules
       WHERE venue_id = v.id AND effective_from <= CURRENT_DATE
       ORDER BY effective_from DESC, created_at DESC LIMIT 1
     ) fs ON true
     LEFT JOIN points_programs pp ON pp.venue_id = v.id
     LEFT JOIN LATERAL (
       SELECT array_agg(DISTINCT symbol_canonical) AS pairs
       FROM markets WHERE venue_id = v.id AND is_active
     ) mk ON true
     LEFT JOIN LATERAL (
       SELECT MIN(cost_per_point_usd) AS cheapest
       FROM (
         SELECT DISTINCT ON (symbol_canonical, long_venue_id, short_venue_id)
           cost_per_point_usd, is_complete
         FROM route_scores
         WHERE long_venue_id = v.id OR short_venue_id = v.id
         ORDER BY symbol_canonical, long_venue_id, short_venue_id, ts DESC
       ) latest_for_venue
       WHERE is_complete AND cost_per_point_usd IS NOT NULL
     ) cp ON true
     ORDER BY v.name ASC`
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    apiStatus: row.api_status,
    seasonName: row.season_name,
    seasonEndDate: row.season_end_date ? new Date(row.season_end_date).toISOString() : null,
    makerBps: toNumberOrNull(row.maker_bps),
    takerBps: toNumberOrNull(row.taker_bps),
    confidence: row.confidence,
    lastVerified: row.last_verified ? new Date(row.last_verified).toISOString() : null,
    pairs: (row.pairs as string[]) ?? [],
    cheapestCostPerPointUsd: toNumberOrNull(row.cheapest_cost_per_point_usd),
  }));
}

export async function getVenueDetail(slug: string): Promise<VenueDetail | null> {
  const { rows: venueRows } = await getPool().query<DbRow>(
    "SELECT id, slug, name, api_status FROM venues WHERE slug = $1",
    [slug]
  );
  const venue = venueRows[0];
  if (!venue) return null;
  const venueId = venue.id as number;

  const [metaRes, pointsRes, rulesRes, feeHistoryRes, distributionRes, marketsRes] =
    await Promise.all([
      getPool().query<DbRow>("SELECT * FROM venue_meta WHERE venue_id = $1", [venueId]),
      getPool().query<DbRow>("SELECT * FROM points_programs WHERE venue_id = $1", [venueId]),
      getPool().query<DbRow>("SELECT * FROM execution_rules WHERE venue_id = $1", [venueId]),
      getPool().query<DbRow>(
        `SELECT maker_bps, taker_bps, effective_from, source_url FROM fee_schedules
         WHERE venue_id = $1 ORDER BY effective_from DESC, created_at DESC LIMIT 20`,
        [venueId]
      ),
      getPool().query<DbRow>(
        `SELECT ts, points_distributed_week, total_points_outstanding FROM points_distributions
         WHERE venue_id = $1 ORDER BY ts DESC LIMIT 1`,
        [venueId]
      ),
      getPool().query<DbRow>(
        "SELECT symbol, symbol_canonical, is_active FROM markets WHERE venue_id = $1 ORDER BY symbol_canonical",
        [venueId]
      ),
    ]);

  const meta = metaRes.rows[0];
  const points = pointsRes.rows[0];
  const rules = rulesRes.rows[0];
  const feeHistory: FeeScheduleEntry[] = feeHistoryRes.rows.map((r) => ({
    makerBps: Number(r.maker_bps),
    takerBps: Number(r.taker_bps),
    effectiveFrom: new Date(r.effective_from).toISOString(),
    sourceUrl: r.source_url,
  }));
  const distribution = distributionRes.rows[0];

  return {
    slug: venue.slug,
    name: venue.name,
    apiStatus: venue.api_status,
    meta: meta
      ? {
          raisedUsd: toNumberOrNull(meta.raised_usd),
          investors: meta.investors,
          communitySupplyPct: toNumberOrNull(meta.community_supply_pct),
          otcPointPriceUsd: toNumberOrNull(meta.otc_point_price_usd),
          seasonName: meta.season_name,
          seasonEndDate: meta.season_end_date ? new Date(meta.season_end_date).toISOString() : null,
          twitterUrl: meta.twitter_url,
          docsUrl: meta.docs_url,
          referralLink: meta.referral_link,
          notesMd: meta.notes_md,
        }
      : null,
    pointsProgram: points
      ? {
          descriptionMd: points.description_md,
          pointsPerUsdVolumeEstimate: toNumberOrNull(points.points_per_usd_volume_estimate),
          weightNotes: points.weight_notes,
          confidence: points.confidence,
          lastVerified: new Date(points.last_verified).toISOString(),
          source: points.source,
        }
      : null,
    executionRules: rules
      ? {
          makerCountsForPoints: rules.maker_counts_for_points,
          takerCountsForPoints: rules.taker_counts_for_points,
          makerBoostMultiplier: Number(rules.maker_boost_multiplier),
          notes: rules.notes,
        }
      : null,
    currentFees: feeHistory[0] ?? null,
    feeHistory,
    latestDistribution: distribution
      ? {
          ts: new Date(distribution.ts).toISOString(),
          pointsDistributedWeek: toNumberOrNull(distribution.points_distributed_week),
          totalPointsOutstanding: toNumberOrNull(distribution.total_points_outstanding),
        }
      : null,
    markets: marketsRes.rows.map((r) => ({
      symbol: r.symbol,
      symbolCanonical: r.symbol_canonical,
      isActive: r.is_active,
    })),
  };
}
