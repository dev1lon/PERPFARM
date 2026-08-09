import { NextResponse } from "next/server";
import { asNumber, fetchDuneRows, latestDuneReading, latestDuneValue, valueFromDuneRow, withCurrentPoint, type ActivityPoint } from "@/lib/dune";
import { TXFLOW_ACTIVITY_HISTORY } from "@/lib/txflow-activity-history";

const HISTORY_DAYS = 180;
const DUNE_TXFLOW_VOLUME_24H_QUERY_ID = "6678797";
const DUNE_TXFLOW_OI_QUERY_ID = "6678737";
const DUNE_TXFLOW_TOTAL_TRADERS_QUERY_ID = "6678847";
const DUNE_TXFLOW_NEW_TRADERS_QUERY_ID = "6679496";

// Dune is TxFlow's official analytics source. The supplied daily CSV keeps
// history complete; all current headline readings come from Dune, never from
// an expensive client-side aggregation of every listed market.
export const revalidate = 3600;

function cumulativeNewTraderSeries(rows: Record<string, unknown>[], totalTraders: number | null): ActivityPoint[] {
  const daily = new Map<string, number>();
  for (const row of rows) {
    const rawDate = valueFromDuneRow(row, ["date", "day", "blockdate", "period"]);
    const parsed = new Date(String(rawDate));
    const value = asNumber(valueFromDuneRow(row, ["newtraders", "newusers", "newaddresses"]));
    if (!Number.isNaN(parsed.valueOf()) && value !== null) daily.set(parsed.toISOString().slice(0, 10), value);
  }
  const ordered = [...daily].sort(([a], [b]) => a.localeCompare(b));
  const observedTotal = ordered.reduce((sum, [, value]) => sum + value, 0);
  let running = Math.max(0, (totalTraders ?? observedTotal) - observedTotal);
  return ordered.map(([date, value]) => ({ date, value: running += value })).slice(-HISTORY_DAYS);
}

export async function GET() {
  try {
    const [volumeRows, oiRows, totalTraderRows, newTraderRows] = await Promise.all([
      fetchDuneRows(DUNE_TXFLOW_VOLUME_24H_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_OI_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_TOTAL_TRADERS_QUERY_ID),
      fetchDuneRows(DUNE_TXFLOW_NEW_TRADERS_QUERY_ID),
    ]);
    const volumeReading = latestDuneReading(volumeRows, ["totalvolume24h", "volume24h", "totalvolume"]);
    const oiReading = latestDuneReading(oiRows, ["totaloilatest1h", "totaloi", "openinterest", "oi"]);
    const volumeHistory = withCurrentPoint(TXFLOW_ACTIVITY_HISTORY.map((point) => ({ date: point.date, value: point.volume })), volumeReading, HISTORY_DAYS);
    const oiHistory = withCurrentPoint(
      TXFLOW_ACTIVITY_HISTORY
        .filter((point): point is typeof point & { openInterest: number } => point.openInterest !== null)
        .map((point) => ({ date: point.date, value: point.openInterest })),
      oiReading,
      HISTORY_DAYS,
    );
    // Query 6678847 is the protocol's all-time distinct-address card. It is
    // the correct user count; the dashboard's "cumulative traders" line sums
    // daily traders and can count one wallet multiple times.
    const totalTraders = latestDuneValue(totalTraderRows, ["totaltraders", "uniquetraders", "uniqueusers"]);
    const totalTraderPoint = cumulativeNewTraderSeries(newTraderRows, totalTraders);
    if (volumeHistory.length === 0 && oiHistory.length === 0) throw new Error("TxFlow activity is unavailable");

    return NextResponse.json({
      asOf: new Date().toISOString(),
      days: HISTORY_DAYS,
      volume: {
        series: volumeHistory,
        observedDays: TXFLOW_ACTIVITY_HISTORY.length,
        latest24h: volumeReading?.value ?? null,
      },
      openInterest: {
        series: oiHistory,
        latest: oiReading?.value ?? null,
      },
      uniqueTraders: {
        series: totalTraderPoint.length > 0 ? totalTraderPoint : (totalTraders === null ? [] : [{ date: new Date().toISOString().slice(0, 10), value: totalTraders }]),
        latest: totalTraders,
        source: "dune",
        metric: "uniqueTraders",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load TxFlow activity" }, { status: 502 });
  }
}
