import { NextResponse } from "next/server";
import { asNumber, duneSeries, fetchDuneRows, latestDuneValue, valueFromDuneRow, type ActivityPoint } from "@/lib/dune";
import { TXFLOW_ACTIVITY_HISTORY } from "@/lib/txflow-activity-history";

const HISTORY_DAYS = 180;
/** Full daily series. */
const DUNE_TXFLOW_VOLUME_HISTORY_QUERY_ID = "6679693";
const DUNE_TXFLOW_OI_QUERY_ID = "6678737";
const DUNE_TXFLOW_NEW_TRADERS_QUERY_ID = "6679496";
/** Single-value cards, refreshed every 6h on Dune. */
const DUNE_TXFLOW_VOLUME_24H_QUERY_ID = "6678797";
const DUNE_TXFLOW_TOTAL_TRADERS_QUERY_ID = "6678847";

/**
 * Dune is TxFlow's official analytics source and now supplies BOTH the history
 * and the current reading for every metric.
 *
 * It used to supply only the latest point, stitched onto a hand-pasted CSV.
 * Two series measured differently, joined at the seam, is how a $195 reading
 * from launch day ended up drawn as today's $18M open interest. One source per
 * chart: the CSV survives only as a fallback for when Dune returns nothing at
 * all (no API key on a preview deploy), and is never mixed in.
 */
export const revalidate = 3600;

function cumulativeNewTraderSeries(rows: Record<string, unknown>[], totalTraders: number | null): ActivityPoint[] {
  const daily = new Map<string, number>();
  for (const row of rows) {
    const rawDate = valueFromDuneRow(row, ["date", "day", "blockdate", "period"]);
    const parsed = new Date(String(rawDate));
    const value = asNumber(valueFromDuneRow(row, ["newtradersdaily", "newtraders", "newusers", "newaddresses"]));
    if (!Number.isNaN(parsed.valueOf()) && value !== null) daily.set(parsed.toISOString().slice(0, 10), value);
  }
  const ordered = [...daily].sort(([a], [b]) => a.localeCompare(b));
  // Daily new traders sum to exactly the all-time distinct total (5,397 as of
  // 2026-08-08), so the running curve lands on it rather than being rebased.
  const observedTotal = ordered.reduce((sum, [, value]) => sum + value, 0);
  let running = Math.max(0, (totalTraders ?? observedTotal) - observedTotal);
  return ordered.map(([date, value]) => ({ date, value: running += value })).slice(-HISTORY_DAYS);
}

export async function GET() {
  try {
    const [volumeHistoryRows, volume24hRows, oiRows, totalTraderRows, newTraderRows] = await Promise.all([
      fetchDuneRows(DUNE_TXFLOW_VOLUME_HISTORY_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_VOLUME_24H_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_OI_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_TOTAL_TRADERS_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_NEW_TRADERS_QUERY_ID),
    ]);

    // `volume` is the daily figure; the same query also carries a cumulative
    // `total_volume`, which must never be plotted as a daily bar.
    const duneVolume = duneSeries(volumeHistoryRows, ["volume"], HISTORY_DAYS);
    const duneOi = duneSeries(oiRows, ["totaloilatest1h", "totaloi", "openinterest", "oi"], HISTORY_DAYS);

    const volumeHistory = duneVolume.length > 0
      ? duneVolume
      : TXFLOW_ACTIVITY_HISTORY.map((point) => ({ date: point.date, value: point.volume })).slice(-HISTORY_DAYS);
    const oiHistory = duneOi.length > 0
      ? duneOi
      : TXFLOW_ACTIVITY_HISTORY
          .filter((point): point is typeof point & { openInterest: number } => point.openInterest !== null)
          .map((point) => ({ date: point.date, value: point.openInterest }))
          .slice(-HISTORY_DAYS);

    // Headline numbers come from the 6h cards, falling back to the newest point
    // of the series so the figure and the chart can never contradict each other.
    const volumeLatest = latestDuneValue(volume24hRows, ["totalvolume24h", "volume24h", "totalvolume"]) ?? volumeHistory.at(-1)?.value ?? null;
    const oiLatest = oiHistory.at(-1)?.value ?? null;
    const totalTraders = latestDuneValue(totalTraderRows, ["totaltraderslatestday", "totaltraders", "uniquetraders", "uniqueusers"]);
    const traderSeries = cumulativeNewTraderSeries(newTraderRows, totalTraders);

    if (volumeHistory.length === 0 && oiHistory.length === 0) throw new Error("TxFlow activity is unavailable");

    return NextResponse.json({
      asOf: new Date().toISOString(),
      days: HISTORY_DAYS,
      volume: {
        series: volumeHistory,
        observedDays: volumeHistory.length,
        latest24h: volumeLatest,
      },
      openInterest: {
        series: oiHistory,
        latest: oiLatest,
      },
      uniqueTraders: {
        series: traderSeries.length > 0 ? traderSeries : (totalTraders === null ? [] : [{ date: new Date().toISOString().slice(0, 10), value: totalTraders }]),
        latest: totalTraders,
        source: "dune",
        metric: "uniqueTraders",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load TxFlow activity" }, { status: 502 });
  }
}
