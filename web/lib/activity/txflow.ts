/**
 * TxFlow's activity series.
 *
 * Dune is TxFlow's official analytics source and supplies BOTH the history and
 * the current reading for every metric.
 *
 * It used to supply only the latest point, stitched onto a hand-pasted CSV. Two
 * series measured differently, joined at the seam, is how a $195 reading from
 * launch day ended up drawn as today's $18M open interest. One source per chart:
 * the CSV survives only as a fallback for when Dune returns nothing at all (no
 * API key on a preview deploy), and is never mixed in.
 */
import { duneSeries, fetchDuneRows, latestDuneValue } from "@/lib/dune";
import { TXFLOW_ACTIVITY_HISTORY } from "@/lib/txflow-activity-history";
import { HISTORY_DAYS, type ActivityResponse } from "@/lib/activity/types";

/** Full daily series. */
const DUNE_VOLUME_HISTORY_QUERY_ID = "6679693";
const DUNE_OI_QUERY_ID = "6678737";
/** Single-value card, refreshed every 6h on Dune. */
const DUNE_VOLUME_24H_QUERY_ID = "6678797";

export async function loadTxflowActivity(): Promise<ActivityResponse> {
  const [volumeHistoryRows, volume24hRows, oiRows] = await Promise.all([
    fetchDuneRows(DUNE_VOLUME_HISTORY_QUERY_ID),
    fetchDuneRows(DUNE_VOLUME_24H_QUERY_ID),
    fetchDuneRows(DUNE_OI_QUERY_ID),
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

  if (volumeSeries.length === 0 && openInterestSeries.length === 0) {
    throw new Error("Could not load TxFlow activity");
  }

  return {
    asOf: new Date().toISOString(),
    days: HISTORY_DAYS,
    volume: { series: volumeSeries, observedDays: volumeSeries.length, latest24h: volumeLatest },
    openInterest: { series: openInterestSeries, observedDays: openInterestSeries.length, latest: openInterestSeries.at(-1)?.value ?? null },
  };
}
