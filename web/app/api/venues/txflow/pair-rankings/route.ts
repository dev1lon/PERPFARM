import { NextResponse, type NextRequest } from "next/server";
import { loadVenueMarkets, quoteFromSamples } from "@/lib/cost-history";
import { displayedOpenInterestUsd, executionTier, FUNDING_HOLD_HOURS, MIN_VOLUME_USD, OI_BANDS, oiBandFor } from "@/lib/route-model";
import { isTradfiMarket } from "@/lib/tradfi";
import { publishedFees } from "@/lib/venue-fees";

export const dynamic = "force-dynamic";

const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
const LOW_OI_USD = OI_BANDS.low;
// One definition of TxFlow's fees, shared with the cross-protocol model.
const TXFLOW_FEES = publishedFees("txflow")!;
const FEE_BPS = TXFLOW_FEES.makerBps + TXFLOW_FEES.takerBps; // 5.7 bps per cycle

/**
 * TxFlow's pair ranking, priced entirely from stored hourly snapshots.
 *
 * It used to scan api.txflow.com on every page load: two requests per market,
 * ~80 per run, per visitor. That earned 429s from the venue, produced a number
 * that moved between two runs a second apart, and made the same market read
 * differently here than in the cross-protocol table. Everything it fetched --
 * the market list, the book, open interest, 24h volume -- the worker already
 * records hourly.
 */

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("accountVolumeUsd");
  const accountVolumeUsd = requested === null ? 20_000 : Number(requested);
  if (!Number.isFinite(accountVolumeUsd) || accountVolumeUsd < MIN_ACCOUNT_VOLUME_USD || accountVolumeUsd > MAX_ACCOUNT_VOLUME_USD) {
    return NextResponse.json({ error: `Account volume must be between $${MIN_ACCOUNT_VOLUME_USD.toLocaleString()} and $${MAX_ACCOUNT_VOLUME_USD.toLocaleString()}` }, { status: 400 });
  }

  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const tradfiOnly = request.nextUrl.searchParams.get("tradfiOnly") === "true";
    const fillNotionalUsd = accountVolumeUsd / 2;
    const markets = await loadVenueMarkets("txflow", fillNotionalUsd);

    let newestBookTs: string | null = null;
    let observations = 0;
    const pairs = [...markets.values()]
      .map((market) => {
        // Same TradFi classification every protocol uses: a property of the
        // instrument, not of the page the question was asked from.
        const isTradfi = isTradfiMarket(market.pair);
        if (tradfiOnly && !isTradfi) return null;
        const quote = quoteFromSamples(null, market.samples);
        if (quote === null || market.volume24hUsd === null || market.openInterestUsd === null) return null;
        if (market.volume24hUsd < MIN_VOLUME_USD) return null;
        const openInterestUsd = Math.round(displayedOpenInterestUsd(market.openInterestUsd, "txflow"));
        if (openInterestUsd < LOW_OI_USD) return null;

        const costOf = (legBps: number) => (2 * fillNotionalUsd * (legBps + FEE_BPS)) / 10_000;
        const cycleCostUsd = costOf(quote.median.legBps);
        const feeCostUsd = (2 * fillNotionalUsd * FEE_BPS) / 10_000;
        observations = Math.max(observations, quote.observations);
        // The NEWEST snapshot, not the oldest: one market that skipped a run
        // (a TradFi book with no resting orders outside its session) must not
        // date-stamp the whole table two hours back.
        if (newestBookTs === null || market.bookTs > newestBookTs) newestBookTs = market.bookTs;

        return {
          pair: market.pair,
          openInterestUsd,
          volume24hUsd: Math.round(market.volume24hUsd),
          competitionEligible: isTradfi,
          firstLimitSide: market.firstLimitSide,
          quoteAsOf: market.bookTs,
          cycleCostUsd: Number(cycleCostUsd.toFixed(2)),
          latestCycleCostUsd: Number(costOf(quote.latest.legBps).toFixed(2)),
          costRangeLowUsd: Number(costOf(quote.low.legBps).toFixed(2)),
          costRangeHighUsd: Number(costOf(quote.high.legBps).toFixed(2)),
          spreadCostUsd: Number((2 * fillNotionalUsd * (quote.median.spreadBps / 2) / 10_000).toFixed(2)),
          slippageCostUsd: Number((2 * fillNotionalUsd * quote.median.impactBps / 10_000).toFixed(2)),
          feeCostUsd: Number(feeCostUsd.toFixed(2)),
          // Equal long and short on the SAME venue: funding cancels out.
          fundingUsd: 0,
          costTier: executionTier(cycleCostUsd, feeCostUsd, accountVolumeUsd),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((left, right) => left.cycleCostUsd - right.cycleCostUsd);

    if (pairs.length === 0) {
      throw new Error(
        tradfiOnly
          ? "No TxFlow TradFi markets have recent snapshots for this size"
          : "No TxFlow markets have recent snapshots for this size",
      );
    }

    const band = (key: "high" | "medium" | "low", of: typeof pairs) => {
      const bandOis = of.map((pair) => pair.openInterestUsd);
      return {
        key,
        oiRangeUsd: [bandOis.length ? Math.min(...bandOis) : 0, bandOis.length ? Math.max(...bandOis) : 0],
        pairs: of.slice(0, 10),
      };
    };
    const bands = [
      band("high", pairs.filter((p) => oiBandFor(p.openInterestUsd, "txflow") === "high")),
      band("medium", pairs.filter((p) => oiBandFor(p.openInterestUsd, "txflow") === "medium")),
      band("low", pairs.filter((p) => oiBandFor(p.openInterestUsd, "txflow") === "low")),
    ].filter((entry) => entry.pairs.length > 0);

    const asOf = newestBookTs ?? new Date().toISOString();
    return NextResponse.json({
      asOf,
      fillNotionalUsd,
      accountVolumeUsd,
      totalCycleVolumeUsd: accountVolumeUsd * 2,
      holdHours: FUNDING_HOLD_HOURS,
      minVolumeUsd: MIN_VOLUME_USD,
      minOpenInterestUsd: LOW_OI_USD,
      competition: { active: false, name: "" },
      sources: [{ venue: "TxFlow", live: true }],
      costBasis: observations > 1 ? "24h-median" : "latest-snapshot",
      tradfiOnly,
      grouped: true,
      bands,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load TxFlow market data" }, { status: 502 });
  }
}
