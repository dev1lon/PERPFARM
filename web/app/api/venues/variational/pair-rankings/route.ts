import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
// The requested volume is entry plus exit turnover on one account. The
// two-account hedge has four equal fills and twice that volume in total.
// Public quote tiers go to $100k, so the input never extrapolates beyond the
// published depth.
const DEFAULT_ACCOUNT_VOLUME_USD = 100_000;
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
const MIN_RECOMMENDED_OI_USD = 50_000;
const HOURS_PER_YEAR = 8_760;
const TRADFI_COMPETITION_START_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const TRADFI_COMPETITION_END_UTC = Date.UTC(2026, 6, 31, 0, 0, 0);

// The stats endpoint exposes ticker/name but not an asset-class field. Keep
// the TradFi universe explicit while the competition is live, rather than
// pretending that a low-OI crypto ticker is competition eligible. This covers
// the stocks, ETFs, metals and commodities currently listed by Omni.
const TRADFI_TICKERS = new Set([
  "AAOI", "AAPL", "AMD", "AMZN", "ANTHROPIC", "ARM", "AVGO", "BBX", "BOT", "BRKB", "BX", "BZ",
  "COST", "CBRS", "CL", "COIN", "COST", "CRM", "CRCL", "DRAM", "EBAY", "EWJ", "EWY", "EWT", "EWZ",
  "GME", "GOOGL", "HD", "HIMS", "HOOD", "HPE", "INTC", "JPM", "LITE", "LLY", "META", "MRVL", "MSFT",
  "MSTR", "MU", "NATGAS", "NBIS", "NFLX", "NOK", "NVO", "NVDA", "OPENAI", "ORCL", "PAXG", "PLTR",
  "QCOM", "QQQ", "RIVN", "RKLB", "SNDK", "SOXL", "SPCX", "STXX", "STRC", "TSLA", "TSM", "UBER",
  "URNM", "US500", "USAR", "WMT", "XAG", "XAU", "XAUT", "XPD", "XPT",
]);

type Quote = { bid?: string | number; ask?: string | number };
type Listing = {
  ticker?: string;
  funding_rate?: string | number;
  open_interest?: { long_open_interest?: string | number; short_open_interest?: string | number };
  quotes?: { base?: Quote; size_1k?: Quote; size_100k?: Quote };
};

type FundingSource = "seven_day_mean" | "partial_history" | "current_rate";
type FundingHistory = { annualizedRate: number; observedHours: number; observations: number };
type FirstLimitSide = "long" | "short";
type RecommendedLimitSide = FirstLimitSide | "either";

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function quotePair(quote: Quote | undefined): [number, number] | null {
  const bid = asNumber(quote?.bid);
  const ask = asNumber(quote?.ask);
  return bid !== null && ask !== null && bid > 0 && ask > 0 ? [bid, ask] : null;
}

function quoteAtNotional(listing: Listing, fillNotionalUsd: number): [number, number] | null {
  const base = quotePair(listing.quotes?.base) ?? quotePair(listing.quotes?.size_1k);
  const oneK = quotePair(listing.quotes?.size_1k) ?? base;
  const hundredK = quotePair(listing.quotes?.size_100k);
  if (!oneK || !hundredK) return null;
  if (fillNotionalUsd <= 1_000) return base ?? oneK;
  const position = (fillNotionalUsd - 1_000) / 99_000;
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

function competitionIsActive(now = Date.now()): boolean {
  return now >= TRADFI_COMPETITION_START_UTC && now < TRADFI_COMPETITION_END_UTC;
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
    const requestedAccountVolume = request.nextUrl.searchParams.get("accountVolumeUsd");
    const accountVolumeUsd = requestedAccountVolume === null
      ? DEFAULT_ACCOUNT_VOLUME_USD
      : Number(requestedAccountVolume);
    if (!Number.isFinite(accountVolumeUsd) || accountVolumeUsd < MIN_ACCOUNT_VOLUME_USD || accountVolumeUsd > MAX_ACCOUNT_VOLUME_USD) {
      return NextResponse.json(
        { error: `Account volume must be between $${MIN_ACCOUNT_VOLUME_USD.toLocaleString("en-US")} and $${MAX_ACCOUNT_VOLUME_USD.toLocaleString("en-US")}` },
        { status: 400 },
      );
    }
    const fillNotionalUsd = accountVolumeUsd / 2;
    const totalCycleVolumeUsd = accountVolumeUsd * 2;
    const holdHours = holdHoursForStrategy(strategy);
    const competitionActive = competitionIsActive();
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
        const fillQuote = quoteAtNotional(listing, fillNotionalUsd);
        const longOi = asNumber(listing.open_interest?.long_open_interest);
        const shortOi = asNumber(listing.open_interest?.short_open_interest);
        // Omni's market selector displays gross OI: both the user-side
        // long/short exposure and OLP's matching counterparty exposure.
        // The per-listing directional fields are one side only, so double
        // their sum to match Omni's displayed Open Interest convention.
        const openInterestUsd = longOi !== null && shortOi !== null ? (longOi + shortOi) * 2 : null;
        if (!pair || !base || !fillQuote || openInterestUsd === null || openInterestUsd <= 0) return null;

        const baseMid = (base[0] + base[1]) / 2;
        const buyBps = ((fillQuote[1] - baseMid) / baseMid) * 10_000;
        const sellBps = ((baseMid - fillQuote[0]) / baseMid) * 10_000;
        if (buyBps < 0 || sellBps < 0) return null;
        const buyCostUsd = (fillNotionalUsd * buyBps) / 10_000;
        const sellCostUsd = (fillNotionalUsd * sellBps) / 10_000;
        // A limit-first hedge has two passive limit fills and two immediate
        // market hedge fills. If the long limit fills first, the short is
        // hedged at market; at exit the order is reversed. The only public
        // cost we can quantify is the two market legs. The limit price is
        // user-defined and a fill is never guaranteed.
        const limitLongCycleCostUsd = sellCostUsd * 2;
        const limitShortCycleCostUsd = buyCostUsd * 2;
        const recommendedLimitSide: RecommendedLimitSide = Math.abs(limitLongCycleCostUsd - limitShortCycleCostUsd) < 0.01
          ? "either"
          : limitLongCycleCostUsd < limitShortCycleCostUsd ? "long" : "short";
        const firstLimitSide: FirstLimitSide = recommendedLimitSide === "short" ? "short" : "long";
        const marketLegCostUsd = firstLimitSide === "long" ? sellCostUsd : buyCostUsd;

        const history = fundingHistory.get(pair);
        const currentFundingRate = asNumber(listing.funding_rate);
        const fundingAnnualizedRate = history?.annualizedRate ?? currentFundingRate;
        const fundingSource: FundingSource = history
          ? history.observedHours >= 167 ? "seven_day_mean" : "partial_history"
          : "current_rate";
        const fundingCostUsd = fundingAnnualizedRate === null
          ? null
          : (fillNotionalUsd * holdHours * fundingAnnualizedRate) / HOURS_PER_YEAR;
        // At equal size on the same instrument, positive funding is paid by the
        // long account and received by the short account (and vice versa).
        const longFundingUsd = fundingCostUsd;
        const shortFundingUsd = fundingCostUsd === null ? null : -fundingCostUsd;
        // With the selected sequence each account has one passive limit leg
        // and one immediate market leg, so both accounts carry the same
        // modeled execution cost. Funding remains shown by account even
        // though equal long/short notional nets to zero for the cycle.
        const longAccountTotalUsd = marketLegCostUsd + (longFundingUsd ?? 0);
        const shortAccountTotalUsd = marketLegCostUsd + (shortFundingUsd ?? 0);

        return {
          pair,
          competitionEligible: TRADFI_TICKERS.has(pair),
          openInterestUsd,
          buyBps,
          sellBps,
          buyCostUsd,
          sellCostUsd,
          limitLongCycleCostUsd,
          limitShortCycleCostUsd,
          firstLimitSide,
          recommendedLimitSide,
          marketLegCostUsd,
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
          competitionEligible: boolean;
          openInterestUsd: number;
          buyBps: number;
          sellBps: number;
          buyCostUsd: number;
          sellCostUsd: number;
          limitLongCycleCostUsd: number;
          limitShortCycleCostUsd: number;
          firstLimitSide: FirstLimitSide;
          recommendedLimitSide: RecommendedLimitSide;
          marketLegCostUsd: number;
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

    // Exclude only markets below the explicit liquidity floor. The cheapest
    // route must then be a pure execution-cost ranking — not a hidden OI
    // preference which can make the displayed result hard to audit.
    const eligibleCandidates = competitionActive
      ? candidates.filter((candidate) => candidate.competitionEligible)
      : candidates;
    const selectionPool = eligibleCandidates.filter(
      (candidate) => candidate.openInterestUsd >= MIN_RECOMMENDED_OI_USD,
    );
    if (selectionPool.length < 10) {
      throw new Error("Not enough quotable markets above the $50k OI minimum");
    }

    const medianOi = median(selectionPool.map((candidate) => candidate.openInterestUsd));
    const ranked = [...selectionPool].sort((a, b) => {
      const aMediumOiDistance = Math.abs(Math.log(a.openInterestUsd / medianOi));
      const bMediumOiDistance = Math.abs(Math.log(b.openInterestUsd / medianOi));
      if (strategy === "max_points") return b.openInterestUsd - a.openInterestUsd || a.cycleCostUsd - b.cycleCostUsd;
      if (strategy === "balanced") {
        return a.cycleCostUsd + aMediumOiDistance - (b.cycleCostUsd + bMediumOiDistance);
      }
      return a.cycleCostUsd - b.cycleCostUsd || b.openInterestUsd - a.openInterestUsd;
    });

    const pairs = ranked.slice(0, 10).map((candidate) => ({
      ...candidate,
      openInterestUsd: Math.round(candidate.openInterestUsd),
      buyBps: Number(candidate.buyBps.toFixed(2)),
      sellBps: Number(candidate.sellBps.toFixed(2)),
      buyCostUsd: Number(candidate.buyCostUsd.toFixed(2)),
      sellCostUsd: Number(candidate.sellCostUsd.toFixed(2)),
      limitLongCycleCostUsd: Number(candidate.limitLongCycleCostUsd.toFixed(2)),
      limitShortCycleCostUsd: Number(candidate.limitShortCycleCostUsd.toFixed(2)),
      marketLegCostUsd: Number(candidate.marketLegCostUsd.toFixed(2)),
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
        fillNotionalUsd,
        accountVolumeUsd,
        totalCycleVolumeUsd,
        holdHours,
        competition: {
          active: competitionActive,
          name: "TradFi Trading Competition #5",
          eligiblePairsOnly: competitionActive,
          minimumOpenInterestUsd: MIN_RECOMMENDED_OI_USD,
        },
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
