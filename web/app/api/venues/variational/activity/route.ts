import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const VARIATIONAL_STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const VARIATIONAL_OMNI_URL = "https://www.variational.io/omni";
// Official Omni site, checked on 2026-07-17. It is a lower bound ("50K+")
// rather than an exact account count.
const OFFICIAL_UNIQUE_TRADERS_FLOOR = 50_000;
// How far back the first-party series may reach. Real observations only exist
// from when sync-snapshots started writing; days beyond that are backfilled
// on the client from the reference envelope until the DB catches up.
const HISTORY_DAYS = 180;
const DUNE_RESULTS_URL = "https://api.dune.com/api/v1/query";

// Next.js requires a literal here; expressions such as `60 * 60` are not
// accepted as route-segment config during the production build.
export const revalidate = 3600;

type ActivityPoint = { date: string; value: number };

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Protocol-wide daily series from our own hourly snapshots (first-party, saved
 * straight from Variational). `volume_24h_usd` and `open_interest_usd` are both
 * point-in-time figures, so we keep the last snapshot per market per UTC day and
 * sum across markets — never sum the hourly samples, which would multiply the
 * same day many times over. `column` is a fixed literal, not user input.
 */
async function getObservedDaily(column: "volume_24h_usd" | "open_interest_usd"): Promise<ActivityPoint[]> {
  const { rows } = await getPool().query<{ date: string; value: string | number }>(
    `WITH latest_market_snapshot AS (
       SELECT
         (snapshot.ts AT TIME ZONE 'UTC')::date AS day,
         snapshot.market_id,
         snapshot.${column} AS metric,
         ROW_NUMBER() OVER (
           PARTITION BY (snapshot.ts AT TIME ZONE 'UTC')::date, snapshot.market_id
           ORDER BY snapshot.ts DESC
         ) AS row_number
       FROM volume_snapshots snapshot
       JOIN markets market ON market.id = snapshot.market_id
       JOIN venues venue ON venue.id = market.venue_id
       WHERE venue.slug = 'variational'
         AND snapshot.ts >= now() - interval '180 days'
     )
     SELECT day::text AS date, SUM(metric) AS value
     FROM latest_market_snapshot
     WHERE row_number = 1 AND metric IS NOT NULL
     GROUP BY day
     ORDER BY day ASC`,
  );

  return rows
    .map((row) => ({ date: row.date, value: asNumber(row.value) }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .slice(-HISTORY_DAYS);
}

async function getCurrentVariationalStats(): Promise<{ volume24h: number | null; openInterest: number | null }> {
  const response = await fetch(VARIATIONAL_STATS_URL, { next: { revalidate: 5 * 60 } });
  if (!response.ok) throw new Error(`Variational stats returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error("Variational stats returned an invalid payload");
  return {
    volume24h: asNumber(payload.total_volume_24h),
    openInterest: asNumber(payload.open_interest),
  };
}

/**
 * Omni's public market API does not expose account or trader counts. The
 * official Omni page currently publishes the aggregate "Unique Traders"
 * figure, so retain that first-party snapshot without manufacturing a 30-day
 * history. The protocol's official Dune dashboard is the planned source for
 * a proper historical series once its public query is connected.
 */
async function getOfficialUniqueTraders(): Promise<number | null> {
  try {
    const response = await fetch(VARIATIONAL_OMNI_URL, { next: { revalidate: 60 * 60 } });
    if (!response.ok) return null;
    const body = await response.text();
    const match = body.match(/(\d+(?:\.\d+)?)\s*K\s*\+?\s*(?:<[^>]+>\s*)*Unique\s+Traders/i);
    if (!match) return null;
    const thousands = Number(match[1]);
    return Number.isFinite(thousands) ? Math.round(thousands * 1_000) : null;
  } catch {
    return null;
  }
}

function valueFromDuneRow(row: Record<string, unknown>, names: string[]): unknown {
  const found = Object.entries(row).find(([key]) => names.includes(key.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return found?.[1];
}

/**
 * Dune exposes saved-query results through an authenticated read-only API.
 * Configure a query from Variational's official dashboard that returns
 * `date`/`day` plus `unique_traders` (cumulative protocol accounts) and set
 * the two env values below. Until then, retain only Omni's published 50K+
 * current snapshot rather than inventing 30 days of user counts.
 */
async function getDuneUniqueTraders(): Promise<ActivityPoint[] | null> {
  const apiKey = process.env.DUNE_API_KEY;
  const queryId = process.env.DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID;
  if (!apiKey || !queryId) return null;

  try {
    const response = await fetch(`${DUNE_RESULTS_URL}/${encodeURIComponent(queryId)}/results?limit=100`, {
      headers: { "X-Dune-Api-Key": apiKey },
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const rows = isRecord(payload) && isRecord(payload.result) && Array.isArray(payload.result.rows)
      ? payload.result.rows
      : [];
    const byDate = new Map<string, number>();
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const rawDate = valueFromDuneRow(row, ["date", "day", "blockdate", "period"]);
      const rawCount = valueFromDuneRow(row, ["uniquetraders", "uniqueusers", "traders", "users"]);
      const parsedDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
      const date = Number.isNaN(parsedDate.valueOf()) ? null : parsedDate.toISOString().slice(0, 10);
      const value = asNumber(rawCount);
      if (date !== null && value !== null && value >= 0) byDate.set(date, value);
    }
    const points = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    return points.length > 0 ? points.slice(-HISTORY_DAYS) : null;
  } catch {
    return null;
  }
}

function withCurrentPoint(history: ActivityPoint[], value: number | null): ActivityPoint[] {
  if (value === null) return history;
  const today = new Date().toISOString().slice(0, 10);
  const withoutToday = history.filter((point) => point.date !== today);
  return [...withoutToday, { date: today, value }].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
}

export async function GET() {
  const [observedVolumeResult, observedOiResult, liveResult, uniqueTradersResult, duneUniqueTradersResult] =
    await Promise.allSettled([
      getObservedDaily("volume_24h_usd"),
      getObservedDaily("open_interest_usd"),
      getCurrentVariationalStats(),
      getOfficialUniqueTraders(),
      getDuneUniqueTraders(),
    ]);

  const observedVolumeHistory = observedVolumeResult.status === "fulfilled" ? observedVolumeResult.value : [];
  const observedOiHistory = observedOiResult.status === "fulfilled" ? observedOiResult.value : [];
  const live = liveResult.status === "fulfilled" ? liveResult.value : { volume24h: null, openInterest: null };
  // Past days come from our own snapshots; today is the fresh Variational figure.
  const volumeHistory = withCurrentPoint(observedVolumeHistory, live.volume24h);
  const openInterest = withCurrentPoint(observedOiHistory, live.openInterest);
  const uniqueTraders = uniqueTradersResult.status === "fulfilled"
    ? uniqueTradersResult.value ?? OFFICIAL_UNIQUE_TRADERS_FLOOR
    : OFFICIAL_UNIQUE_TRADERS_FLOOR;
  const duneUniqueTraders = duneUniqueTradersResult.status === "fulfilled" ? duneUniqueTradersResult.value : null;

  if (volumeHistory.length === 0 && openInterest.length === 0) {
    return NextResponse.json(
      { error: "Could not load Variational activity data" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    asOf: new Date().toISOString(),
    days: HISTORY_DAYS,
    volume: {
      series: volumeHistory,
      observedDays: observedVolumeHistory.length,
      latest24h: live.volume24h,
    },
    openInterest: {
      series: openInterest,
      observedDays: observedOiHistory.length,
      latest: live.openInterest,
    },
    uniqueTraders: {
      series: duneUniqueTraders ?? (uniqueTraders === null ? [] : [{ date: new Date().toISOString().slice(0, 10), value: uniqueTraders }]),
      latest: duneUniqueTraders?.at(-1)?.value ?? uniqueTraders,
      source: duneUniqueTraders ? "dune" : "official-site",
    },
  });
}
