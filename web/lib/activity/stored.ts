import { asNumber } from "@/lib/dune";
import { loadDailyStats } from "@/lib/activity/daily-stats";
import { HISTORY_DAYS, type ActivityPoint, type ActivityResponse } from "@/lib/activity/types";

/**
 * The activity series for a protocol whose whole history we collected.
 *
 * Variational and TxFlow each have a loader of their own because each carries
 * something extra -- a verified export from before our collection started, a
 * trader count from an official dashboard. A protocol picked up later has
 * neither: its chart is exactly the rows the hourly worker has written, and
 * this is the one path that draws them.
 *
 * A protocol with nothing stored yet returns an empty series rather than
 * throwing, so its page renders the chart's own "no history yet" state instead
 * of an error -- on the first day, that is the truth.
 */
export async function loadStoredActivity(slug: string): Promise<ActivityResponse> {
  const rows = await loadDailyStats(slug);

  const series = (pick: (row: (typeof rows)[number]) => number | null): ActivityPoint[] =>
    rows
      .map((row) => ({ date: row.date, value: pick(row) }))
      .filter((point): point is ActivityPoint => point.value !== null)
      .slice(-HISTORY_DAYS);

  const volumeSeries = series((row) => asNumber(row.volume_24h_usd));
  const openInterestSeries = series((row) => asNumber(row.open_interest_usd));
  const traderSeries = series((row) => asNumber(row.unique_traders));

  return {
    asOf: new Date().toISOString(),
    days: HISTORY_DAYS,
    volume: {
      series: volumeSeries,
      observedDays: volumeSeries.length,
      latest24h: volumeSeries.at(-1)?.value ?? null,
    },
    openInterest: {
      series: openInterestSeries,
      observedDays: openInterestSeries.length,
      latest: openInterestSeries.at(-1)?.value ?? null,
    },
    // Only where the protocol publishes one; nothing but TxFlow does today.
    ...(traderSeries.length > 1
      ? {
          uniqueTraders: {
            series: traderSeries,
            observedDays: traderSeries.length,
            latest: traderSeries.at(-1)?.value ?? null,
          },
        }
      : {}),
  };
}
