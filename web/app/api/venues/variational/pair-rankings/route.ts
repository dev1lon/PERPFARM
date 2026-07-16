import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const NOTIONAL_USD = 10_000;
const REFERRAL_BOOST = 0.16;
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

  const t = (NOTIONAL_USD - 1_000) / 99_000;
  const bid = oneK[0] + (hundredK[0] - oneK[0]) * t;
  const ask = oneK[1] + (hundredK[1] - oneK[1]) * t;
  const mid = (base[0] + base[1]) / 2;
  if (mid <= 0) return null;
  return ((Math.max(ask - base[1], 0) + Math.max(base[0] - bid, 0)) / 2 / mid) * 10_000;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function GET() {
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
        const ticker = listing.ticker;
        const spreadBps = asNumber(listing.base_spread_bps);
        const impactBps = quoteImpactBps(listing);
        const longOi = asNumber(listing.open_interest?.long_open_interest);
        const shortOi = asNumber(listing.open_interest?.short_open_interest);
        const openInterestUsd = longOi !== null && shortOi !== null ? longOi + shortOi : null;
        if (!ticker || spreadBps === null || impactBps === null || openInterestUsd === null || openInterestUsd <= 0) {
          return null;
        }
        // Same-venue model: impact is damped, while crossing the quoted touch is not.
        const executionBps = spreadBps / 2 + impactBps * SELF_MATCH_IMPACT_FACTOR;
        return { ticker, openInterestUsd, executionBps };
      })
      .filter((value): value is { ticker: string; openInterestUsd: number; executionBps: number } => value !== null);

    if (candidates.length < 10) throw new Error("Not enough quotable Variational markets");

    const medianOi = median(candidates.map((candidate) => candidate.openInterestUsd));
    const sortedByExecution = [...candidates].sort((a, b) => a.executionBps - b.executionBps);
    const lowExecution = sortedByExecution[Math.floor(sortedByExecution.length * 0.1)].executionBps;
    const highExecution = sortedByExecution[Math.floor(sortedByExecution.length * 0.9)].executionBps;
    const executionRange = Math.max(highExecution - lowExecution, 0.0001);

    const ranked = candidates.map((candidate) => {
      const executionScore = clamp((candidate.executionBps - lowExecution) / executionRange, 0, 1);
      // The manual Variational research identifies medium OI as the lower-cost case.
      const oiDistance = clamp(Math.abs(Math.log(candidate.openInterestUsd / medianOi)) / 3, 0, 1);
      const modelScore = 0.7 * executionScore + 0.3 * oiDistance;
      // $5–7/point is the manual medium-OI benchmark after the stated +16% referral boost.
      const estimatedCostPerPointUsd = (5.8 + 2.32 * modelScore) / (1 + REFERRAL_BOOST);
      const estimatedRoundTripCostUsd = (4 * NOTIONAL_USD * candidate.executionBps) / 10_000;
      return {
        pair: candidate.ticker,
        openInterestUsd: candidate.openInterestUsd,
        executionBps: candidate.executionBps,
        estimatedRoundTripCostUsd,
        estimatedCostPerPointUsd,
      };
    });

    const xau = ranked.find((candidate) => candidate.pair.toUpperCase().includes("XAU"));
    const cheapest = ranked
      .filter((candidate) => candidate !== xau)
      .sort((a, b) => a.estimatedCostPerPointUsd - b.estimatedCostPerPointUsd)
      .slice(0, xau ? 9 : 10);
    const pairs = [...cheapest, ...(xau ? [{ ...xau, estimatedCostPerPointUsd: 11, holdHours: 2 }] : [])]
      .map((candidate) => ({ ...candidate, holdHours: "holdHours" in candidate ? candidate.holdHours : 24 }))
      .sort((a, b) => a.estimatedCostPerPointUsd - b.estimatedCostPerPointUsd)
      .slice(0, 10)
      .map((candidate) => ({
        ...candidate,
        openInterestUsd: Math.round(candidate.openInterestUsd),
        executionBps: Number(candidate.executionBps.toFixed(2)),
        estimatedRoundTripCostUsd: Number(candidate.estimatedRoundTripCostUsd.toFixed(2)),
        estimatedCostPerPointUsd: Number(candidate.estimatedCostPerPointUsd.toFixed(2)),
      }));

    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        notionalUsd: NOTIONAL_USD,
        referralBoostPct: REFERRAL_BOOST * 100,
        pairs,
      },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Variational market data" },
      { status: 502 }
    );
  }
}
