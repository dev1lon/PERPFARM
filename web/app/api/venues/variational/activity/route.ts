import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const DEFILLAMA_OPEN_INTEREST_URL =
  "https://api.llama.fi/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false";
const VARIATIONAL_STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const HISTORY_DAYS = 30;

export const revalidate = 60 * 60;

type ActivityPoint = { date: string; value: number };

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function utcDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function getDefiLlamaOpenInterest(): Promise<ActivityPoint[]> {
  const response = await fetch(DEFILLAMA_OPEN_INTEREST_URL, {
    next: { revalidate: 60 * 60 },
  });
  if (!response.ok) throw new Error(`DefiLlama returned ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.totalDataChartBreakdown)) {
    throw new Error("DefiLlama did not return an open-interest history");
  }

  return payload.totalDataChartBreakdown
    .map((row): ActivityPoint | null => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const timestamp = asNumber(row[0]);
      const breakdown = row[1];
      if (timestamp === null || !isRecord(breakdown)) return null;
      const value = asNumber(breakdown.Variational);
      return value === null ? null : { date: utcDate(timestamp), value };
    })
    .filter((point): point is ActivityPoint => point !== null)
    .slice(-HISTORY_DAYS);
}

/**
 * `volume_24h_usd` is a rolling 24-hour figure.  We retain the final
 * snapshot for every UTC day rather than summing hourly samples, which would
 * multiply the same trading day many times over.
 */
async function getObservedDailyVolume(): Promise<ActivityPoint[]> {
  const { rows } = await getPool().query<{ date: string; value: string | number }>(
    `WITH latest_market_snapshot AS (
       SELECT
         (snapshot.ts AT TIME ZONE 'UTC')::date AS day,
         snapshot.market_id,
         snapshot.volume_24h_usd,
         ROW_NUMBER() OVER (
           PARTITION BY (snapshot.ts AT TIME ZONE 'UTC')::date, snapshot.market_id
           ORDER BY snapshot.ts DESC
         ) AS row_number
       FROM volume_snapshots snapshot
       JOIN markets market ON market.id = snapshot.market_id
       JOIN venues venue ON venue.id = market.venue_id
       WHERE venue.slug = 'variational'
         AND snapshot.ts >= now() - interval '30 days'
     )
     SELECT day::text AS date, SUM(volume_24h_usd) AS value
     FROM latest_market_snapshot
     WHERE row_number = 1 AND volume_24h_usd IS NOT NULL
     GROUP BY day
     ORDER BY day ASC`,
  );

  return rows
    .map((row) => ({ date: row.date, value: asNumber(row.value) }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .slice(-HISTORY_DAYS)
    .map((point) => ({ date: point.date, value: point.value }));
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

function withCurrentPoint(history: ActivityPoint[], value: number | null): ActivityPoint[] {
  if (value === null) return history;
  const today = new Date().toISOString().slice(0, 10);
  const withoutToday = history.filter((point) => point.date !== today);
  return [...withoutToday, { date: today, value }].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
}

export async function GET() {
  const [oiResult, volumeResult, liveResult] = await Promise.allSettled([
    getDefiLlamaOpenInterest(),
    getObservedDailyVolume(),
    getCurrentVariationalStats(),
  ]);

  const openInterestHistory = oiResult.status === "fulfilled" ? oiResult.value : [];
  const observedVolumeHistory = volumeResult.status === "fulfilled" ? volumeResult.value : [];
  const live = liveResult.status === "fulfilled" ? liveResult.value : { volume24h: null, openInterest: null };
  const volumeHistory = withCurrentPoint(observedVolumeHistory, live.volume24h);
  const openInterest = withCurrentPoint(openInterestHistory, live.openInterest);

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
      latest: live.openInterest,
    },
  });
}
