import { Pool } from "pg";
import type {
  CostBreakdown,
  DataFreshness,
  FeeScheduleEntry,
  RecommendedExecution,
  RouteScoreRow,
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
      // Serverless (Vercel) runs many function instances in parallel, each with
      // its own pool. Supabase's session pooler caps total clients (pool_size
      // 15), so keep each instance to a single connection and release it
      // quickly when idle, instead of pg's default of up to 10 per pool.
      max: 1,
      idleTimeoutMillis: 10_000,
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
