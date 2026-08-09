import { NextResponse, type NextRequest } from "next/server";
import { FUNDING_HOLD_HOURS, OI_BANDS } from "@/lib/route-model";
import { publishedFees } from "@/lib/venue-fees";

export const dynamic = "force-dynamic";

const INFO_URL = "https://api.txflow.com/info";
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
// Two requests per market, so concurrency is what triggers TxFlow's per-IP
// rate limit. Four in flight is slower than eight but finishes; eight did not.
const REQUEST_CONCURRENCY = 4;
const MAX_RETRIES = 3;
// Fixed product thresholds, shared with every other calculator so a market
// cannot sit in a different band depending on which page asked.
const HIGH_OI_USD = OI_BANDS.high;
const MEDIUM_OI_USD = OI_BANDS.medium;
const LOW_OI_USD = OI_BANDS.low;
// One definition of TxFlow's fees, shared with the cross-protocol model.
const TXFLOW_FEES = publishedFees("txflow")!;
const MAKER_FEE_BPS = TXFLOW_FEES.makerBps; // 0.01425%
const TAKER_FEE_BPS = TXFLOW_FEES.takerBps; // 0.04275%

type CostTier = "low" | "medium" | "high";
type Market = {
  name: string;
  index: number;
  baseCurrency: string;
  haltTrading?: boolean;
  delisted?: boolean;
  tagIds?: number[];
};
type Ticker = {
  markPx: string;
  openInterest: string;
  dayNtlVlm: string;
};

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Thrown when TxFlow rate-limits us, so the caller can say so plainly. */
class RateLimited extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One /info call, retried on 429.
 *
 * Pricing a route needs two requests per market (ticker + L2 book), so a full
 * scan is a burst of ~80 requests against a venue that rate-limits per IP --
 * and on Vercel every visitor's scan shares that IP. A single 429 used to
 * abort the whole scan and surface as a raw "TxFlow returned 429".
 */
async function info<T>(payload: Record<string, unknown>, attempt = 0): Promise<T> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 429) {
    if (attempt >= MAX_RETRIES) throw new RateLimited("rate limited");
    // Honour Retry-After when TxFlow sends one; otherwise back off 400/800ms.
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1_000, 4_000) : 400 * 2 ** attempt);
    return info<T>(payload, attempt + 1);
  }
  if (!response.ok) throw new Error(`TxFlow returned ${response.status}`);
  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.message === "string") throw new Error("TxFlow returned an invalid response");
  return data as T;
}

function levels(value: unknown): Array<[price: number, size: number]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)) return [];
    const price = asNumber(row.px);
    const size = asNumber(row.sz);
    return price !== null && size !== null && price > 0 && size > 0 ? [[price, size] as [number, number]] : [];
  });
}

function vwap(levelsForSide: Array<[number, number]>, notional: number): number | null {
  let remaining = notional;
  let quantity = 0;
  for (const [price, size] of levelsForSide) {
    const taken = Math.min(remaining, price * size);
    quantity += taken / price;
    remaining -= taken;
    if (remaining <= 1e-6) return notional / quantity;
  }
  return null;
}

function costTier(executionBps: number): CostTier {
  return executionBps <= 3 ? "low" : executionBps <= 8 ? "medium" : "high";
}

async function mapLimit<T, R>(items: T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await map(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("accountVolumeUsd");
  const accountVolumeUsd = requested === null ? 20_000 : Number(requested);
  if (!Number.isFinite(accountVolumeUsd) || accountVolumeUsd < MIN_ACCOUNT_VOLUME_USD || accountVolumeUsd > MAX_ACCOUNT_VOLUME_USD) {
    return NextResponse.json({ error: `Account volume must be between $${MIN_ACCOUNT_VOLUME_USD.toLocaleString()} and $${MAX_ACCOUNT_VOLUME_USD.toLocaleString()}` }, { status: 400 });
  }

  try {
    // `?rawTicker=BTC` returns the venue's untouched ticker fields, so funding
    // units can be verified against the venue instead of assumed.
    const rawTicker = request.nextUrl.searchParams.get("rawTicker");
    if (rawTicker) {
      const meta = await info<{ universe?: unknown }>({ type: "perpMeta", dex: "" });
      const universe = Array.isArray(meta.universe) ? (meta.universe as Record<string, unknown>[]) : [];
      const wanted = rawTicker.split(",").map((s) => s.trim().toUpperCase());
      const picked = universe.filter((m) => wanted.includes(String(m.baseCurrency ?? "").toUpperCase()));
      const tickers = await Promise.all(
        picked.map(async (m) => ({
          pair: m.baseCurrency,
          instrumentId: m.index,
          ticker: await info<Record<string, unknown>>({ type: "marketTicker", instrumentId: m.index }),
        })),
      );
      return NextResponse.json({ tickers });
    }

    const metadata = await info<{ universe?: unknown }>({ type: "perpMeta", dex: "" });
    if (!Array.isArray(metadata.universe)) throw new Error("TxFlow returned no market universe");
    const tradfiOnly = request.nextUrl.searchParams.get("tradfiOnly") === "true";
    const markets = metadata.universe
      .filter((value): value is Market => isRecord(value) && typeof value.name === "string" && typeof value.index === "number" && typeof value.baseCurrency === "string")
      .filter((market) => !market.haltTrading && !market.delisted)
      .filter((market) => !tradfiOnly || market.tagIds?.includes(5) === true)
      // The calculator is a TradFi-perps route, not a 159-market crawler. The
      // tag is supplied by TxFlow's own live catalog; BTC/ETH remain useful
      // liquid fallbacks when a TradFi market is closed.
      .filter((market) => market.tagIds?.includes(5) === true || market.baseCurrency === "BTC" || market.baseCurrency === "ETH");
    const fillNotionalUsd = accountVolumeUsd / 2;

    // Counted, not swallowed: a scan that lost half its markets to rate
    // limiting must not look identical to a scan of a thin venue.
    let rateLimitedMarkets = 0;
    const rows = await mapLimit(markets, REQUEST_CONCURRENCY, async (market) => {
      try {
        const [ticker, book] = await Promise.all([
          info<Ticker>({ type: "marketTicker", instrumentId: market.index }),
          info<{ levels?: unknown }>({ type: "l2Book", coin: String(market.index) }),
        ]);
        const rawSides = book.levels;
        if (!Array.isArray(rawSides) || rawSides.length < 2) return null;
        const bids = levels(rawSides[0]);
        const asks = levels(rawSides[1]);
        const bid = bids[0]?.[0];
        const ask = asks[0]?.[0];
        const buyVwap = vwap(asks, fillNotionalUsd);
        const sellVwap = vwap(bids, fillNotionalUsd);
        const mark = asNumber(ticker.markPx);
        const oiBase = asNumber(ticker.openInterest);
        const volume24hUsd = asNumber(ticker.dayNtlVlm);
        if (bid === undefined || ask === undefined || buyVwap === null || sellVwap === null || mark === null || oiBase === null || volume24hUsd === null) return null;
        const mid = (bid + ask) / 2;
        const buyBps = (buyVwap - mid) / mid * 10_000;
        const sellBps = (mid - sellVwap) / mid * 10_000;
        const marketBps = Math.min(buyBps, sellBps);
        const firstLimitSide = buyBps <= sellBps ? "short" : "long";
        // A delta-neutral cycle executes two maker and two taker fills, each at
        // the requested half-account notional. The active side crosses its real
        // L2 book; the resting side pays the maker fee only.
        const cycleCostUsd = 2 * fillNotionalUsd * (marketBps + TAKER_FEE_BPS + MAKER_FEE_BPS) / 10_000;
        const spreadBps = (ask - bid) / mid * 10_000;
        const spreadCostUsd = 2 * fillNotionalUsd * (spreadBps / 2) / 10_000;
        // Whatever the market order pays beyond the half-spread, i.e. how far it
        // walks the book. Zero on a book deep enough to fill at the top level.
        const slippageCostUsd = 2 * fillNotionalUsd * Math.max(marketBps - spreadBps / 2, 0) / 10_000;
        // Fees are most of the cost here and must be reported, not implied:
        // at $10k fills they are $12 of a $12.03 cycle.
        const feeCostUsd = 2 * fillNotionalUsd * (TAKER_FEE_BPS + MAKER_FEE_BPS) / 10_000;
        return {
          pair: market.baseCurrency,
          // Gross OI (long + short), the convention every other surface uses
          // and the one the band thresholds are calibrated against. TxFlow's
          // `openInterest` counts one side, so it is doubled here. Without
          // this the same market read $51k on this page and $108k on the
          // cross-protocol table, and fell in a different band on each.
          openInterestUsd: Math.round(mark * oiBase * 2),
          volume24hUsd: Math.round(volume24hUsd),
          competitionEligible: market.tagIds?.includes(5) === true,
          firstLimitSide,
          quoteAsOf: new Date().toISOString(),
          cycleCostUsd: Number(cycleCostUsd.toFixed(2)),
          latestCycleCostUsd: Number(cycleCostUsd.toFixed(2)),
          costRangeLowUsd: Number(cycleCostUsd.toFixed(2)),
          costRangeHighUsd: Number(cycleCostUsd.toFixed(2)),
          spreadCostUsd: Number(spreadCostUsd.toFixed(2)),
          slippageCostUsd: Number(slippageCostUsd.toFixed(2)),
          feeCostUsd: Number(feeCostUsd.toFixed(2)),
          // Equal long and short on the SAME venue: funding cancels out.
          fundingUsd: 0,
          costTier: costTier(marketBps),
        };
      } catch (error) {
        if (error instanceof RateLimited) rateLimitedMarkets++;
        return null;
      }
    });
    const pairs = rows.filter((row): row is NonNullable<typeof row> => row !== null).filter((row) => row.openInterestUsd >= LOW_OI_USD).sort((left, right) => left.cycleCostUsd - right.cycleCostUsd);
    if (pairs.length === 0) {
      // Name the real cause. "No markets are quotable for this size" blamed the
      // user's volume for what was actually TxFlow throttling us.
      throw new Error(
        rateLimitedMarkets > 0
          ? `TxFlow is rate-limiting requests right now (${rateLimitedMarkets} of ${markets.length} markets). Try again in a minute.`
          : "No TxFlow markets are currently quotable for this size",
      );
    }
    // Fixed OI bands: High >$300k, Medium $100k–$300k, Low $10k–$100k.
    const band = (key: "high" | "medium" | "low", of: typeof pairs) => {
      const bandOis = of.map((pair) => pair.openInterestUsd);
      return {
        key,
        oiRangeUsd: [bandOis.length ? Math.min(...bandOis) : 0, bandOis.length ? Math.max(...bandOis) : 0],
        pairs: of.slice(0, 10),
      };
    };
    const grouped = true;
    const bands = [
      band("high", pairs.filter((p) => p.openInterestUsd > HIGH_OI_USD)),
      band("medium", pairs.filter((p) => p.openInterestUsd >= MEDIUM_OI_USD && p.openInterestUsd <= HIGH_OI_USD)),
      band("low", pairs.filter((p) => p.openInterestUsd >= LOW_OI_USD && p.openInterestUsd < MEDIUM_OI_USD)),
    ].filter((band) => band.pairs.length > 0);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      fillNotionalUsd,
      accountVolumeUsd,
      totalCycleVolumeUsd: accountVolumeUsd * 2,
      // Same 12h horizon every calculator quotes. Funding is $0 here because
      // an equal long and short on the SAME book pay and receive the same
      // rate -- not because the horizon is zero.
      holdHours: FUNDING_HOLD_HOURS,
      minVolumeUsd: 0,
      minOpenInterestUsd: LOW_OI_USD,
      competition: { active: false, name: "" },
      sources: [{ venue: "TxFlow", live: true }],
      grouped,
      bands,
    });
  } catch (error) {
    // A throttled venue is a 503 with a retry hint, not a 502 "bad gateway":
    // nothing is broken and the answer will be there shortly.
    if (error instanceof RateLimited) {
      return NextResponse.json(
        { error: "TxFlow is rate-limiting requests right now. Try again in a minute." },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load TxFlow market data" }, { status: 502 });
  }
}
