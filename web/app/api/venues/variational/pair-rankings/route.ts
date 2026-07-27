import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { chooseFirstLimitSide, type QuotePair } from "@/lib/variational-quotes";

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
  spread_bps: string | number | null;
  impact_bps_10k: string | number | null;
  impact_bps_50k: string | number | null;
  impact_bps_100k: string | number | null;
  spread_bps_p25: string | number | null;
  spread_bps_p50: string | number | null;
  spread_bps_p75: string | number | null;
  impact_bps_10k_p25: string | number | null;
  impact_bps_10k_p50: string | number | null;
  impact_bps_10k_p75: string | number | null;
  impact_bps_50k_p25: string | number | null;
  impact_bps_50k_p50: string | number | null;
  impact_bps_50k_p75: string | number | null;
  impact_bps_100k_p25: string | number | null;
  impact_bps_100k_p50: string | number | null;
  impact_bps_100k_p75: string | number | null;
  volume_24h_usd: string | number | null;
  open_interest_usd: string | number | null;
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
};

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

/**
 * The two MARKET fills have the same direction: LIMIT LONG first means two
 * sells; LIMIT SHORT first means two buys. Pick the cheaper live side. The
 * 24h median remains based on saved direction-averaged observations.
 */
async function loadLiveSideCosts(fillNotionalUsd: number): Promise<Map<string, LiveSideCost>> {
  const response = await fetch(VARIATIONAL_STATS_URL, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Variational stats returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.listings)) throw new Error("Invalid Variational stats");

  const costs = new Map<string, LiveSideCost>();
  for (const listing of payload.listings) {
    if (!isRecord(listing) || typeof listing.ticker !== "string" || !isRecord(listing.quotes)) continue;
    const base = quotePair(listing.quotes.base) ?? quotePair(listing.quotes.size_1k);
    const oneK = quotePair(listing.quotes.size_1k);
    const hundredK = quotePair(listing.quotes.size_100k);
    const mark = asNumber(listing.mark_price);
    if (!base || !oneK || !hundredK || mark === null || mark <= 0) continue;
    const side = chooseFirstLimitSide({ notional: fillNotionalUsd, mark, base, oneK, hundredK });
    costs.set(listing.ticker, {
      firstLimitSide: side.firstLimitSide,
      marketImpactBps: side.marketImpactBps,
      spreadBps: asNumber(listing.base_spread_bps),
      quoteAsOf: typeof listing.quotes.updated_at === "string" ? listing.quotes.updated_at : null,
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
         b.market_id, b.ts AS book_ts, b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       WHERE m.venue_id = (SELECT id FROM v)
         AND b.ts >= now() - interval '7 days'
       ORDER BY b.market_id, b.ts DESC
     ),
     book_24h AS (
       SELECT b.market_id,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY b.spread_bps::double precision) AS spread_bps_p25,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY b.spread_bps::double precision) AS spread_bps_p50,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY b.spread_bps::double precision) AS spread_bps_p75,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY b.impact_bps_10k::double precision) AS impact_bps_10k_p25,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY b.impact_bps_10k::double precision) AS impact_bps_10k_p50,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY b.impact_bps_10k::double precision) AS impact_bps_10k_p75,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY b.impact_bps_50k::double precision) AS impact_bps_50k_p25,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY b.impact_bps_50k::double precision) AS impact_bps_50k_p50,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY b.impact_bps_50k::double precision) AS impact_bps_50k_p75,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY b.impact_bps_100k::double precision) AS impact_bps_100k_p25,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY b.impact_bps_100k::double precision) AS impact_bps_100k_p50,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY b.impact_bps_100k::double precision) AS impact_bps_100k_p75
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       WHERE m.venue_id = (SELECT id FROM v)
         AND b.ts >= now() - interval '24 hours'
       GROUP BY b.market_id
     ),
     vol AS (
       SELECT DISTINCT ON (s.market_id)
         s.market_id, s.volume_24h_usd, s.open_interest_usd
       FROM volume_snapshots s
       JOIN markets m ON m.id = s.market_id
       WHERE m.venue_id = (SELECT id FROM v)
         AND s.ts >= now() - interval '7 days'
       ORDER BY s.market_id, s.ts DESC
     )
     SELECT book.book_ts, m.symbol_canonical AS pair,
            book.spread_bps, book.impact_bps_10k, book.impact_bps_50k, book.impact_bps_100k,
            book_24h.spread_bps_p25, book_24h.spread_bps_p50, book_24h.spread_bps_p75,
            book_24h.impact_bps_10k_p25, book_24h.impact_bps_10k_p50, book_24h.impact_bps_10k_p75,
            book_24h.impact_bps_50k_p25, book_24h.impact_bps_50k_p50, book_24h.impact_bps_50k_p75,
            book_24h.impact_bps_100k_p25, book_24h.impact_bps_100k_p50, book_24h.impact_bps_100k_p75,
            vol.volume_24h_usd, vol.open_interest_usd
     FROM markets m
     JOIN v ON v.id = m.venue_id
     JOIN book ON book.market_id = m.id
     LEFT JOIN book_24h ON book_24h.market_id = m.id
     JOIN vol ON vol.market_id = m.id
     WHERE m.is_active = true`,
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

    const [rows, liveSideCosts] = await Promise.all([
      loadMarkets(),
      loadLiveSideCosts(fillNotionalUsd).catch(() => new Map<string, LiveSideCost>()),
    ]);

    const candidates = rows
      .map((row): PairRanking | null => {
        const spreadBps = asNumber(row.spread_bps);
        const volume24hUsd = asNumber(row.volume_24h_usd);
        const oiRaw = asNumber(row.open_interest_usd);
        const liveSide = liveSideCosts.get(row.pair);
        const storedLatestImpactBps = impactAtNotional(fillNotionalUsd, [
          [10_000, asNumber(row.impact_bps_10k)],
          [50_000, asNumber(row.impact_bps_50k)],
          [100_000, asNumber(row.impact_bps_100k)],
        ]);
        const latestImpactBps = liveSide?.marketImpactBps ?? storedLatestImpactBps;
        const impactAtPercentile = (percentile: "p25" | "p50" | "p75") =>
          impactAtNotional(fillNotionalUsd, [
            [10_000, asNumber(row[`impact_bps_10k_${percentile}`])],
            [50_000, asNumber(row[`impact_bps_50k_${percentile}`])],
            [100_000, asNumber(row[`impact_bps_100k_${percentile}`])],
          ]);
        const p25ImpactBps = impactAtPercentile("p25") ?? latestImpactBps;
        const p50ImpactBps = impactAtPercentile("p50") ?? latestImpactBps;
        const p75ImpactBps = impactAtPercentile("p75") ?? latestImpactBps;
        const p25SpreadBps = asNumber(row.spread_bps_p25) ?? spreadBps;
        const p50SpreadBps = asNumber(row.spread_bps_p50) ?? spreadBps;
        const p75SpreadBps = asNumber(row.spread_bps_p75) ?? spreadBps;
        if (
          spreadBps === null || latestImpactBps === null || p25ImpactBps === null || p50ImpactBps === null || p75ImpactBps === null ||
          p25SpreadBps === null || p50SpreadBps === null || p75SpreadBps === null || volume24hUsd === null || oiRaw === null ||
          oiRaw * 2 < MIN_OPEN_INTEREST_USD || volume24hUsd < MIN_VOLUME_USD
        ) {
          return null;
        }
        // Two market legs cross half-spread plus quote impact. The number shown
        // to users is the 24h median planning estimate; the latest sample and
        // p25-p75 range remain visible so one stale quote cannot dominate a run.
        const latestLegBps = (liveSide?.spreadBps ?? spreadBps) / 2 + latestImpactBps;
        const p25LegBps = p25SpreadBps / 2 + p25ImpactBps;
        const p50LegBps = p50SpreadBps / 2 + p50ImpactBps;
        const p75LegBps = p75SpreadBps / 2 + p75ImpactBps;
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
          spreadCostUsd: (fillNotionalUsd * p50SpreadBps) / 10_000,
          slippageCostUsd: (2 * fillNotionalUsd * p50ImpactBps) / 10_000,
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
