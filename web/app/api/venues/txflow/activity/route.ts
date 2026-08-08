import { NextResponse } from "next/server";
import { TXFLOW_ACTIVITY_HISTORY } from "@/lib/txflow-activity-history";

const HISTORY_DAYS = 180;
const DUNE_RESULTS_URL = "https://api.dune.com/api/v1/query";
const DUNE_TXFLOW_VOLUME_24H_QUERY_ID = "6678797";
const DUNE_TXFLOW_OI_QUERY_ID = "6678737";
const DUNE_TXFLOW_ACTIVE_TRADERS_QUERY_ID = "6679475";

// Dune is TxFlow's official analytics source. The supplied daily CSV keeps
// history complete; all current headline readings come from Dune, never from
// an expensive client-side aggregation of every listed market.
export const revalidate = 3600;

type ActivityPoint = { date: string; value: number };

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function valueFromDuneRow(row: Record<string, unknown>, names: string[]): unknown {
  const found = Object.entries(row).find(([key]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return names.some((name) => normalized === name || normalized.includes(name));
  });
  return found?.[1];
}

async function duneRows(queryId: string): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) return [];
  const response = await fetch(`${DUNE_RESULTS_URL}/${queryId}/results?limit=1000`, {
    headers: { "X-Dune-Api-Key": apiKey },
    next: { revalidate: 60 * 60 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return [];
  const payload: unknown = await response.json();
  return isRecord(payload) && isRecord(payload.result) && Array.isArray(payload.result.rows)
    ? payload.result.rows.filter(isRecord)
    : [];
}

function latestDuneValue(rows: Record<string, unknown>[], names: string[]): number | null {
  for (const row of [...rows].reverse()) {
    const value = asNumber(valueFromDuneRow(row, names));
    if (value !== null) return value;
  }
  return null;
}

function duneActiveTraderSeries(rows: Record<string, unknown>[]): ActivityPoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const rawDate = valueFromDuneRow(row, ["date", "day", "blockdate", "period"]);
    const parsed = new Date(String(rawDate));
    if (Number.isNaN(parsed.valueOf())) continue;
    // Query 6679475 is the daily Traders chart. Prefer its daily column and
    // deliberately exclude the cumulative all-time line.
    const daily = asNumber(valueFromDuneRow(row, ["dailytraders", "dailyactiveusers", "dailyusers", "traders"]));
    if (daily !== null) byDate.set(parsed.toISOString().slice(0, 10), daily);
  }
  return [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
}

function latestHistoryValue(history: ActivityPoint[]): number | null {
  return history.at(-1)?.value ?? null;
}

function withCurrentPoint(history: ActivityPoint[], value: number | null): ActivityPoint[] {
  if (value === null) return history;
  const today = new Date().toISOString().slice(0, 10);
  return [...history.filter((point) => point.date !== today), { date: today, value }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-HISTORY_DAYS);
}

export async function GET() {
  try {
    const [volumeRows, oiRows, traderRows] = await Promise.all([
      duneRows(DUNE_TXFLOW_VOLUME_24H_QUERY_ID),
      duneRows(DUNE_TXFLOW_OI_QUERY_ID),
      duneRows(DUNE_TXFLOW_ACTIVE_TRADERS_QUERY_ID),
    ]);
    const volumeFromDune = latestDuneValue(volumeRows, ["totalvolume24h", "volume24h", "totalvolume"]);
    const oiFromDune = latestDuneValue(oiRows, ["totaloilatest1h", "totaloi", "openinterest", "oi"]);
    const volumeHistory = withCurrentPoint(TXFLOW_ACTIVITY_HISTORY.map((point) => ({ date: point.date, value: point.volume })), volumeFromDune);
    const oiHistory = withCurrentPoint(
      TXFLOW_ACTIVITY_HISTORY
        .filter((point): point is typeof point & { openInterest: number } => point.openInterest !== null)
        .map((point) => ({ date: point.date, value: point.openInterest })),
      oiFromDune,
    );
    const activeTraders = duneActiveTraderSeries(traderRows);
    if (volumeHistory.length === 0 && oiHistory.length === 0) throw new Error("TxFlow activity is unavailable");

    return NextResponse.json({
      asOf: new Date().toISOString(),
      days: HISTORY_DAYS,
      volume: {
        series: volumeHistory,
        observedDays: TXFLOW_ACTIVITY_HISTORY.length,
        latest24h: volumeFromDune,
      },
      openInterest: {
        series: oiHistory,
        latest: oiFromDune,
      },
      uniqueTraders: {
        series: activeTraders,
        latest: latestHistoryValue(activeTraders),
        source: "dune",
        metric: "activeAddresses",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load TxFlow activity" }, { status: 502 });
  }
}
