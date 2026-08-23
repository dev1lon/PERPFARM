/**
 * Variational's activity series.
 *
 * Three sources, in increasing order of authority: DefiLlama's open-interest
 * history fills the days before our cron existed, a verified daily export fills
 * the rest, and our own saved snapshots win wherever they exist. Historical
 * charts show only API or saved observations -- screenshots are never turned
 * into generated data.
 *
 * Today's point is the venue's own live figure, which is the authority on it.
 * It used to be fetched fresh on every page load; now the endpoint around it is
 * cached for the hour, so the venue is asked once an hour rather than once per
 * visitor.
 */
import { getPool } from "@/lib/db";
import { asNumber } from "@/lib/dune";
import { oiDisplayFactor } from "@/lib/route-model";
import { VARIATIONAL_ACTIVITY_BACKFILL } from "@/lib/variational-activity-backfill";
import { HISTORY_DAYS, type ActivityPoint, type ActivityResponse } from "@/lib/activity/types";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

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

/**
 * Today's point, from the venue's own stats feed.
 *
 * Our snapshots know today too, but the venue's number is the authoritative one
 * and is what the chart showed before. Cached for an hour rather than the five
 * minutes it once used: the endpoint around it is now held for an hour anyway,
 * so a shorter window here would only have been fetched and thrown away.
 */
async function getCurrentStats(): Promise<{ volume24h: number | null; openInterest: number | null }> {
  const response = await fetch(STATS_URL, {
    next: { revalidate: 60 * 60 },
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

function getVerifiedBackfill(metric: "volume" | "openInterest"): ActivityPoint[] {
  return VARIATIONAL_ACTIVITY_BACKFILL
    .map((point) => ({ date: point.date, value: metric === "volume" ? point.volume : point.openInterest }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .slice(-HISTORY_DAYS);
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

/** Replace today with the venue's own reading; history is left as observed. */
function withCurrentPoint(history: ActivityPoint[], value: number | null): ActivityPoint[] {
  if (value === null) return history;
  const today = new Date().toISOString().slice(0, 10);
  return [...history.filter((point) => point.date !== today), { date: today, value }]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-HISTORY_DAYS);
}

export async function loadVariationalActivity(): Promise<ActivityResponse> {
  const [defiLlamaOi, observedVolume, observedOi, live] = await Promise.allSettled([
    getDefiLlamaOpenInterest(),
    getObservedDaily("volume_24h_usd"),
    getObservedDaily("open_interest_usd"),
    getCurrentStats(),
  ]);

  const defiLlamaOiHistory = defiLlamaOi.status === "fulfilled" ? defiLlamaOi.value : [];
  const observedVolumeHistory = observedVolume.status === "fulfilled" ? observedVolume.value : [];
  const observedOiHistory = observedOi.status === "fulfilled" ? observedOi.value : [];
  const current = live.status === "fulfilled" ? live.value : { volume24h: null, openInterest: null };

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

  // The headline figure is the newest point of the series it heads, so the
  // number and the chart under it can never disagree -- they used to come from
  // different feeds, and did.
  return {
    asOf: new Date().toISOString(),
    days: HISTORY_DAYS,
    volume: {
      series: volumeSeries,
      observedDays: observedVolumeHistory.length,
      latest24h: current.volume24h ?? volumeSeries.at(-1)?.value ?? null,
    },
    openInterest: {
      series: openInterestSeries,
      observedDays: observedOiHistory.length,
      latest: current.openInterest ?? openInterestSeries.at(-1)?.value ?? null,
    },
  };
}
