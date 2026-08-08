import { NextResponse } from "next/server";

const HISTORY_DAYS = 180;
const DEFILLAMA_OPEN_INTEREST_URL =
  "https://api.llama.fi/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false";

// The aggregate OI endpoint is available on DefiLlama's public API. TxFlow's
// own Platform API is currently documented as "Coming Soon", so this route
// deliberately publishes only the metric that we can verify and refresh.
export const revalidate = 3600;

type ActivityPoint = { date: string; value: number };

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function utcDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function txFlowHistory(chart: unknown): ActivityPoint[] {
  if (!Array.isArray(chart)) return [];
  return chart
    .map((row): ActivityPoint | null => {
      if (!Array.isArray(row) || row.length < 2 || !isRecord(row[1])) return null;
      const timestamp = asNumber(row[0]);
      const value = asNumber(row[1]["TxFlow Perps"]);
      return timestamp === null || value === null ? null : { date: utcDate(timestamp), value };
    })
    .filter((point): point is ActivityPoint => point !== null)
    .slice(-HISTORY_DAYS);
}

function txFlowLatest(protocols: unknown): number | null {
  if (!Array.isArray(protocols)) return null;
  const protocol = protocols.find((item) => isRecord(item) && item.slug === "txflow-perps");
  return isRecord(protocol) ? asNumber(protocol.total24h) : null;
}

export async function GET() {
  try {
    const response = await fetch(DEFILLAMA_OPEN_INTEREST_URL, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`DefiLlama returned ${response.status}`);

    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new Error("DefiLlama returned an invalid payload");

    const series = txFlowHistory(payload.totalDataChartBreakdown);
    const latest = txFlowLatest(payload.protocols) ?? series.at(-1)?.value ?? null;
    if (series.length === 0 && latest === null) throw new Error("TxFlow OI is unavailable");

    return NextResponse.json({
      asOf: new Date().toISOString(),
      days: HISTORY_DAYS,
      openInterest: { series, latest, source: "defillama" },
    });
  } catch {
    return NextResponse.json({ error: "Could not load TxFlow open interest" }, { status: 502 });
  }
}
