import { Pool } from "pg";
import type { FeeScheduleEntry, VenueDetail, VenueSummary } from "./types";

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

export async function getVenues(): Promise<VenueSummary[]> {
  const { rows } = await getPool().query<DbRow>(
    `SELECT
       v.slug, v.name, v.api_status,
       vm.season_name, vm.season_end_date,
       fs.maker_bps, fs.taker_bps,
       COALESCE(mk.pairs, ARRAY[]::text[]) AS pairs
     FROM venues v
     LEFT JOIN venue_meta vm ON vm.venue_id = v.id
     LEFT JOIN LATERAL (
       SELECT maker_bps, taker_bps FROM fee_schedules
       WHERE venue_id = v.id AND effective_from <= CURRENT_DATE
       ORDER BY effective_from DESC, created_at DESC LIMIT 1
     ) fs ON true
     LEFT JOIN LATERAL (
       SELECT array_agg(DISTINCT symbol_canonical) AS pairs
       FROM markets WHERE venue_id = v.id AND is_active
     ) mk ON true
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
    pairs: (row.pairs as string[]) ?? [],
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

  const [metaRes, rulesRes, feeHistoryRes, marketsRes] = await Promise.all([
    getPool().query<DbRow>("SELECT * FROM venue_meta WHERE venue_id = $1", [venueId]),
    getPool().query<DbRow>("SELECT * FROM execution_rules WHERE venue_id = $1", [venueId]),
    getPool().query<DbRow>(
      `SELECT maker_bps, taker_bps, effective_from, source_url FROM fee_schedules
       WHERE venue_id = $1 ORDER BY effective_from DESC, created_at DESC LIMIT 20`,
      [venueId]
    ),
    getPool().query<DbRow>(
      "SELECT symbol, symbol_canonical, is_active FROM markets WHERE venue_id = $1 ORDER BY symbol_canonical",
      [venueId]
    ),
  ]);

  const meta = metaRes.rows[0];
  const rules = rulesRes.rows[0];
  const feeHistory: FeeScheduleEntry[] = feeHistoryRes.rows.map((r) => ({
    makerBps: Number(r.maker_bps),
    takerBps: Number(r.taker_bps),
    effectiveFrom: new Date(r.effective_from).toISOString(),
    sourceUrl: r.source_url,
  }));

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
    markets: marketsRes.rows.map((r) => ({
      symbol: r.symbol,
      symbolCanonical: r.symbol_canonical,
      isActive: r.is_active,
    })),
  };
}
