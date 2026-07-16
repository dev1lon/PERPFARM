import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const EXECUTION_NOTIONAL_USD = 100_000;

type Quote = { bid?: string | number; ask?: string | number };
type Listing = {
  ticker?: string;
  open_interest?: { long_open_interest?: string | number; short_open_interest?: string | number };
  quotes?: { base?: Quote; size_100k?: Quote };
};

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function quotePair(quote: Quote | undefined): [number, number] | null {
  const bid = asNumber(quote?.bid);
  const ask = asNumber(quote?.ask);
  return bid !== null && ask !== null && bid > 0 && ask > 0 ? [bid, ask] : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(STATS_URL, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Variational stats returned ${response.status}`);
    const payload = (await response.json()) as { listings?: Listing[] };
    if (!Array.isArray(payload.listings)) throw new Error("Variational stats has no listings");

    const candidates = payload.listings
      .map((listing) => {
        const pair = listing.ticker;
        const base = quotePair(listing.quotes?.base);
        const quote100k = quotePair(listing.quotes?.size_100k);
        const longOi = asNumber(listing.open_interest?.long_open_interest);
        const shortOi = asNumber(listing.open_interest?.short_open_interest);
        const openInterestUsd = longOi !== null && shortOi !== null ? longOi + shortOi : null;
        if (!pair || !base || !quote100k || openInterestUsd === null || openInterestUsd <= 0) return null;

        // This is the same one-way basis as PerpDexList: fee + slippage to enter a $100k order.
        // Variational fees are 0 bps, and its RFQ quotes replace a walked order book.
        const baseMid = (base[0] + base[1]) / 2;
        const longExecutionBps = ((quote100k[1] - baseMid) / baseMid) * 10_000;
        const shortExecutionBps = ((baseMid - quote100k[0]) / baseMid) * 10_000;
        if (longExecutionBps < 0 || shortExecutionBps < 0) return null;
        const longCostUsd = (EXECUTION_NOTIONAL_USD * longExecutionBps) / 10_000;
        const shortCostUsd = (EXECUTION_NOTIONAL_USD * shortExecutionBps) / 10_000;

        return {
          pair,
          openInterestUsd,
          longExecutionBps,
          shortExecutionBps,
          longCostUsd,
          shortCostUsd,
          averageCostUsd: (longCostUsd + shortCostUsd) / 2,
        };
      })
      .filter(
        (value): value is {
          pair: string;
          openInterestUsd: number;
          longExecutionBps: number;
          shortExecutionBps: number;
          longCostUsd: number;
          shortCostUsd: number;
          averageCostUsd: number;
        } => value !== null
      );

    if (candidates.length < 10) throw new Error("Not enough quotable Variational markets");

    const medianOi = median(candidates.map((candidate) => candidate.openInterestUsd));
    const strategy = request.nextUrl.searchParams.get("strategy") ?? "cheapest";
    const ranked = [...candidates].sort((a, b) => {
      const aMediumOiDistance = Math.abs(Math.log(a.openInterestUsd / medianOi));
      const bMediumOiDistance = Math.abs(Math.log(b.openInterestUsd / medianOi));
      if (strategy === "max_points") return b.openInterestUsd - a.openInterestUsd;
      if (strategy === "balanced") {
        return a.averageCostUsd + aMediumOiDistance - (b.averageCostUsd + bMediumOiDistance);
      }
      return a.averageCostUsd + aMediumOiDistance * 0.5 - (b.averageCostUsd + bMediumOiDistance * 0.5);
    });

    const pairs = ranked.slice(0, 10).map((candidate) => ({
      ...candidate,
      openInterestUsd: Math.round(candidate.openInterestUsd),
      longExecutionBps: Number(candidate.longExecutionBps.toFixed(2)),
      shortExecutionBps: Number(candidate.shortExecutionBps.toFixed(2)),
      longCostUsd: Number(candidate.longCostUsd.toFixed(2)),
      shortCostUsd: Number(candidate.shortCostUsd.toFixed(2)),
      averageCostUsd: Number(candidate.averageCostUsd.toFixed(2)),
    }));

    return NextResponse.json(
      { asOf: new Date().toISOString(), executionNotionalUsd: EXECUTION_NOTIONAL_USD, pairs },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Variational market data" },
      { status: 502 }
    );
  }
}
