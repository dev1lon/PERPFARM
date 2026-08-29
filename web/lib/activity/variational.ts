/**
 * Variational's activity series.
 *
 * Two sources, and neither is computed here:
 *
 *   * `venue_daily_stats` -- one stored row per day, written by the hourly
 *     worker from Variational's OWN published totals (its stats feed states
 *     both 24h volume and open interest), falling back to a sum of our
 *     per-market snapshots only where the venue answered nothing.
 *   * a verified daily export for the months before our collection started.
 *
 * It used to be three sources and three round trips per cache miss: a 180-day
 * aggregate over every stored snapshot, a DefiLlama call for the same history,
 * and a live call to the venue for today's point -- all three answering a chart
 * that moves once an hour. The aggregate is now done once by the worker, the
 * venue is asked by the worker, and DefiLlama is gone: the export below already
 * covers every day it used to fill.
 *
 * Open interest arrives in the protocol's own convention (gross), because that
 * is what the rollup stores. Nothing here rescales it.
 */
import { getPool } from "@/lib/db";
import { asNumber } from "@/lib/dune";
import { loadDailyStats, type DailyStatsRow } from "@/lib/activity/daily-stats";
import { oiDisplayFactor } from "@/lib/route-model";
import { VARIATIONAL_ACTIVITY_BACKFILL } from "@/lib/variational-activity-backfill";
import { HISTORY_DAYS, type ActivityPoint, type ActivityResponse } from "@/lib/activity/types";

type DailyRow = Pick<DailyStatsRow, "date" | "volume_24h_usd" | "open_interest_usd">;

/**
 * The same daily points, summed from raw snapshots.
 *
 * Only used until the rollup table exists and has been filled. Migrations are
 * applied by hand on this project, so between a deploy and that command the
 * table is not there -- and a chart that quietly costs more for an hour is a
 * far better outcome than a chart that 502s.
 */
async function getObservedDaily(slug: string): Promise<DailyRow[]> {
  const { rows } = await getPool().query<DailyRow>(
    `WITH last_of_day AS (
       SELECT DISTINCT ON (s.market_id, (s.ts AT TIME ZONE 'UTC')::date)
              (s.ts AT TIME ZONE 'UTC')::date AS day,
              s.volume_24h_usd, s.open_interest_usd
       FROM volume_snapshots s
       JOIN markets m ON m.id = s.market_id
       JOIN venues v ON v.id = m.venue_id
       WHERE v.slug = $1 AND s.ts >= now() - make_interval(days => $2)
       ORDER BY s.market_id, (s.ts AT TIME ZONE 'UTC')::date, s.ts DESC
     )
     SELECT day::text AS date,
            SUM(volume_24h_usd) AS volume_24h_usd,
            SUM(open_interest_usd) * $3 AS open_interest_usd
     FROM last_of_day
     GROUP BY day
     ORDER BY day ASC`,
    [slug, HISTORY_DAYS, oiDisplayFactor(slug)],
  );
  return rows;
}

/** Stored rollup where it exists, the old aggregate where it does not yet. */
async function getDaily(slug: string): Promise<DailyRow[]> {
  try {
    const stored = await loadDailyStats(slug);
    if (stored.length > 0) return stored;
  } catch (error) {
    console.error("[activity] venue_daily_stats unavailable, summing snapshots instead --", error);
  }
  return getObservedDaily(slug);
}

function column(rows: DailyRow[], metric: "volume" | "openInterest"): ActivityPoint[] {
  return rows
    .map((row) => ({
      date: row.date,
      value: asNumber(metric === "volume" ? row.volume_24h_usd : row.open_interest_usd),
    }))
    .filter((point): point is ActivityPoint => point.value !== null)
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
  const stored = await getDaily("variational");
  const observedVolume = column(stored, "volume");
  const observedOi = column(stored, "openInterest");

  const volumeSeries = mergeHistory(getVerifiedBackfill("volume"), observedVolume);
  const openInterestSeries = mergeHistory(getVerifiedBackfill("openInterest"), observedOi);

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
      observedDays: observedVolume.length,
      latest24h: volumeSeries.at(-1)?.value ?? null,
    },
    openInterest: {
      series: openInterestSeries,
      observedDays: observedOi.length,
      latest: openInterestSeries.at(-1)?.value ?? null,
    },
  };
}
