import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// The requested volume is entry plus exit turnover on one account. The
// two-account hedge has four equal fills and twice that volume in total.
const DEFAULT_ACCOUNT_VOLUME_USD = 100_000;
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
// Pairs below this 24h volume are treated as dead and dropped from the bands.
const MIN_VOLUME_USD = 1_000;
// Below this many live pairs the three-way OI split is noise; show one list.
const MIN_PAIRS_FOR_BANDS = 15;
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
  pair: string;
  spread_bps: string | number | null;
  impact_bps_10k: string | number | null;
  impact_bps_50k: string | number | null;
  impact_bps_100k: string | number | null;
  volume_24h_usd: string | number | null;
  open_interest_usd: string | number | null;
};

type PairRanking = {
  pair: string;
  openInterestUsd: number;
  volume24hUsd: number;
  competitionEligible: boolean;
  firstLimitSide: "long";
  cycleCostUsd: number;
  // Cost breakdown: cycleCost = spread + slippage (funding nets to 0; Variational
  // is 0% maker/taker so there are no fees). The two LIMIT legs are free; the two
  // MARKET legs carry the whole cost, half on each account.
  spreadCostUsd: number;
  slippageCostUsd: number;
};

type Band = { key: "high" | "medium" | "low" | "all"; oiRangeUsd: [number, number]; pairs: PairRanking[] };

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function competitionIsActive(now = Date.now()): boolean {
  return now >= TRADFI_COMPETITION_START_UTC && now < TRADFI_COMPETITION_END_UTC;
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
    spreadCostUsd: Number(value.spreadCostUsd.toFixed(2)),
    slippageCostUsd: Number(value.slippageCostUsd.toFixed(2)),
  };
}

function bandFrom(key: Band["key"], candidates: PairRanking[], limit: number): Band {
  const ois = candidates.map((c) => c.openInterestUsd);
  const pairs = [...candidates].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, limit).map(round);
  return { key, oiRangeUsd: [Math.min(...ois), Math.max(...ois)], pairs };
}

async function loadMarkets(): Promise<MarketRow[]> {
  const { rows } = await getPool().query<MarketRow>(
    `WITH v AS (SELECT id FROM venues WHERE slug = 'variational'),
     book AS (
       SELECT DISTINCT ON (b.market_id)
         b.market_id, b.spread_bps, b.impact_bps_10k, b.impact_bps_50k, b.impact_bps_100k
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
     SELECT m.symbol_canonical AS pair,
            book.spread_bps, book.impact_bps_10k, book.impact_bps_50k, book.impact_bps_100k,
            vol.volume_24h_usd, vol.open_interest_usd
     FROM markets m
     JOIN v ON v.id = m.venue_id
     JOIN book ON book.market_id = m.id
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

    const rows = await loadMarkets();

    const candidates = rows
      .map((row): PairRanking | null => {
        const spreadBps = asNumber(row.spread_bps);
        const volume24hUsd = asNumber(row.volume_24h_usd);
        const oiRaw = asNumber(row.open_interest_usd);
        const impactBps = impactAtNotional(fillNotionalUsd, [
          [10_000, asNumber(row.impact_bps_10k)],
          [50_000, asNumber(row.impact_bps_50k)],
          [100_000, asNumber(row.impact_bps_100k)],
        ]);
        if (
          spreadBps === null || impactBps === null || volume24hUsd === null || oiRaw === null ||
          oiRaw <= 0 || volume24hUsd < MIN_VOLUME_USD
        ) {
          return null;
        }
        // One market leg crosses the half-spread plus impact at the fill size.
        // The limit-first hedge has two such market legs across the two
        // accounts; funding nets to zero at equal long/short size.
        const legBps = spreadBps / 2 + impactBps;
        const cycleCostUsd = (2 * fillNotionalUsd * legBps) / 10_000;
        return {
          pair: row.pair,
          // Omni displays gross OI (user side plus OLP counterparty); the
          // stored value is one side, so double it to match that convention.
          openInterestUsd: oiRaw * 2,
          volume24hUsd,
          competitionEligible: TRADFI_TICKERS.has(row.pair),
          firstLimitSide: "long",
          cycleCostUsd,
          // Two MARKET legs: each crosses half-spread + impact. Split the total.
          spreadCostUsd: (fillNotionalUsd * spreadBps) / 10_000,
          slippageCostUsd: (2 * fillNotionalUsd * impactBps) / 10_000,
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
      const byOi = [...filtered].sort((a, b) => b.openInterestUsd - a.openInterestUsd);
      const size = Math.ceil(byOi.length / 3);
      bands = [
        bandFrom("high", byOi.slice(0, size), 10),
        bandFrom("medium", byOi.slice(size, size * 2), 10),
        bandFrom("low", byOi.slice(size * 2), 10),
      ];
    }

    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        fillNotionalUsd,
        accountVolumeUsd,
        totalCycleVolumeUsd,
        holdHours: HOLD_HOURS,
        minVolumeUsd: MIN_VOLUME_USD,
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
