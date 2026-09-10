import { snapshotCacheControl } from "@/lib/cache";
import { NextResponse, type NextRequest } from "next/server";
import { UserFacingError, publicMessage } from "@/lib/api-error";
import { loadVenueMarkets, quoteFromSamples } from "@/lib/cost-history";
import {
  FUNDING_HOLD_HOURS,
  MIN_PAIRS_FOR_BANDS,
  MIN_VOLUME_USD,
  displayedOpenInterestUsd,
  minOpenInterestUsd,
  oiBandFor,
  quantizeAccountVolumeUsd,
  snapshotsAreFresh,
} from "@/lib/route-model";
import { instrumentClass, isSwap, isTradfiMarket, type InstrumentClass } from "@/lib/tradfi";
import { assetClassLabel, publishedFees } from "@/lib/venue-fees";
import { isReadyVenue, protocolName } from "@/lib/venue-status";

/**
 * Same-protocol pair ranking, for every protocol.
 *
 * This used to be one file per protocol. They were never meant to differ, but
 * they did: TxFlow's copy reported `live: true` unconditionally while
 * Variational's measured snapshot age, and only one of them was updated when
 * the cost model changed. What genuinely differs between protocols is DATA --
 * fee schedule, depth, OI scale, whether a competition is running -- so the
 * differences live in PROTOCOLS below, where they can be read side by side,
 * and everything else is computed once here.
 *
 * The cost model itself is in lib/cost-history.ts and lib/route-model.ts and is
 * shared with the cross-protocol calculator.
 */
export const dynamic = "force-dynamic";

const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;

type Competition = { name: string; startUtc: number; endUtc: number };

type ProtocolConfig = {
  /** Only used when a caller omits the parameter; the calculator always sends one. */
  defaultAccountVolumeUsd: number;
  competition: Competition | null;
  /**
   * Which markets THIS protocol treats as TradFi, for its competition badge and
   * the "Only TradFi" toggle.
   *
   * The two protocols disagree about tokenised gold: TxFlow lists XAUT inside
   * its TradFi set, Variational carries no TradFi tag on it (see lib/tradfi.ts).
   * Each keeps the rule it shipped with rather than one being silently changed
   * by this merge -- an instrument that is competition-eligible on a venue is
   * that venue's claim, not ours.
   */
  isEligible: (pair: string) => boolean;
};

const PROTOCOLS: Record<string, ProtocolConfig> = {
  variational: {
    defaultAccountVolumeUsd: 100_000,
    competition: {
      name: "Swaps Trading Competition",
      startUtc: Date.UTC(2026, 8, 10, 0, 0, 0),
      endUtc: Date.UTC(2026, 8, 24, 0, 0, 0),
    },
    // "Only swap markets count toward scoring" (docs.variational.io/omni/
    // trading-competition). The previous competitions counted TradFi markets;
    // this one counts swaps and nothing else, so the CE mark follows it.
    isEligible: isSwap,
  },
  txflow: {
    defaultAccountVolumeUsd: 20_000,
    competition: null,
    isEligible: isTradfiMarket,
  },
  // Protocols added once their data path was verified. None runs a competition
  // today, and each uses the shared TradFi classification -- which is a
  // property of the INSTRUMENT, not of the venue asking, so QFEX's AAPL and
  // Variational's AAPL are the same kind of market on both pages.
  qfex: {
    defaultAccountVolumeUsd: 20_000,
    competition: null,
    isEligible: isTradfiMarket,
  },
  risex: {
    defaultAccountVolumeUsd: 20_000,
    competition: null,
    isEligible: isTradfiMarket,
  },
  polymarket: {
    defaultAccountVolumeUsd: 20_000,
    competition: null,
    isEligible: isTradfiMarket,
  },
  entropy: {
    defaultAccountVolumeUsd: 20_000,
    competition: null,
    isEligible: isTradfiMarket,
  },
  nado: {
    defaultAccountVolumeUsd: 20_000,
    // Nado documents Points, Referrals and Trading Competitions, but publishes
    // no points-per-volume emission and no competition window we can verify,
    // so nothing is claimed here. A competition is named only once its dates
    // are read off the venue.
    competition: null,
    isEligible: isTradfiMarket,
  },
};

type PairRanking = {
  pair: string;
  openInterestUsd: number;
  /**
   * What the instrument is -- equity, index, commodity, fx, prelisting, crypto.
   *
   * A different answer from `competitionEligible`, which says only whether the
   * market sits inside the venue's TradFi set. The table badged that boundary
   * and nothing else, so a row was either "TradFi" or bare, and gold, a
   * currency pair and a single stock all read as the same word.
   */
  assetClass: InstrumentClass;
  competitionEligible: boolean;
  firstLimitSide: "long" | "short";
  quoteAsOf: string;
  cycleCostUsd: number;
  costRangeLowUsd: number;
  costRangeHighUsd: number;
  // cycleCost = spread + slippage + fees. The two resting LIMIT legs are free;
  // the two MARKET legs carry the whole book cost, half on each account.
  spreadCostUsd: number;
  slippageCostUsd: number;
  feeCostUsd: number;
  /** Equal long and short on the SAME venue: funding cancels out. */
  fundingUsd: number;
};

type Band = { key: "high" | "medium" | "low" | "all"; oiRangeUsd: [number, number]; pairs: PairRanking[] };

function round(value: PairRanking): PairRanking {
  const usd = (amount: number) => Number(amount.toFixed(2));
  return {
    ...value,
    openInterestUsd: Math.round(value.openInterestUsd),
    cycleCostUsd: usd(value.cycleCostUsd),
    costRangeLowUsd: usd(value.costRangeLowUsd),
    costRangeHighUsd: usd(value.costRangeHighUsd),
    spreadCostUsd: usd(value.spreadCostUsd),
    slippageCostUsd: usd(value.slippageCostUsd),
    feeCostUsd: usd(value.feeCostUsd),
  };
}

function bandFrom(key: Band["key"], candidates: PairRanking[], limit: number): Band {
  const ois = candidates.map((candidate) => candidate.openInterestUsd);
  const pairs = [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, limit).map(round);
  return { key, oiRangeUsd: [ois.length ? Math.min(...ois) : 0, ois.length ? Math.max(...ois) : 0], pairs };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = PROTOCOLS[slug];
  // A protocol is priced only once it has both a verified data path and a fee
  // schedule we can name. Anything else is a catalog entry, not a route.
  if (!config || !isReadyVenue(slug)) {
    return NextResponse.json(
      { error: "Rankings are only published for protocols with a verified data path" },
      { status: 404 },
    );
  }
  const fees = publishedFees(slug);
  if (!fees) {
    return NextResponse.json({ error: `No published fee schedule for ${slug}` }, { status: 404 });
  }

  const requested = request.nextUrl.searchParams.get("accountVolumeUsd");
  // Snapped to the $100 grid, so two visitors asking near-identical questions
  // share one cached answer instead of repricing every market twice. Both
  // bounds are multiples of the step, so this cannot leave the allowed range.
  const accountVolumeUsd = quantizeAccountVolumeUsd(
    requested === null ? config.defaultAccountVolumeUsd : Number(requested),
  );
  if (!Number.isFinite(accountVolumeUsd) || accountVolumeUsd < MIN_ACCOUNT_VOLUME_USD || accountVolumeUsd > MAX_ACCOUNT_VOLUME_USD) {
    return NextResponse.json(
      { error: `Account volume must be between $${MIN_ACCOUNT_VOLUME_USD.toLocaleString("en-US")} and $${MAX_ACCOUNT_VOLUME_USD.toLocaleString("en-US")}` },
      { status: 400 },
    );
  }

  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const tradfiOnly = request.nextUrl.searchParams.get("tradfiOnly") === "true";
    const fillNotionalUsd = accountVolumeUsd / 2;
    const oiFloorUsd = minOpenInterestUsd(slug);

    const markets = await loadVenueMarkets(slug, fillNotionalUsd);

    let newestBookTs: string | null = null;
    let observations = 0;
    // Every schedule this answer actually applied, keyed by the class it came
    // from, so the fee note names what was charged instead of one headline
    // rate that most of the table did not pay.
    const appliedFees = new Map<string, { makerBps: number; takerBps: number }>();
    const candidates = [...markets.values()]
      .map((market): PairRanking | null => {
        const eligible = config.isEligible(market.pair);
        if (tradfiOnly && !eligible) return null;
        const quote = quoteFromSamples(null, market.samples);
        if (quote === null || market.volume24hUsd === null || market.openInterestUsd === null) return null;
        if (market.volume24hUsd < MIN_VOLUME_USD) return null;
        // Each protocol shows open interest in its own convention (Variational
        // reports one side of a gross figure) before any threshold is applied.
        const openInterestUsd = Math.round(displayedOpenInterestUsd(market.openInterestUsd, slug));
        if (openInterestUsd < oiFloorUsd) return null;

        // Priced with THIS market's schedule. QFEX charges by instrument class
        // -- five times more on a single stock than on an FX pair -- so a fee
        // read once per venue would be wrong on every market outside the
        // majority class. Venues with one venue-wide rate are unaffected: they
        // hand back the same numbers whatever the class is.
        const marketFees = publishedFees(slug, market.assetClass) ?? fees;
        const feeBps = marketFees.makerBps + marketFees.takerBps;
        appliedFees.set(market.assetClass ?? "", marketFees);
        const costOf = (legBps: number) => (2 * fillNotionalUsd * (legBps + feeBps)) / 10_000;
        const cycleCostUsd = costOf(quote.median.legBps);
        const feeCostUsd = (2 * fillNotionalUsd * feeBps) / 10_000;
        observations = Math.max(observations, quote.observations);
        // The NEWEST snapshot dates the table: one market that skipped a run
        // must not backdate every other market with it. A TradFi perp trades
        // 24/7, but its quotes can thin out or vanish while the underlying
        // market is shut, so those are the rows that skip.
        if (newestBookTs === null || market.bookTs > newestBookTs) newestBookTs = market.bookTs;

        return {
          pair: market.pair,
          openInterestUsd,
          // The venue's own class first, our curated map second -- the same rule
          // the fee lookup above follows: the venue is the authority on what its
          // own listing is.
          assetClass: instrumentClass(market.pair, market.assetClass),
          competitionEligible: eligible,
          firstLimitSide: market.firstLimitSide,
          quoteAsOf: market.bookTs,
          cycleCostUsd,
          costRangeLowUsd: costOf(quote.low.legBps),
          costRangeHighUsd: costOf(quote.high.legBps),
          // The breakdown uses the same p50 observation as the headline, so the
          // parts a user reads under a route add up to the number above it.
          spreadCostUsd: (fillNotionalUsd * quote.median.spreadBps) / 10_000,
          slippageCostUsd: (2 * fillNotionalUsd * quote.median.impactBps) / 10_000,
          feeCostUsd,
          fundingUsd: 0,
          // No spread risk on a same-protocol route: both legs sit on one book
          // at one mark, so there is no gap between venues to drift.
        };
      })
      .filter((value): value is PairRanking => value !== null);

    if (candidates.length === 0) {
      const name = protocolName(slug) ?? slug;
      throw new UserFacingError(
        tradfiOnly
          ? `No liquid TradFi markets on ${name} in the last 24 hours`
          : `No liquid ${name} markets in the last 24 hours`,
      );
    }

    // Every eligible pair, cheapest first. The OI tabs stay capped at ten -- a
    // curated shortlist is the point of a guide -- but a pair outside that ten
    // used to be unreachable, so a specific ticker could not be looked up at
    // all. The "All" tab pages through this list instead.
    const allPairs = [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).map(round);

    const grouped = candidates.length >= MIN_PAIRS_FOR_BANDS;
    const bands = grouped
      ? [
          bandFrom("high", candidates.filter((pair) => oiBandFor(pair.openInterestUsd, slug) === "high"), 10),
          bandFrom("medium", candidates.filter((pair) => oiBandFor(pair.openInterestUsd, slug) === "medium"), 10),
          bandFrom("low", candidates.filter((pair) => oiBandFor(pair.openInterestUsd, slug) === "low"), 10),
        ].filter((band) => band.pairs.length > 0)
      : [bandFrom("all", candidates, candidates.length)];

    const competition = config.competition;
    const now = Date.now();
    return NextResponse.json(
      {
        asOf: newestBookTs ?? new Date().toISOString(),
        fillNotionalUsd,
        accountVolumeUsd,
        totalCycleVolumeUsd: accountVolumeUsd * 2,
        holdHours: FUNDING_HOLD_HOURS,
        minVolumeUsd: MIN_VOLUME_USD,
        minOpenInterestUsd: oiFloorUsd,
        competition: {
          active: competition !== null && now >= competition.startUtc && now < competition.endUtc,
          name: competition?.name ?? "",
        },
        // Whether the newest snapshot is fresh enough to price from -- measured,
        // never asserted, and answered the same way for every protocol.
        sources: [{ venue: protocolName(slug) ?? slug, live: snapshotsAreFresh(newestBookTs) }],
        costBasis: observations > 1 ? "24h-median" : "latest-snapshot",
        // The schedule actually applied, so the UI can name it without knowing
        // which protocols exist.
        feeSchedule: [...appliedFees.entries()]
          .sort((a, b) => b[1].takerBps - a[1].takerBps)
          .map(([assetClass, schedule]) => ({
            venue: protocolName(slug) ?? slug,
            makerBps: schedule.makerBps,
            takerBps: schedule.takerBps,
            assetClass: assetClassLabel(assetClass),
          })),
        tradfiOnly,
        grouped,
        bands,
        pairs: allPairs,
      },
      { headers: { "Cache-Control": snapshotCacheControl({ browser: true }) } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicMessage(error, "Could not load market data right now. Try again in a minute.") },
      { status: 502 },
    );
  }
}
