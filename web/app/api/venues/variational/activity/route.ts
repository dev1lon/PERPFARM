import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const VARIATIONAL_STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const HISTORY_DAYS = 30;

function defiLlamaUrl(path: string): string {
  const apiKey = process.env.DEFILLAMA_API_KEY;
  return apiKey ? `https://pro-api.llama.fi/${apiKey}${path}` : `https://api.llama.fi${path}`;
}

const DEFILLAMA_OPEN_INTEREST_URL = defiLlamaUrl(
  "/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false",
);

// Next.js requires a literal here; expressions such as `60 * 60` are not
// accepted as route-segment config during the production build.
export const revalidate = 3600;

type ActivityPoint = { date: string; value: number };

// Initial daily values transcribed from the DefiLlama Variational Perp Volume
// chart on 2026-07-16. They total $24.823b over 30 days and $5.475b over the
// final seven days, matching the chart totals. The hourly Variational API
// snapshots below overwrite these dates as first-party observations accrue.
const INITIAL_VARIATIONAL_VOLUME_HISTORY: ActivityPoint[] = [
  { date: "2026-06-17", value: 680_000_000 },
  { date: "2026-06-18", value: 800_000_000 },
  { date: "2026-06-19", value: 1_040_000_000 },
  { date: "2026-06-20", value: 1_070_000_000 },
  { date: "2026-06-21", value: 860_000_000 },
  { date: "2026-06-22", value: 950_000_000 },
  { date: "2026-06-23", value: 800_000_000 },
  { date: "2026-06-24", value: 650_000_000 },
  { date: "2026-06-25", value: 950_000_000 },
  { date: "2026-06-26", value: 1_080_000_000 },
  { date: "2026-06-27", value: 850_000_000 },
  { date: "2026-06-28", value: 728_000_000 },
  { date: "2026-06-29", value: 640_000_000 },
  { date: "2026-06-30", value: 850_000_000 },
  { date: "2026-07-01", value: 950_000_000 },
  { date: "2026-07-02", value: 900_000_000 },
  { date: "2026-07-03", value: 760_000_000 },
  { date: "2026-07-04", value: 680_000_000 },
  { date: "2026-07-05", value: 920_000_000 },
  { date: "2026-07-06", value: 1_060_000_000 },
  { date: "2026-07-07", value: 760_000_000 },
  { date: "2026-07-08", value: 620_000_000 },
  { date: "2026-07-09", value: 750_000_000 },
  { date: "2026-07-10", value: 780_000_000 },
  { date: "2026-07-11", value: 820_000_000 },
  { date: "2026-07-12", value: 680_000_000 },
  { date: "2026-07-13", value: 760_000_000 },
  { date: "2026-07-14", value: 810_000_000 },
  { date: "2026-07-15", value: 950_000_000 },
  { date: "2026-07-16", value: 675_000_000 },
];

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

function chartPoints(chart: unknown, breakdownKey?: string): ActivityPoint[] {
  if (!Array.isArray(chart)) return [];
  return chart
    .map((row): ActivityPoint | null => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const timestamp = asNumber(row[0]);
      const rawValue = row[1];
      const value = breakdownKey && isRecord(rawValue)
        ? asNumber(rawValue[breakdownKey])
        : asNumber(rawValue);
      return timestamp === null || value === null ? null : { date: utcDate(timestamp), value };
    })
    .filter((point): point is ActivityPoint => point !== null)
    .slice(-HISTORY_DAYS);
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

  return chartPoints(payload.totalDataChartBreakdown, "Variational");
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

function mergeHistory(...sources: ActivityPoint[][]): ActivityPoint[] {
  const values = new Map<string, number>();
  for (const source of sources) {
    for (const point of source) values.set(point.date, point.value);
  }
  return [...values]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-HISTORY_DAYS);
}

export async function GET() {
  const [oiResult, observedVolumeResult, liveResult] = await Promise.allSettled([
    getDefiLlamaOpenInterest(),
    getObservedDailyVolume(),
    getCurrentVariationalStats(),
  ]);

  const openInterestHistory = oiResult.status === "fulfilled" ? oiResult.value : [];
  const observedVolumeHistory = observedVolumeResult.status === "fulfilled" ? observedVolumeResult.value : [];
  const live = liveResult.status === "fulfilled" ? liveResult.value : { volume24h: null, openInterest: null };
  const volumeHistory = withCurrentPoint(
    mergeHistory(INITIAL_VARIATIONAL_VOLUME_HISTORY, observedVolumeHistory),
    live.volume24h,
  );
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
