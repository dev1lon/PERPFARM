import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { quoteCurveImpactBps, quoteCurveMarketSide } from "@/lib/quote-curve";

export const dynamic = "force-dynamic";

const VARIATIONAL_STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
// The requested volume is entry plus exit turnover on one account. The
// two-account hedge has four equal fills and twice that volume in total.
const DEFAULT_ACCOUNT_VOLUME_USD = 100_000;
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
// Pairs below this 24h volume are treated as dead and dropped from the bands.
const MIN_VOLUME_USD = 1_000;
// User-approved floor, expressed in the same gross-OI convention as Omni UI.
const MIN_OPEN_INTEREST_USD = 50_000;
// Below this many live pairs the three-way OI split is noise; show one list.
const MIN_PAIRS_FOR_BANDS = 15;
// Fixed OI bands (gross OI, i.e. the doubled value) — approved for Variational.
const HIGH_OI_USD = 20_000_000;
const MEDIUM_OI_USD = 3_000_000;
const HOLD_HOURS = 24;
const TRADFI_COMPETITION_START_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const TRADFI_COMPETITION_END_UTC = Date.UTC(2026, 6, 31, 0, 0, 0);
const QUOTE_SIZE_KEY = /^size_(\d+)([km])$/;

// The stats feed exposes ticker/name but not an asset-class field. Keep the
// TradFi universe explicit so eligible pairs can be badged during the
// competition. Covers the stocks, ETFs, metals and commodities listed by Omni.
const TRADFI_TICKERS = new Set([
  "AAOI", "AAPL", "AMD", "AMZN", "ANTHROPIC", "ARM", "AVGO", "BBX", "BOT", "BRKB", "BX", "BZ",
  "COST", "CBRS", "CL", "COIN", "COST", "CRM", "CRCL", "DRAM", "EBAY", "EWJ", "EWY", "EWT", "EWZ",
  "GME", "GOOGL", "HD", "HIMS", "HOOD", "HPE", "INTC", "JPM", "LITE", "LLY", "META", "MRVL", "MSFT",
  "MSTR", "MU", "NATGAS", "NBIS", "NFLX", "NOK", "NVO", "NVDA", "OPENAI", "ORCL", "PAXG", "PLTR",
  "QCOM", "QQQ", "RIVN", "RKLB", "SNDK", "SOXL", "SPCX", "STXX", "STRC", "TSLA", "TSM", "UBER",
  "URNM", "US500", "USAR", "WMT", "XAG", "XAU", "XAUT", "XPD", "XPT",
]);

type MarketRow = {
  book_ts: string;
  pair: string;
  spread_bps?: string | number | null;
  impact_bps_10k?: string | number | null;
  impact_bps_50k?: string | number | null;
  impact_bps_100k?: string | number | null;
  quote_curve_json?: unknown;
  volume_24h_usd: string | number | null;
  open_interest_usd: string | number | null;
};

type BookHistoryRow = {
  pair: string;
  spread_bps: string | number | null;
  impact_bps_10k: string | number | null;
  impact_bps_50k: string | number | null;
  impact_bps_100k: string | number | null;
  quote_curve_json: unknown;
};

type CostTier = "low" | "medium" | "high";
type PairRanking = {
  pair: string;
  openInterestUsd: number;
  volume24hUsd: number;
  competitionEligible: boolean;
  firstLimitSide: "long" | "short";
  quoteAsOf: string;
  cycleCostUsd: number;
  latestCycleCostUsd: number;
  costRangeLowUsd: number;
  costRangeHighUsd: number;
  // Cost breakdown: cycleCost = spread + slippage (funding nets to 0; Variational
  // is 0% maker/taker so there are no fees). The two LIMIT legs are free; the two
  // MARKET legs carry the whole cost, half on each account.
  spreadCostUsd: number;
  slippageCostUsd: number;
  // This classifies estimated execution cost (spread + quote impact), not
  // liquidation, volatility, or any other trading risk.
  costTier: CostTier;
};

type Band = { key: "high" | "medium" | "low" | "all"; oiRangeUsd: [number, number]; pairs: PairRanking[] };
type LiveSideCost = {
  firstLimitSide: "long" | "short";
  marketImpactBps: number;
  spreadBps: number | null;
  quoteAsOf: string | null;
  volume24hUsd: number | null;
  openInterestUsd: number | null;
};
type QuotePair = [bid: number, ask: number];

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function competitionIsActive(now = Date.now()): boolean {
  return now >= TRADFI_COMPETITION_START_UTC && now < TRADFI_COMPETITION_END_UTC;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function quotePair(value: unknown): QuotePair | null {
  if (!isRecord(value)) return null;
  const bid = asNumber(value.bid);
  const ask = asNumber(value.ask);
  return bid !== null && ask !== null && bid > 0 && ask > 0 ? [bid, ask] : null;
}

/** Normalize Omni's live RFQ fields into the snapshot curve schema. */
function quoteCurveFromListing(listing: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRecord(listing.quotes)) return null;
  const base = quotePair(listing.quotes.base) ?? quotePair(listing.quotes.size_1k);
  const referencePrice = asNumber(listing.mark_price);
  if (base === null || referencePrice === null || referencePrice <= 0) return null;

  const points: Array<Record<string, number>> = [{ notional_usd: 0, bid: base[0], ask: base[1] }];
  for (const [key, value] of Object.entries(listing.quotes)) {
    const match = QUOTE_SIZE_KEY.exec(key);
    const quote = quotePair(value);
    if (match === null || quote === null) continue;
    const multiplier = match[2] === "k" ? 1_000 : 1_000_000;
    points.push({ notional_usd: Number(match[1]) * multiplier, bid: quote[0], ask: quote[1] });
  }
  return { reference_price: referencePrice, points };
}

/**
 * The two MARKET fills have the same direction: LIMIT LONG first means two
 * sells; LIMIT SHORT first means two buys. Pick the cheaper live side. The
 * 24h median remains based on saved direction-averaged observations.
 */
async function loadLiveSideCosts(fillNotionalUsd: number): Promise<Map<string, LiveSideCost>> {
  // Hard timeout: the venue's public API can hang or block server-side callers,
  // and without this the whole serverless request stalls until Vercel kills it
  // (the ranking then falls back to saved snapshots instead of failing).
  const response = await fetch(VARIATIONAL_STATS_URL, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Variational stats returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.listings)) throw new Error("Invalid Variational stats");

  const costs = new Map<string, LiveSideCost>();
  for (const listing of payload.listings) {
    if (!isRecord(listing) || typeof listing.ticker !== "string" || !isRecord(listing.quotes)) continue;
    const curve = quoteCurveFromListing(listing);
    const side = quoteCurveMarketSide(curve, fillNotionalUsd);
    if (side === null) continue;
    const openInterest = isRecord(listing.open_interest) ? listing.open_interest : null;
    const longOpenInterest = openInterest ? asNumber(openInterest.long_open_interest) : null;
    const shortOpenInterest = openInterest ? asNumber(openInterest.short_open_interest) : null;
    costs.set(listing.ticker, {
      firstLimitSide: side.firstLimitSide,
      marketImpactBps: side.marketImpactBps,
      spreadBps: asNumber(listing.base_spread_bps),
      quoteAsOf: typeof listing.quotes.updated_at === "string" ? listing.quotes.updated_at : null,
      volume24hUsd: asNumber(listing.volume_24h),
      openInterestUsd:
        longOpenInterest !== null && shortOpenInterest !== null
          ? longOpenInterest + shortOpenInterest
          : null,
    });
  }
  return costs;
}

// Piecewise-linear impact at an arbitrary notional from the published buckets.
// Impact is 0 at size 0; missing buckets are skipped; sizes past the last
// anchor clamp to it (the fill notional never exceeds $100k here).
function impactAtNotional(
  notional: number,
  anchors: Array<[number, number | null]>,
): number | null {
  const points: Array<[number, number]> = [[0, 0]];
  for (const [x, y] of anchors) if (y !== null) points.push([x, y]);
  if (points.length < 2) return null;
  points.sort((a, b) => a[0] - b[0]);
  if (notional <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (notional <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (notional - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

type ImpactSnapshot = {
  spread_bps?: string | number | null;
  impact_bps_10k?: string | number | null;
  impact_bps_50k?: string | number | null;
  impact_bps_100k?: string | number | null;
  quote_curve_json?: unknown;
};

type CostSample = { legBps: number; spreadBps: number; impactBps: number };

function sampleFromSnapshot(snapshot: ImpactSnapshot, fillNotionalUsd: number): CostSample | null {
  const spreadBps = asNumber(snapshot.spread_bps);
  const impactBps = quoteCurveImpactBps(snapshot.quote_curve_json, fillNotionalUsd, "cheapest") ?? impactAtNotional(fillNotionalUsd, [
    [10_000, asNumber(snapshot.impact_bps_10k)],
    [50_000, asNumber(snapshot.impact_bps_50k)],
    [100_000, asNumber(snapshot.impact_bps_100k)],
  ]);
  if (spreadBps === null || impactBps === null) return null;
  return { legBps: spreadBps / 2 + impactBps, spreadBps, impactBps };
}

function percentileSample(samples: CostSample[], percentile: number): CostSample | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left.legBps - right.legBps);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex]!;
  const upper = sorted[upperIndex]!;
  const fraction = position - lowerIndex;
  return {
    legBps: lower.legBps + (upper.legBps - lower.legBps) * fraction,
    spreadBps: lower.spreadBps + (upper.spreadBps - lower.spreadBps) * fraction,
    impactBps: lower.impactBps + (upper.impactBps - lower.impactBps) * fraction,
  };
}

function round(value: PairRanking): PairRanking {
  return {
    ...value,
    openInterestUsd: Math.round(value.openInterestUsd),
    volume24hUsd: Math.round(value.volume24hUsd),
    cycleCostUsd: Number(value.cycleCostUsd.toFixed(2)),
    latestCycleCostUsd: Number(value.latestCycleCostUsd.toFixed(2)),
    costRangeLowUsd: Number(value.costRangeLowUsd.toFixed(2)),
    costRangeHighUsd: Number(value.costRangeHighUsd.toFixed(2)),
    spreadCostUsd: Number(value.spreadCostUsd.toFixed(2)),
    slippageCostUsd: Number(value.slippageCostUsd.toFixed(2)),
  };
}

function bandFrom(key: Band["key"], candidates: PairRanking[], limit: number): Band {
  const ois = candidates.map((c) => c.openInterestUsd);
  const pairs = [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, limit).map(round);
  return { key, oiRangeUsd: [ois.length ? Math.min(...ois) : 0, ois.length ? Math.max(...ois) : 0], pairs };
}

async function loadMarkets(): Promise<MarketRow[]> {
  const { rows } = await getPool().query<MarketRow>(
    `WITH v AS (SELECT id FROM venues WHERE slug = 'variational'),
     book AS (
       SELECT DISTINCT ON (b.market_id)
         b.market_id, b.ts AS book_ts, b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k,
         to_jsonb(b) -> 'quote_curve_json' AS quote_curve_json
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       WHERE m.venue_id = (SELECT id FROM v)
       ORDER BY b.market_id, b.ts DESC
     ),
     vol AS (
       SELECT DISTINCT ON (s.market_id)
         s.market_id, s.volume_24h_usd, s.open_interest_usd
       FROM volume_snapshots s
       JOIN markets m ON m.id = s.market_id
       WHERE m.venue_id = (SELECT id FROM v)
       ORDER BY s.market_id, s.ts DESC
     )
     SELECT book.book_ts, m.symbol_canonical AS pair,
            book.spread_bps, book.impact_bps_10k, book.impact_bps_50k, book.impact_bps_100k, book.quote_curve_json,
            vol.volume_24h_usd, vol.open_interest_usd
     FROM markets m
     JOIN v ON v.id = m.venue_id
     JOIN book ON book.market_id = m.id
     JOIN vol ON vol.market_id = m.id
     WHERE m.is_active = true`,
  );
  return rows;
}

async function loadBookHistory(): Promise<BookHistoryRow[]> {
  const { rows } = await getPool().query<BookHistoryRow>(
    `SELECT m.symbol_canonical AS pair,
            b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k,
            to_jsonb(b) -> 'quote_curve_json' AS quote_curve_json
     FROM book_snapshots b
     JOIN markets m ON m.id = b.market_id
     JOIN venues v ON v.id = m.venue_id
     WHERE v.slug = 'variational'
       AND b.ts >= now() - interval '24 hours'`,
  );
  return rows;
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
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
    const competitionActive = competitionIsActive();
    const tradfiOnly = request.nextUrl.searchParams.get("tradfiOnly") === "true";

    // Track whether the venue's live quote feed answered. When it doesn't we
    // still rank from saved snapshots, but the response says so explicitly so
    // the UI can tell the user WHICH protocol's live data is missing rather
    // than quietly showing stale numbers as if they were live.
    let liveQuotesOk = true;
    const [rows, bookHistory, liveSideCosts] = await Promise.all([
      loadMarkets(),
      loadBookHistory(),
      loadLiveSideCosts(fillNotionalUsd).catch(() => {
        liveQuotesOk = false;
        return new Map<string, LiveSideCost>();
      }),
    ]);

    const historyByPair = new Map<string, BookHistoryRow[]>();
    for (const snapshot of bookHistory) {
      const rowsForPair = historyByPair.get(snapshot.pair) ?? [];
      rowsForPair.push(snapshot);
      historyByPair.set(snapshot.pair, rowsForPair);
    }

    // Staging intentionally has no snapshot cron. Always prefer live volume/OI
    // and add live-only rows when the saved snapshots have aged past the query
    // window. Historical DB rows still supply the 24h percentile estimates
    // whenever they are available.
    const marketRows = new Map(rows.map((row) => [row.pair, row]));
    for (const [pair, live] of liveSideCosts) {
      if (marketRows.has(pair)) continue;
      marketRows.set(pair, {
        book_ts: live.quoteAsOf ?? new Date().toISOString(),
        pair,
        spread_bps: live.spreadBps,
        volume_24h_usd: live.volume24hUsd,
        open_interest_usd: live.openInterestUsd,
      });
    }

    const candidates = [...marketRows.values()]
      .map((row): PairRanking | null => {
        const liveSide = liveSideCosts.get(row.pair);
        const volume24hUsd = liveSide?.volume24hUsd ?? asNumber(row.volume_24h_usd);
        const oiRaw = liveSide?.openInterestUsd ?? asNumber(row.open_interest_usd);
        const liveSample = liveSide?.spreadBps === null || liveSide?.spreadBps === undefined
          ? null
          : {
              spreadBps: liveSide.spreadBps,
              impactBps: liveSide.marketImpactBps,
              legBps: liveSide.spreadBps / 2 + liveSide.marketImpactBps,
            };
        const latestSample = liveSample ?? sampleFromSnapshot(row, fillNotionalUsd);
        const historicalSamples = (historyByPair.get(row.pair) ?? [])
          .map((snapshot) => sampleFromSnapshot(snapshot, fillNotionalUsd))
          .filter((sample): sample is CostSample => sample !== null);
        const p25Sample = percentileSample(historicalSamples, 0.25) ?? latestSample;
        const p50Sample = percentileSample(historicalSamples, 0.5) ?? latestSample;
        const p75Sample = percentileSample(historicalSamples, 0.75) ?? latestSample;
        if (
          latestSample === null || p25Sample === null || p50Sample === null || p75Sample === null ||
          volume24hUsd === null || oiRaw === null ||
          oiRaw * 2 < MIN_OPEN_INTEREST_USD || volume24hUsd < MIN_VOLUME_USD
        ) {
          return null;
        }
        // Newer snapshots use the venue's native quote points. Older rows use
        // the legacy stored anchors, so historical range data stays usable.
        const latestLegBps = latestSample.legBps;
        const p25LegBps = p25Sample.legBps;
        const p50LegBps = p50Sample.legBps;
        const p75LegBps = p75Sample.legBps;
        const costFromLegBps = (legBps: number) => (2 * fillNotionalUsd * legBps) / 10_000;
        const cycleCostUsd = costFromLegBps(p50LegBps);
        const costTier: CostTier = p50LegBps <= 2 ? "low" : p50LegBps <= 6 ? "medium" : "high";
        return {
          pair: row.pair,
          // Omni displays gross OI (user side plus OLP counterparty); the
          // stored value is one side, so double it to match that convention.
          openInterestUsd: oiRaw * 2,
          volume24hUsd,
          competitionEligible: TRADFI_TICKERS.has(row.pair),
          firstLimitSide: liveSide?.firstLimitSide ?? "long",
          quoteAsOf: liveSide?.quoteAsOf ?? row.book_ts,
          cycleCostUsd,
          latestCycleCostUsd: costFromLegBps(latestLegBps),
          costRangeLowUsd: costFromLegBps(p25LegBps),
          costRangeHighUsd: costFromLegBps(p75LegBps),
          // The planning breakdown uses p50 values, matching cycleCostUsd.
          spreadCostUsd: (fillNotionalUsd * p50Sample.spreadBps) / 10_000,
          slippageCostUsd: (2 * fillNotionalUsd * p50Sample.impactBps) / 10_000,
          costTier,
        };
      })
      .filter((value): value is PairRanking => value !== null);

    // "Only TradFi" toggle: rank just the competition-eligible (TradFi) pairs.
    const filtered = tradfiOnly ? candidates.filter((c) => c.competitionEligible) : candidates;
    if (filtered.length === 0) {
      throw new Error(
        tradfiOnly
          ? "No liquid TradFi markets in the latest snapshot"
          : "No liquid Variational markets in the latest snapshot",
      );
    }

    let grouped: boolean;
    let bands: Band[];
    if (filtered.length < MIN_PAIRS_FOR_BANDS) {
      grouped = false;
      bands = [bandFrom("all", filtered, filtered.length)];
    } else {
      grouped = true;
      // Fixed OI thresholds (gross OI). Bands may be uneven — that's fine.
      bands = [
        bandFrom("high", filtered.filter((p) => p.openInterestUsd > HIGH_OI_USD), 10),
        bandFrom("medium", filtered.filter((p) => p.openInterestUsd > MEDIUM_OI_USD && p.openInterestUsd <= HIGH_OI_USD), 10),
        bandFrom("low", filtered.filter((p) => p.openInterestUsd <= MEDIUM_OI_USD), 10),
      ];
    }

    const asOf = candidates.reduce(
      (oldest, candidate) => (candidate.quoteAsOf < oldest ? candidate.quoteAsOf : oldest),
      candidates[0]?.quoteAsOf ?? new Date().toISOString(),
    );

    return NextResponse.json(
      {
        asOf,
        fillNotionalUsd,
        accountVolumeUsd,
        totalCycleVolumeUsd,
        holdHours: HOLD_HOURS,
        minVolumeUsd: MIN_VOLUME_USD,
        minOpenInterestUsd: MIN_OPEN_INTEREST_USD,
        competition: { active: competitionActive, name: "TradFi Trading Competition #5" },
        // One entry per protocol whose data this run needs — ready for the
        // cross-protocol case, where either side's feed can be down.
        sources: [{ venue: "Variational", live: liveQuotesOk }],
        tradfiOnly,
        grouped,
        bands,
      },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Variational market data" },
      { status: 502 },
    );
  }
}
