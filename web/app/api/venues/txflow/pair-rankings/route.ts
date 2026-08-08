import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INFO_URL = "https://api.txflow.com/info";
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;
const MAKER_FEE_BPS = 1.5;
const TAKER_FEE_BPS = 4.5;

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

async function info<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
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

    const rows = await mapLimit(markets, 8, async (market) => {
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
        // A delta-neutral cycle executes two maker and two taker fills, each
        // at the requested half-account notional. The active side uses its
        // real L2 VWAP; the resting side uses TxFlow's published VIP-0 maker fee.
        const cycleCostUsd = 2 * fillNotionalUsd * (marketBps + TAKER_FEE_BPS + MAKER_FEE_BPS) / 10_000;
        const spreadBps = (ask - bid) / mid * 10_000;
        const spreadCostUsd = 2 * fillNotionalUsd * (spreadBps / 2) / 10_000;
        const slippageCostUsd = 2 * fillNotionalUsd * Math.max(marketBps - spreadBps / 2, 0) / 10_000;
        return {
          pair: market.baseCurrency,
          openInterestUsd: Math.round(mark * oiBase),
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
          costTier: costTier(marketBps),
        };
      } catch {
        return null;
      }
    });
    const pairs = rows.filter((row): row is NonNullable<typeof row> => row !== null).sort((left, right) => left.cycleCostUsd - right.cycleCostUsd);
    if (pairs.length === 0) throw new Error("No TxFlow markets are currently quotable for this size");
    const ois = pairs.map((pair) => pair.openInterestUsd);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      fillNotionalUsd,
      accountVolumeUsd,
      totalCycleVolumeUsd: accountVolumeUsd * 2,
      holdHours: 0,
      minVolumeUsd: 0,
      minOpenInterestUsd: 0,
      competition: { active: false, name: "" },
      sources: [{ venue: "TxFlow", live: true }],
      grouped: false,
      bands: [{ key: "all", oiRangeUsd: [Math.min(...ois), Math.max(...ois)], pairs }],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load TxFlow market data" }, { status: 502 });
  }
}
