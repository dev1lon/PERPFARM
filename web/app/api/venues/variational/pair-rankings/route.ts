import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const TOTAL_VOLUME_USD = 100_000;
// A delta-neutral round trip has four fills: long entry/exit and short entry/exit.
const FILL_NOTIONAL_USD = TOTAL_VOLUME_USD / 4;
const SELF_MATCH_IMPACT_FACTOR = 0.2;

type Quote = { bid?: string | number; ask?: string | number };
type Listing = {
  ticker?: string;
  base_spread_bps?: string | number;
  open_interest?: { long_open_interest?: string | number; short_open_interest?: string | number };
  quotes?: { base?: Quote; size_1k?: Quote; size_100k?: Quote };
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

function quoteImpactBps(listing: Listing): number | null {
  const base = quotePair(listing.quotes?.base) ?? quotePair(listing.quotes?.size_1k);
  const oneK = quotePair(listing.quotes?.size_1k);
  const hundredK = quotePair(listing.quotes?.size_100k);
  if (!base || !oneK || !hundredK) return null;

  const position = (FILL_NOTIONAL_USD - 1_000) / 99_000;
  const bid = oneK[0] + (hundredK[0] - oneK[0]) * position;
  const ask = oneK[1] + (hundredK[1] - oneK[1]) * position;
  const mid = (base[0] + base[1]) / 2;
  if (mid <= 0) return null;
  return ((Math.max(ask - base[1], 0) + Math.max(base[0] - bid, 0)) / 2 / mid) * 10_000;
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
        const spreadBps = asNumber(listing.base_spread_bps);
        const impactBps = quoteImpactBps(listing);
        const longOi = asNumber(listing.open_interest?.long_open_interest);
        const shortOi = asNumber(listing.open_interest?.short_open_interest);
        const openInterestUsd = longOi !== null && shortOi !== null ? longOi + shortOi : null;
        if (!pair || spreadBps === null || impactBps === null || openInterestUsd === null || openInterestUsd <= 0) {
          return null;
        }
        // Fees are 0 bps. Each fill crosses half the spread and the public RFQ quote curve.
        const executionBps = spreadBps / 2 + impactBps * SELF_MATCH_IMPACT_FACTOR;
        const legRoundTripCostUsd = (2 * FILL_NOTIONAL_USD * executionBps) / 10_000;
        return {
          pair,
          openInterestUsd,
          executionBps,
          longCostUsd: legRoundTripCostUsd,
          shortCostUsd: legRoundTripCostUsd,
          costPer100kUsd: legRoundTripCostUsd * 2,
        };
      })
      .filter(
        (value): value is {
          pair: string;
          openInterestUsd: number;
          executionBps: number;
          longCostUsd: number;
          shortCostUsd: number;
          costPer100kUsd: number;
        } => value !== null
      );

    if (candidates.length < 10) throw new Error("Not enough quotable Variational markets");

    const medianOi = median(candidates.map((candidate) => candidate.openInterestUsd));
    const strategy = request.nextUrl.searchParams.get("strategy") ?? "cheapest";
    const ranked = [...candidates].sort((a, b) => {
      // Cheapest favours low execution cost but gently prefers the medium-OI setup from the research.
      const aMediumOiDistance = Math.abs(Math.log(a.openInterestUsd / medianOi));
      const bMediumOiDistance = Math.abs(Math.log(b.openInterestUsd / medianOi));
      if (strategy === "max_points") return b.openInterestUsd - a.openInterestUsd;
      if (strategy === "balanced") {
        return a.costPer100kUsd + aMediumOiDistance - (b.costPer100kUsd + bMediumOiDistance);
      }
      return a.costPer100kUsd + aMediumOiDistance * 0.5 - (b.costPer100kUsd + bMediumOiDistance * 0.5);
    });

    const pairs = ranked.slice(0, 10).map((candidate) => ({
      ...candidate,
      openInterestUsd: Math.round(candidate.openInterestUsd),
      executionBps: Number(candidate.executionBps.toFixed(2)),
      longCostUsd: Number(candidate.longCostUsd.toFixed(2)),
      shortCostUsd: Number(candidate.shortCostUsd.toFixed(2)),
      costPer100kUsd: Number(candidate.costPer100kUsd.toFixed(2)),
    }));

    return NextResponse.json(
      { asOf: new Date().toISOString(), totalVolumeUsd: TOTAL_VOLUME_USD, fillNotionalUsd: FILL_NOTIONAL_USD, pairs },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Variational market data" },
      { status: 502 }
    );
  }
}
