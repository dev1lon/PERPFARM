/**
 * TxFlow's activity series.
 *
 * Dune is TxFlow's official analytics source. The hourly worker now copies what
 * that dashboard publishes into `venue_daily_stats`, and this reads it back --
 * so a page load touches Postgres and nothing else.
 *
 * The Dune path below is the fallback, unchanged, for as long as the sync has
 * not run (no API key on the worker yet) or has fallen behind. Beneath even
 * that sits a hand-pasted CSV, for when Dune answers nothing at all.
 *
 * What must never happen is mixing them: two series measured differently and
 * joined at the seam is how a $195 reading from launch day was once drawn as
 * today's $18M open interest. One source per chart, whole.
 */
import { asNumber, duneRowDate, duneSeries, fetchDuneRows, latestDuneValue, valueFromDuneRow } from "@/lib/dune";
import { TXFLOW_ACTIVITY_HISTORY } from "@/lib/txflow-activity-history";
import { isFresh, loadDailyStats, type DailyStatsRow } from "@/lib/activity/daily-stats";
import { HISTORY_DAYS, type ActivityPoint, type ActivityResponse } from "@/lib/activity/types";

/** Full daily series. */
const DUNE_VOLUME_HISTORY_QUERY_ID = "6679693";
const DUNE_OI_QUERY_ID = "6678737";
const DUNE_NEW_TRADERS_QUERY_ID = "6679496";
/** Single-value cards, refreshed every 6h on Dune. */
const DUNE_VOLUME_24H_QUERY_ID = "6678797";
const DUNE_TOTAL_TRADERS_QUERY_ID = "6678847";

/**
 * Traders on the protocol, day by day.
 *
 * Dune publishes NEW traders per day, not the running total, so the curve is
 * accumulated here -- and only from those daily counts. It used to be rebased
 * so the last point met the separate all-time card; the two queries refresh at
 * different times, so that offset was spread backwards over history, and every
 * past day was drawn a few hundred traders too high. The card is used for the
 * headline number only, where a difference between two readings is honest.
 */
function cumulativeNewTraderSeries(rows: Record<string, unknown>[]): ActivityPoint[] {
  const daily = new Map<string, number>();
  for (const row of rows) {
    const date = duneRowDate(row);
    const value = asNumber(valueFromDuneRow(row, ["newtradersdaily", "newtraders", "newusers", "newaddresses"]));
    if (date !== null && value !== null) daily.set(date, value);
  }
  let running = 0;
  return [...daily]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value: (running += value) }))
    .slice(-HISTORY_DAYS);
}

/** The stored series, when the worker has copied the dashboard recently. */
function fromStoredRows(rows: DailyStatsRow[]): ActivityResponse {
  const series = (pick: (row: DailyStatsRow) => number | null): ActivityPoint[] =>
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
    volume: { series: volumeSeries, observedDays: volumeSeries.length, latest24h: volumeSeries.at(-1)?.value ?? null },
    openInterest: { series: openInterestSeries, observedDays: openInterestSeries.length, latest: openInterestSeries.at(-1)?.value ?? null },
    ...(traderSeries.length > 1
      ? { uniqueTraders: { series: traderSeries, observedDays: traderSeries.length, latest: traderSeries.at(-1)?.value ?? null } }
      : {}),
  };
}

export async function loadTxflowActivity(): Promise<ActivityResponse> {
  // Only rows the Dune sync wrote: our own summed rows for TxFlow measure
  // something else over a shorter history, and swapping them under a published
  // chart would change its numbers without saying so.
  const stored = await loadDailyStats("txflow", { sources: ["dune"] }).catch((error: unknown) => {
    console.error("[activity] stored TxFlow series unavailable, asking Dune --", error);
    return [] as DailyStatsRow[];
  });
  if (isFresh(stored)) return fromStoredRows(stored);

  return loadTxflowActivityFromDune();
}

async function loadTxflowActivityFromDune(): Promise<ActivityResponse> {
  const [volumeHistoryRows, volume24hRows, oiRows, totalTraderRows, newTraderRows] = await Promise.all([
    fetchDuneRows(DUNE_VOLUME_HISTORY_QUERY_ID),
    fetchDuneRows(DUNE_VOLUME_24H_QUERY_ID),
    fetchDuneRows(DUNE_OI_QUERY_ID),
    fetchDuneRows(DUNE_TOTAL_TRADERS_QUERY_ID),
    fetchDuneRows(DUNE_NEW_TRADERS_QUERY_ID),
  ]);

  // `volume` is the daily figure; the same query also carries a cumulative
  // `total_volume`, which must never be plotted as a daily bar.
  const duneVolume = duneSeries(volumeHistoryRows, ["volume"], HISTORY_DAYS);
  const duneOi = duneSeries(oiRows, ["totaloilatest1h", "totaloi", "openinterest", "oi"], HISTORY_DAYS);

  const volumeSeries = duneVolume.length > 0
    ? duneVolume
    : TXFLOW_ACTIVITY_HISTORY.map((point) => ({ date: point.date, value: point.volume })).slice(-HISTORY_DAYS);
  const openInterestSeries = duneOi.length > 0
    ? duneOi
    : TXFLOW_ACTIVITY_HISTORY
        .filter((point): point is typeof point & { openInterest: number } => point.openInterest !== null)
        .map((point) => ({ date: point.date, value: point.openInterest }))
        .slice(-HISTORY_DAYS);

  // The headline number comes from the 6h card, falling back to the newest point
  // of the series so the figure and the chart can never contradict each other.
  const volumeLatest = latestDuneValue(volume24hRows, ["totalvolume24h", "volume24h", "totalvolume"])
    ?? volumeSeries.at(-1)?.value
    ?? null;
  const totalTraders = latestDuneValue(totalTraderRows, ["totaltraderslatestday", "totaltraders", "uniquetraders", "uniqueusers"]);
  const traderSeries = cumulativeNewTraderSeries(newTraderRows);
  // A distinct-trader count only ever rises, so the higher of the two readings
  // is simply the fresher one -- whichever of the two Dune queries ran last.
  const tradersLatest = Math.max(totalTraders ?? 0, traderSeries.at(-1)?.value ?? 0) || null;

  if (volumeSeries.length === 0 && openInterestSeries.length === 0) {
    throw new Error("Could not load TxFlow activity");
  }

  return {
    asOf: new Date().toISOString(),
    days: HISTORY_DAYS,
    volume: { series: volumeSeries, observedDays: volumeSeries.length, latest24h: volumeLatest },
    openInterest: { series: openInterestSeries, observedDays: openInterestSeries.length, latest: openInterestSeries.at(-1)?.value ?? null },
    // Omitted rather than sent empty when Dune is unavailable (no API key on a
    // preview deploy): the chart shows the tab only for a real series, and an
    // empty one would offer a tab that opens onto nothing.
    ...(traderSeries.length > 1
      ? { uniqueTraders: { series: traderSeries, observedDays: traderSeries.length, latest: tradersLatest } }
      : {}),
  };
}
