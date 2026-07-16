import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
// Each account turns over $100k: a $50k entry and a $50k exit. The two-account
// hedge therefore has four fills and $200k gross trading volume.
const FILL_NOTIONAL_USD = 50_000;
const ACCOUNT_VOLUME_USD = FILL_NOTIONAL_USD * 2;
const TOTAL_CYCLE_VOLUME_USD = ACCOUNT_VOLUME_USD * 2;
const HOURS_PER_YEAR = 8_760;

type Quote = { bid?: string | number; ask?: string | number };
type Listing = {
  ticker?: string;
  funding_rate?: string | number;
  open_interest?: { long_open_interest?: string | number; short_open_interest?: string | number };
  quotes?: { base?: Quote; size_1k?: Quote; size_100k?: Quote };
};

type FundingSource = "seven_day_mean" | "partial_history" | "current_rate";
type FundingHistory = { annualizedRate: number; observedHours: number; observations: number };

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function quotePair(quote: Quote | undefined): [number, number] | null {
  const bid = asNumber(quote?.bid);
  const ask = asNumber(quote?.ask);
  return bid !== null && ask !== null && bid > 0 && ask > 0 ? [bid, ask] : null;
}

function quoteAt50k(listing: Listing): [number, number] | null {
  const base = quotePair(listing.quotes?.base) ?? quotePair(listing.quotes?.size_1k);
  const oneK = quotePair(listing.quotes?.size_1k) ?? base;
  const hundredK = quotePair(listing.quotes?.size_100k);
  if (!oneK || !hundredK) return null;
  const position = (FILL_NOTIONAL_USD - 1_000) / 99_000;
  return [
    oneK[0] + (hundredK[0] - oneK[0]) * position,
    oneK[1] + (hundredK[1] - oneK[1]) * position,
  ];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function fundingHistoryByPair(): Promise<Map<string, FundingHistory>> {
  if (!process.env.DATABASE_URL) return new Map();
  try {
    const { rows } = await getPool().query<{
      pair: string;
      annualized_rate: string | number;
      observed_hours: string | number;
      observations: string | number;
    }>(
      `SELECT
         m.symbol_canonical AS pair,
         AVG(f.funding_rate_annualized) AS annualized_rate,
         EXTRACT(EPOCH FROM (MAX(f.ts) - MIN(f.ts))) / 3600 AS observed_hours,
         COUNT(*) AS observations
       FROM funding_snapshots f
       JOIN markets m ON m.id = f.market_id
       JOIN venues v ON v.id = m.venue_id
       WHERE v.slug = 'variational' AND f.ts >= now() - interval '7 days'
       GROUP BY m.symbol_canonical`
    );
    return new Map(rows.map((row) => [
      row.pair,
      {
        annualizedRate: Number(row.annualized_rate),
        observedHours: Number(row.observed_hours),
        observations: Number(row.observations),
      },
    ]));
  } catch {
    // The live quote calculation still works before the first database snapshot.
    return new Map();
  }
}

function holdHoursForStrategy(strategy: string): number {
  if (strategy === "max_points") return 2;
  if (strategy === "balanced") return 12;
  return 24;
}

export async function GET(request: NextRequest) {
  try {
    const strategy = request.nextUrl.searchParams.get("strategy") ?? "cheapest";
    const holdHours = holdHoursForStrategy(strategy);
    const [response, fundingHistory] = await Promise.all([
      fetch(STATS_URL, { next: { revalidate: 60 }, headers: { Accept: "application/json" } }),
      fundingHistoryByPair(),
    ]);
    if (!response.ok) throw new Error(`Variational stats returned ${response.status}`);
    const payload = (await response.json()) as { listings?: Listing[] };
    if (!Array.isArray(payload.listings)) throw new Error("Variational stats has no listings");

    const candidates = payload.listings
      .map((listing) => {
        const pair = listing.ticker;
        const base = quotePair(listing.quotes?.base) ?? quotePair(listing.quotes?.size_1k);
        const quote50k = quoteAt50k(listing);
        const longOi = asNumber(listing.open_interest?.long_open_interest);
        const shortOi = asNumber(listing.open_interest?.short_open_interest);
        const openInterestUsd = longOi !== null && shortOi !== null ? longOi + shortOi : null;
        if (!pair || !base || !quote50k || openInterestUsd === null || openInterestUsd <= 0) return null;

        const baseMid = (base[0] + base[1]) / 2;
        const buyBps = ((quote50k[1] - baseMid) / baseMid) * 10_000;
        const sellBps = ((baseMid - quote50k[0]) / baseMid) * 10_000;
        if (buyBps < 0 || sellBps < 0) return null;
        const buyCostUsd = (FILL_NOTIONAL_USD * buyBps) / 10_000;
        const sellCostUsd = (FILL_NOTIONAL_USD * sellBps) / 10_000;
        const accountExecutionCostUsd = buyCostUsd + sellCostUsd;

        const history = fundingHistory.get(pair);
        const currentFundingRate = asNumber(listing.funding_rate);
        const fundingAnnualizedRate = history?.annualizedRate ?? currentFundingRate;
        const fundingSource: FundingSource = history
          ? history.observedHours >= 167 ? "seven_day_mean" : "partial_history"
          : "current_rate";
        const fundingCostUsd = fundingAnnualizedRate === null
          ? null
          : (FILL_NOTIONAL_USD * holdHours * fundingAnnualizedRate) / HOURS_PER_YEAR;
        // At equal size on the same instrument, positive funding is paid by the
        // long account and received by the short account (and vice versa).
        const longFundingUsd = fundingCostUsd;
        const shortFundingUsd = fundingCostUsd === null ? null : -fundingCostUsd;
        const longAccountTotalUsd = accountExecutionCostUsd + (longFundingUsd ?? 0);
        const shortAccountTotalUsd = accountExecutionCostUsd + (shortFundingUsd ?? 0);

        return {
          pair,
          openInterestUsd,
          buyBps,
          sellBps,
          buyCostUsd,
          sellCostUsd,
          accountExecutionCostUsd,
          longFundingUsd,
          shortFundingUsd,
          longAccountTotalUsd,
          shortAccountTotalUsd,
          cycleCostUsd: longAccountTotalUsd + shortAccountTotalUsd,
          fundingAnnualizedRate,
          fundingSource,
          fundingObservedHours: history?.observedHours ?? 0,
          fundingObservations: history?.observations ?? 0,
        };
      })
      .filter(
        (value): value is {
          pair: string;
          openInterestUsd: number;
          buyBps: number;
          sellBps: number;
          buyCostUsd: number;
          sellCostUsd: number;
          accountExecutionCostUsd: number;
          longFundingUsd: number | null;
          shortFundingUsd: number | null;
          longAccountTotalUsd: number;
          shortAccountTotalUsd: number;
          cycleCostUsd: number;
          fundingAnnualizedRate: number | null;
          fundingSource: FundingSource;
          fundingObservedHours: number;
          fundingObservations: number;
        } => value !== null
      );

    if (candidates.length < 10) throw new Error("Not enough quotable Variational markets");

    const medianOi = median(candidates.map((candidate) => candidate.openInterestUsd));
    const ranked = [...candidates].sort((a, b) => {
      const aMediumOiDistance = Math.abs(Math.log(a.openInterestUsd / medianOi));
      const bMediumOiDistance = Math.abs(Math.log(b.openInterestUsd / medianOi));
      if (strategy === "max_points") return b.openInterestUsd - a.openInterestUsd;
      if (strategy === "balanced") {
        return a.cycleCostUsd + aMediumOiDistance - (b.cycleCostUsd + bMediumOiDistance);
      }
      return a.cycleCostUsd + aMediumOiDistance * 0.5 - (b.cycleCostUsd + bMediumOiDistance * 0.5);
    });

    const pairs = ranked.slice(0, 10).map((candidate) => ({
      ...candidate,
      openInterestUsd: Math.round(candidate.openInterestUsd),
      buyBps: Number(candidate.buyBps.toFixed(2)),
      sellBps: Number(candidate.sellBps.toFixed(2)),
      buyCostUsd: Number(candidate.buyCostUsd.toFixed(2)),
      sellCostUsd: Number(candidate.sellCostUsd.toFixed(2)),
      accountExecutionCostUsd: Number(candidate.accountExecutionCostUsd.toFixed(2)),
      longFundingUsd: candidate.longFundingUsd === null ? null : Number(candidate.longFundingUsd.toFixed(2)),
      shortFundingUsd: candidate.shortFundingUsd === null ? null : Number(candidate.shortFundingUsd.toFixed(2)),
      longAccountTotalUsd: Number(candidate.longAccountTotalUsd.toFixed(2)),
      shortAccountTotalUsd: Number(candidate.shortAccountTotalUsd.toFixed(2)),
      cycleCostUsd: Number(candidate.cycleCostUsd.toFixed(2)),
      fundingAnnualizedRate: candidate.fundingAnnualizedRate === null ? null : Number(candidate.fundingAnnualizedRate.toFixed(6)),
      fundingObservedHours: Number(candidate.fundingObservedHours.toFixed(1)),
    }));

    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        fillNotionalUsd: FILL_NOTIONAL_USD,
        accountVolumeUsd: ACCOUNT_VOLUME_USD,
        totalCycleVolumeUsd: TOTAL_CYCLE_VOLUME_USD,
        holdHours,
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
