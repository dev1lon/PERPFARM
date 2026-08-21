/**
 * Variational's activity series.
 *
 * Three sources, in increasing order of authority: DefiLlama's open-interest
 * history fills the days before our cron existed, a verified daily export fills
 * the rest, and our own saved snapshots win wherever they exist. Historical
 * charts show only API or saved observations -- screenshots are never turned
 * into generated data.
 *
 * Today's point comes from OUR OWN hourly snapshots, not from the venue's live
 * stats feed. It used to be fetched per page load, five minutes fresh, to move a
 * dot on a 180-day chart by a fraction of a pixel. Reading it from the cron's
 * own rows costs nothing, moves once an hour, and means the chart can be cached
 * for that hour instead of being rebuilt for every visitor.
 */
import { getPool } from "@/lib/db";
import { asNumber } from "@/lib/dune";
import { oiDisplayFactor } from "@/lib/route-model";
import { VARIATIONAL_ACTIVITY_BACKFILL } from "@/lib/variational-activity-backfill";
import { HISTORY_DAYS, type ActivityPoint, type ActivityResponse } from "@/lib/activity/types";

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

export async function loadVariationalActivity(): Promise<ActivityResponse> {
  const [defiLlamaOi, observedVolume, observedOi] = await Promise.allSettled([
    getDefiLlamaOpenInterest(),
    getObservedDaily("volume_24h_usd"),
    getObservedDaily("open_interest_usd"),
  ]);

  const defiLlamaOiHistory = defiLlamaOi.status === "fulfilled" ? defiLlamaOi.value : [];
  const observedVolumeHistory = observedVolume.status === "fulfilled" ? observedVolume.value : [];
  const observedOiHistory = observedOi.status === "fulfilled" ? observedOi.value : [];

  const volumeSeries = mergeHistory(getVerifiedBackfill("volume"), observedVolumeHistory);
  const openInterestSeries = mergeHistory(
    defiLlamaOiHistory,
    getVerifiedBackfill("openInterest"),
    observedOiHistory,
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
      latest24h: volumeSeries.at(-1)?.value ?? null,
    },
    openInterest: {
      series: openInterestSeries,
      observedDays: observedOiHistory.length,
      latest: openInterestSeries.at(-1)?.value ?? null,
    },
  };
}
