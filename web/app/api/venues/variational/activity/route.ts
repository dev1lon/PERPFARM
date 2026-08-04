import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const VARIATIONAL_STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const VARIATIONAL_OMNI_URL = "https://www.variational.io/omni";
// Official Omni site, checked on 2026-07-17. It is a lower bound ("50K+")
// rather than an exact account count.
const OFFICIAL_UNIQUE_TRADERS_FLOOR = 50_000;
// How far back real first-party/DefiLlama observations may reach.
const HISTORY_DAYS = 180;
const DUNE_RESULTS_URL = "https://api.dune.com/api/v1/query";

function defiLlamaUrl(path: string): string {
  const apiKey = process.env.DEFILLAMA_API_KEY;
  return apiKey ? `https://pro-api.llama.fi/${apiKey}${path}` : `https://api.llama.fi${path}`;
}

// DefiLlama's open-interest history is available on the free tier (unlike its
// daily-volume history, which moved to Pro). We use it to backfill OI for the
// days our own snapshots don't cover yet -- real figures, not a traced image.
const DEFILLAMA_OPEN_INTEREST_URL = defiLlamaUrl(
  "/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false",
);

// Next.js requires a literal here; expressions such as `60 * 60` are not
// accepted as route-segment config during the production build.
export const revalidate = 3600;

type ActivityPoint = { date: string; value: number };
type DuneUserSeries = {
  points: ActivityPoint[];
  metric: "uniqueTraders" | "activeAddresses";
};

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
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`DefiLlama returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.totalDataChartBreakdown)) {
    throw new Error("DefiLlama did not return an open-interest history");
  }
  return chartPoints(payload.totalDataChartBreakdown, "Variational");
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
         AND snapshot.ts >= now() - interval '${HISTORY_DAYS} days'
     )
     SELECT day::text AS date, SUM(metric) AS value
     FROM latest_market_snapshot
     WHERE row_number = 1 AND metric IS NOT NULL
     GROUP BY day
     ORDER BY day ASC`,
  );

  // OI is stored one-sided (users' long+short). Omni, DefiLlama and the live
  // stats all report gross OI (user side + OLP counterparty), so double it to
  // sit on the same scale as the rest of the series and avoid a seam where our
  // snapshots meet the DefiLlama/live points. Same convention as pair rankings.
  const scale = column === "open_interest_usd" ? 2 : 1;
  return rows
    .map((row) => ({ date: row.date, value: asNumber(row.value) }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .map((point) => ({ date: point.date, value: point.value * scale }))
    .slice(-HISTORY_DAYS);
}

async function getCurrentVariationalStats(): Promise<{ volume24h: number | null; openInterest: number | null }> {
  const response = await fetch(VARIATIONAL_STATS_URL, {
    next: { revalidate: 5 * 60 },
    signal: AbortSignal.timeout(6_000),
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });
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
    const response = await fetch(VARIATIONAL_OMNI_URL, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(6_000),
    });
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
 * Configure a query from Variational's official dashboard that returns a
 * date/day plus either unique traders or daily active-address columns. Until
 * then, retain only Omni's published 50K+ current snapshot rather than
 * inventing user history.
 */
async function getDuneUniqueTraders(): Promise<DuneUserSeries | null> {
  const apiKey = process.env.DUNE_API_KEY;
  const queryId = process.env.DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID;
  if (!apiKey || !queryId) return null;

  try {
    const response = await fetch(`${DUNE_RESULTS_URL}/${encodeURIComponent(queryId)}/results?limit=100`, {
      headers: { "X-Dune-Api-Key": apiKey },
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const rows = isRecord(payload) && isRecord(payload.result) && Array.isArray(payload.result.rows)
      ? payload.result.rows
      : [];
    const byDate = new Map<string, number>();
    let metric: DuneUserSeries["metric"] = "uniqueTraders";
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const rawDate = valueFromDuneRow(row, ["date", "day", "blockdate", "period"]);
      const uniqueCount = asNumber(valueFromDuneRow(row, ["uniquetraders", "uniqueusers", "traders", "users"]));
      const activeCount = asNumber(valueFromDuneRow(row, ["activeaddresses", "activeusers", "addresscount"]));
      const newAddresses = asNumber(valueFromDuneRow(row, ["newaddress", "newaddresses"]));
      const returningAddresses = asNumber(valueFromDuneRow(row, ["returningaddress", "returningaddresses"]));
      const combinedActive = activeCount ?? (
        newAddresses !== null || returningAddresses !== null
          ? (newAddresses ?? 0) + (returningAddresses ?? 0)
          : null
      );
      const value = uniqueCount ?? combinedActive;
      if (uniqueCount === null && combinedActive !== null) metric = "activeAddresses";
      const parsedDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
      const date = Number.isNaN(parsedDate.valueOf()) ? null : parsedDate.toISOString().slice(0, 10);
      if (date !== null && value !== null && value >= 0) byDate.set(date, value);
    }
    const points = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    return points.length > 0 ? { points: points.slice(-HISTORY_DAYS), metric } : null;
  } catch {
    return null;
  }
}

// Later sources win per date: DefiLlama forms the base OI history, our own
// snapshots overwrite it on the days we have first-party data for.
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

function withCurrentPoint(history: ActivityPoint[], value: number | null): ActivityPoint[] {
  if (value === null) return history;
  const today = new Date().toISOString().slice(0, 10);
  const withoutToday = history.filter((point) => point.date !== today);
  return [...withoutToday, { date: today, value }].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
}

export async function GET() {
  const [defiLlamaOiResult, observedVolumeResult, observedOiResult, liveResult, uniqueTradersResult, duneUniqueTradersResult] =
    await Promise.allSettled([
      getDefiLlamaOpenInterest(),
      getObservedDaily("volume_24h_usd"),
      getObservedDaily("open_interest_usd"),
      getCurrentVariationalStats(),
      getOfficialUniqueTraders(),
      getDuneUniqueTraders(),
    ]);

  const defiLlamaOiHistory = defiLlamaOiResult.status === "fulfilled" ? defiLlamaOiResult.value : [];
  const observedVolumeHistory = observedVolumeResult.status === "fulfilled" ? observedVolumeResult.value : [];
  const observedOiHistory = observedOiResult.status === "fulfilled" ? observedOiResult.value : [];
  const live = liveResult.status === "fulfilled" ? liveResult.value : { volume24h: null, openInterest: null };
  // Volume past days: our own snapshots only. OI past days: DefiLlama base,
  // overwritten by our snapshots where we have them. Both: today from Variational.
  const volumeHistory = withCurrentPoint(observedVolumeHistory, live.volume24h);
  const openInterest = withCurrentPoint(mergeHistory(defiLlamaOiHistory, observedOiHistory), live.openInterest);
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
      series: duneUniqueTraders?.points ?? (uniqueTraders === null ? [] : [{ date: new Date().toISOString().slice(0, 10), value: uniqueTraders }]),
      latest: duneUniqueTraders?.points.at(-1)?.value ?? uniqueTraders,
      source: duneUniqueTraders ? "dune" : "official-site",
      metric: duneUniqueTraders?.metric ?? "uniqueTraders",
    },
  });
}
