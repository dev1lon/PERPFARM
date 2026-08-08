import { NextResponse } from "next/server";
import { TXFLOW_ACTIVITY_HISTORY } from "@/lib/txflow-activity-history";

const HISTORY_DAYS = 180;
const TXFLOW_INFO_URL = "https://api.txflow.com/info";

// The route itself is ISR-cached hourly. Historical points are the supplied
// daily export; the final point is recalculated from TxFlow's public market
// tickers so the headline stays current between uploads.
export const revalidate = 3600;

type ActivityPoint = { date: string; value: number };

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function txFlowInfo(body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(TXFLOW_INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`TxFlow returned ${response.status}`);
  return response.json();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await work(current));
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getLiveTotals(): Promise<{ volume24h: number; openInterest: number } | null> {
  const meta = await txFlowInfo({ type: "perpMeta", dex: "" });
  if (!isRecord(meta) || !Array.isArray(meta.universe)) return null;
  const ids = meta.universe
    .filter(isRecord)
    .filter((market) => market.delisted !== true && market.haltTrading !== true)
    .map((market) => asNumber(market.index))
    .filter((id): id is number => id !== null);

  const tickers = await mapWithConcurrency(ids, 12, async (instrumentId) => {
    try {
      return await txFlowInfo({ type: "marketTicker", instrumentId });
    } catch {
      return null;
    }
  });

  const totals = tickers.reduce<{ volume24h: number; openInterest: number }>(
    (result, ticker) => {
      if (!isRecord(ticker)) return result;
      const volume = asNumber(ticker.dayNtlVlm);
      const mark = asNumber(ticker.markPx) ?? asNumber(ticker.lastPrice);
      const size = asNumber(ticker.openInterest);
      if (volume !== null) result.volume24h += volume;
      if (mark !== null && size !== null) result.openInterest += mark * size;
      return result;
    },
    { volume24h: 0, openInterest: 0 },
  );
  return totals.volume24h > 0 || totals.openInterest > 0 ? totals : null;
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
    const live = await getLiveTotals().catch(() => null);
    const volumeHistory = withCurrentPoint(
      TXFLOW_ACTIVITY_HISTORY.map((point) => ({ date: point.date, value: point.volume })),
      live?.volume24h ?? null,
    );
    const oiHistory = withCurrentPoint(
      TXFLOW_ACTIVITY_HISTORY
        .filter((point): point is typeof point & { openInterest: number } => point.openInterest !== null)
        .map((point) => ({ date: point.date, value: point.openInterest })),
      live?.openInterest ?? null,
    );
    if (volumeHistory.length === 0 && oiHistory.length === 0) throw new Error("TxFlow activity is unavailable");

    return NextResponse.json({
      asOf: new Date().toISOString(),
      days: HISTORY_DAYS,
      volume: {
        series: volumeHistory,
        observedDays: TXFLOW_ACTIVITY_HISTORY.length,
        latest24h: live?.volume24h ?? TXFLOW_ACTIVITY_HISTORY.at(-1)?.volume ?? null,
      },
      openInterest: {
        series: oiHistory,
        latest: live?.openInterest ?? TXFLOW_ACTIVITY_HISTORY.at(-1)?.openInterest ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load TxFlow activity" }, { status: 502 });
  }
}
