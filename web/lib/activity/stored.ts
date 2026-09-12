import { asNumber } from "@/lib/dune";
import { loadDailyStats } from "@/lib/activity/daily-stats";
import { DEFILLAMA_ACTIVITY_HISTORY } from "@/lib/activity/defillama-history";
import { mergeHistory } from "@/lib/activity/merge";
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
 * Under those rows sits the venue's DefiLlama export for the months before we
 * started, where one was supplied -- otherwise a venue picked up last week drew
 * a two-point chart of a market that has traded for half a year. Our own day
 * always wins over the export's (see `mergeHistory`).
 *
 * A protocol with neither returns an empty series rather than throwing, so its
 * page renders the chart's own "no history yet" state instead of an error --
 * on the first day, that is the truth.
 */
/** The supplied DefiLlama days for one venue, empty where none were given. */
function exported(slug: string, metric: "volume" | "openInterest"): ActivityPoint[] {
  return (DEFILLAMA_ACTIVITY_HISTORY[slug] ?? [])
    .map(([date, volume, openInterest]) => ({ date, value: metric === "volume" ? volume : openInterest }))
    .filter((point): point is ActivityPoint => point.value !== null)
    .slice(-HISTORY_DAYS);
}

export async function loadStoredActivity(slug: string): Promise<ActivityResponse> {
  const rows = await loadDailyStats(slug);

  const series = (pick: (row: (typeof rows)[number]) => number | null): ActivityPoint[] =>
    rows
      .map((row) => ({ date: row.date, value: pick(row) }))
      .filter((point): point is ActivityPoint => point.value !== null)
      .slice(-HISTORY_DAYS);

  const observedVolume = series((row) => asNumber(row.volume_24h_usd));
  const observedOpenInterest = series((row) => asNumber(row.open_interest_usd));
  const traderSeries = series((row) => asNumber(row.unique_traders));

  const volumeSeries = mergeHistory(exported(slug, "volume"), observedVolume);
  const openInterestSeries = mergeHistory(exported(slug, "openInterest"), observedOpenInterest);

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
      observedDays: observedOpenInterest.length,
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
