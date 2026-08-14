/**
 * Variational's activity series.
 *
 * Four sources, in increasing order of authority: DefiLlama's open-interest
 * history fills the days before our cron existed, a verified daily export fills
 * the rest, our own saved snapshots win wherever they exist, and the venue's
 * live stats replace today's provisional point. Historical charts show only API
 * or saved observations -- screenshots are never turned into generated data.
 */
import { getPool } from "@/lib/db";
import { asNumber, fetchDuneRows, valueFromDuneRow } from "@/lib/dune";
import { oiDisplayFactor } from "@/lib/route-model";
import { VARIATIONAL_ACTIVITY_BACKFILL } from "@/lib/variational-activity-backfill";
import { HISTORY_DAYS, type ActivityPoint, type ActivityResponse } from "@/lib/activity/types";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const OMNI_URL = "https://www.variational.io/omni";
// Official Omni site, checked on 2026-07-17. A lower bound ("50K+"), not an
// exact account count.
const OFFICIAL_UNIQUE_TRADERS_FLOOR = 50_000;
// The public "Variational: Active Addresses" query. The environment value stays
// an override, so the chart works when only the API key is configured.
const DEFAULT_DUNE_USERS_QUERY_ID = "5754146";

function defiLlamaUrl(path: string): string {
  const apiKey = process.env.DEFILLAMA_API_KEY;
  return apiKey ? `https://pro-api.llama.fi/${apiKey}${path}` : `https://api.llama.fi${path}`;
}

// DefiLlama's open-interest history is on the free tier (unlike its daily-volume
// history, which moved to Pro).
const DEFILLAMA_OPEN_INTEREST_URL = defiLlamaUrl(
  "/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false",
);

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
      const value = breakdownKey && isRecord(rawValue) ? asNumber(rawValue[breakdownKey]) : asNumber(rawValue);
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
 * Protocol-wide daily series from our own hourly snapshots.
 *
 * `volume_24h_usd` and `open_interest_usd` are both point-in-time figures, so
 * keep the last snapshot per market per UTC day and sum across markets -- never
 * sum the hourly samples, which would multiply the same day many times over.
 * `column` is a fixed literal, not user input.
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
         AND snapshot.ts >= now() - make_interval(days => $1)
     )
     SELECT day::text AS date, SUM(metric) AS value
     FROM latest_market_snapshot
     WHERE row_number = 1 AND metric IS NOT NULL
     GROUP BY day
     ORDER BY day ASC`,
    [HISTORY_DAYS],
  );

  // Stored OI is one side; Omni, DefiLlama and the live stats all report gross
  // OI, so normalise to that scale and avoid a seam where the series meet.
  const scale = column === "open_interest_usd" ? oiDisplayFactor("variational") : 1;
  return rows
    .map((row) => ({ date: row.date, value: asNumber(row.value) }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .map((point) => ({ date: point.date, value: point.value * scale }))
    .slice(-HISTORY_DAYS);
}

async function getCurrentStats(): Promise<{ volume24h: number | null; openInterest: number | null }> {
  const response = await fetch(STATS_URL, {
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
 * Omni's market API exposes no trader count, but its public page publishes the
 * aggregate. Retained as a first-party snapshot rather than manufacturing a
 * history from it.
 */
async function getOfficialUniqueTraders(): Promise<number | null> {
  try {
    const response = await fetch(OMNI_URL, { next: { revalidate: 60 * 60 }, signal: AbortSignal.timeout(6_000) });
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

function getVerifiedBackfill(metric: "volume" | "openInterest"): ActivityPoint[] {
  return VARIATIONAL_ACTIVITY_BACKFILL
    .map((point) => ({ date: point.date, value: metric === "volume" ? point.volume : point.openInterest }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .slice(-HISTORY_DAYS);
}

/**
 * Traders from Dune, when a key is configured.
 *
 * Column lookup goes through lib/dune, which prefers an EXACT column-name match
 * over a substring one. A local copy here used to accept either and let key
 * order decide, which is how a cumulative `total_*` column can be plotted as a
 * daily value -- the same bug the shared helper exists to prevent.
 */
async function getDuneUniqueTraders(): Promise<{ points: ActivityPoint[]; metric: "uniqueTraders" | "activeAddresses" } | null> {
  const queryId = process.env.DUNE_VARIATIONAL_UNIQUE_TRADERS_QUERY_ID ?? DEFAULT_DUNE_USERS_QUERY_ID;
  try {
    const rows = await fetchDuneRows(queryId);
    if (rows.length === 0) return null;
    const dateNames = ["date", "day", "blockdate", "period"];
    const hasDateColumn = rows.some((row) => valueFromDuneRow(row, dateNames) !== undefined);
    const byDate = new Map<string, number>();
    let metric: "uniqueTraders" | "activeAddresses" = "uniqueTraders";

    for (const row of rows) {
      const rawDate = valueFromDuneRow(row, dateNames);
      const uniqueCount = asNumber(valueFromDuneRow(row, ["uniquetraders", "uniqueusers", "traders", "users"]));
      const activeCount = asNumber(
        valueFromDuneRow(row, ["activeaddresses", "activeusers", "addresscount", "currentliveaddresses", "liveaddresses"]),
      );
      const newAddresses = asNumber(valueFromDuneRow(row, ["newaddress", "newaddresses"]));
      const returningAddresses = asNumber(valueFromDuneRow(row, ["returningaddress", "returningaddresses"]));
      const combinedActive = activeCount ?? (
        newAddresses !== null || returningAddresses !== null ? (newAddresses ?? 0) + (returningAddresses ?? 0) : null
      );
      const value = uniqueCount ?? combinedActive;
      if (uniqueCount === null && combinedActive !== null) metric = "activeAddresses";

      const parsedDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
      // The default query is a current-address snapshot rather than a daily
      // series: one row, no date. Tag it with today so the exact live count
      // shows instead of falling back to the published 50K+.
      const date = hasDateColumn
        ? (Number.isNaN(parsedDate.valueOf()) ? null : parsedDate.toISOString().slice(0, 10))
        : rows.length === 1
          ? new Date().toISOString().slice(0, 10)
          : null;
      if (date !== null && value !== null && value >= 0) byDate.set(date, value);
    }

    const points = [...byDate]
      .map(([date, value]) => ({ date, value }))
      .sort((left, right) => left.date.localeCompare(right.date));
    return points.length > 0 ? { points: points.slice(-HISTORY_DAYS), metric } : null;
  } catch {
    return null;
  }
}

/** Later sources win per date; each series keeps one point per day. */
function mergeHistory(...sources: ActivityPoint[][]): ActivityPoint[] {
  const values = new Map<string, number>();
  for (const source of sources) {
    for (const point of source) values.set(point.date, point.value);
  }
  return [...values]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-HISTORY_DAYS);
}

function withCurrentPoint(history: ActivityPoint[], value: number | null): ActivityPoint[] {
  if (value === null) return history;
  const today = new Date().toISOString().slice(0, 10);
  return [...history.filter((point) => point.date !== today), { date: today, value }]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-HISTORY_DAYS);
}

export async function loadVariationalActivity(): Promise<ActivityResponse> {
  const [defiLlamaOi, observedVolume, observedOi, live, officialTraders, duneTraders] = await Promise.allSettled([
    getDefiLlamaOpenInterest(),
    getObservedDaily("volume_24h_usd"),
    getObservedDaily("open_interest_usd"),
    getCurrentStats(),
    getOfficialUniqueTraders(),
    getDuneUniqueTraders(),
  ]);

  const defiLlamaOiHistory = defiLlamaOi.status === "fulfilled" ? defiLlamaOi.value : [];
  const observedVolumeHistory = observedVolume.status === "fulfilled" ? observedVolume.value : [];
  const observedOiHistory = observedOi.status === "fulfilled" ? observedOi.value : [];
  const current = live.status === "fulfilled" ? live.value : { volume24h: null, openInterest: null };
  const uniqueTraders = officialTraders.status === "fulfilled"
    ? officialTraders.value ?? OFFICIAL_UNIQUE_TRADERS_FLOOR
    : OFFICIAL_UNIQUE_TRADERS_FLOOR;
  const dune = duneTraders.status === "fulfilled" ? duneTraders.value : null;

  const volumeSeries = withCurrentPoint(
    mergeHistory(getVerifiedBackfill("volume"), observedVolumeHistory),
    current.volume24h,
  );
  const openInterestSeries = withCurrentPoint(
    mergeHistory(defiLlamaOiHistory, getVerifiedBackfill("openInterest"), observedOiHistory),
    current.openInterest,
  );

  if (volumeSeries.length === 0 && openInterestSeries.length === 0) {
    throw new Error("Could not load Variational activity data");
  }

  return {
    asOf: new Date().toISOString(),
    days: HISTORY_DAYS,
    volume: { series: volumeSeries, observedDays: observedVolumeHistory.length, latest24h: current.volume24h },
    openInterest: { series: openInterestSeries, observedDays: observedOiHistory.length, latest: current.openInterest },
    uniqueTraders: {
      series: dune?.points ?? (uniqueTraders === null ? [] : [{ date: new Date().toISOString().slice(0, 10), value: uniqueTraders }]),
      latest: dune?.points.at(-1)?.value ?? uniqueTraders,
      source: dune ? "dune" : "official-site",
      metric: dune?.metric ?? "uniqueTraders",
    },
  };
}
