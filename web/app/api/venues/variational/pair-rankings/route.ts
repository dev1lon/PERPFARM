import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { loadCostHistory, quoteFromSamples, sampleFromSnapshot } from "@/lib/cost-history";
import { quoteCurveMarketSide } from "@/lib/quote-curve";
import {
  FUNDING_HOLD_HOURS,
  MIN_VOLUME_USD as SHARED_MIN_VOLUME_USD,
  displayedOpenInterestUsd,
  minOpenInterestUsd,
  oiBandFor,
  executionTier,
} from "@/lib/route-model";
import { TRADFI_TICKERS } from "@/lib/tradfi";

export const dynamic = "force-dynamic";

// The requested volume is entry plus exit turnover on one account. The
// two-account hedge has four equal fills and twice that volume in total.
const DEFAULT_ACCOUNT_VOLUME_USD = 100_000;
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
// Pairs below this 24h volume are treated as dead and dropped from the bands.
const MIN_VOLUME_USD = SHARED_MIN_VOLUME_USD;
// Floor and bands come from the shared route model, which keeps the gross-OI
// convention and the formula identical everywhere while letting each protocol
// keep cutoffs that match its own depth.
const MIN_OPEN_INTEREST_USD = minOpenInterestUsd("variational");
// Below this many live pairs the three-way OI split is noise; show one list.
const MIN_PAIRS_FOR_BANDS = 15;
const HOLD_HOURS = FUNDING_HOLD_HOURS;
const TRADFI_COMPETITION_START_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const TRADFI_COMPETITION_END_UTC = Date.UTC(2026, 6, 31, 0, 0, 0);
/** Past this age the newest snapshot is called out as stale in the UI. */
const STALE_SNAPSHOT_MS = 3 * 60 * 60 * 1_000;


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

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function competitionIsActive(now = Date.now()): boolean {
  return now >= TRADFI_COMPETITION_START_UTC && now < TRADFI_COMPETITION_END_UTC;
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
    const [rows, bookHistory] = await Promise.all([
      loadMarkets(),
      loadCostHistory("variational", fillNotionalUsd),
    ]);

    const newestBookTs = rows.reduce<string | null>((newest, row) => (newest === null || row.book_ts > newest ? row.book_ts : newest), null);
    const snapshotsAreFresh = newestBookTs !== null && Date.now() - new Date(newestBookTs).getTime() < STALE_SNAPSHOT_MS;
    const marketRows = new Map(rows.map((row) => [row.pair, row]));

    const candidates = [...marketRows.values()]
      .map((row): PairRanking | null => {
        const volume24hUsd = asNumber(row.volume_24h_usd);
        const oiRaw = asNumber(row.open_interest_usd);
        // Priced from stored snapshots only -- see lib/cost-history.ts. The
        // stored quote curve carries bid AND ask per size, so the side that is
        // cheaper to cross comes out of the same row; no live quote needed.
        const historicalSamples = bookHistory.get(row.pair) ?? [];
        const latestSample = sampleFromSnapshot(row, fillNotionalUsd);
        const quote = quoteFromSamples(null, historicalSamples.length > 0 ? historicalSamples : latestSample ? [latestSample] : []);
        const p25Sample = quote?.low ?? null;
        const p50Sample = quote?.median ?? null;
        const p75Sample = quote?.high ?? null;
        if (
          latestSample === null || p25Sample === null || p50Sample === null || p75Sample === null ||
          volume24hUsd === null || oiRaw === null ||
          displayedOpenInterestUsd(oiRaw, "variational") < MIN_OPEN_INTEREST_USD || volume24hUsd < MIN_VOLUME_USD
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
        // One tier definition for every protocol: total cycle cost including
        // fees, as bps of account volume. Grading Variational on legBps alone
        // happened to work only because its fees are zero -- on TxFlow the same
        // rule badged a 5.7 bps route "Low execution cost".
        // Variational charges 0/0, so the whole cycle cost IS book cost.
        const costTier: CostTier = executionTier(cycleCostUsd, 0, accountVolumeUsd);
        return {
          pair: row.pair,
          // Omni displays gross OI (user side plus OLP counterparty); the
          // stored value is one side, so normalize it to that convention.
          openInterestUsd: displayedOpenInterestUsd(oiRaw, "variational"),
          volume24hUsd,
          competitionEligible: TRADFI_TICKERS.has(row.pair),
          firstLimitSide: quoteCurveMarketSide(row.quote_curve_json, fillNotionalUsd)?.firstLimitSide ?? "long",
          quoteAsOf: row.book_ts,
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
      // Bucketed through the shared helper so the boundaries are identical to
      // the ones the cross-protocol table and TxFlow apply.
      bands = [
        bandFrom("high", filtered.filter((p) => oiBandFor(p.openInterestUsd, "variational") === "high"), 10),
        bandFrom("medium", filtered.filter((p) => oiBandFor(p.openInterestUsd, "variational") === "medium"), 10),
        bandFrom("low", filtered.filter((p) => oiBandFor(p.openInterestUsd, "variational") === "low"), 10),
      ];
    }

    // Newest snapshot in the set: this labels when the data was last refreshed,
    // and a single market that skipped a run must not backdate the whole table.
    const asOf = candidates.reduce(
      (newest, candidate) => (candidate.quoteAsOf > newest ? candidate.quoteAsOf : newest),
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
        // Snapshots are the only source now. "live" reports whether the
        // newest one is fresh enough to price from, not whether an API answered.
        sources: [{ venue: "Variational", live: snapshotsAreFresh }],
        // What the headline number is, stated by the API rather than inferred
        // by the page from which protocol was opened.
        costBasis: bookHistory.size > 0 ? "24h-median" : "live-book",
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
