import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const POLYMARKET_EVENT_URL = "https://gamma-api.polymarket.com/events/slug/variational-fdv-above-one-day-after-launch";

// The worker writes this event once per UTC hour. Force dynamic handling so a
// newly written snapshot is available to the page without a Vercel cache lag.
export const dynamic = "force-dynamic";

type FdvMarket = {
  threshold: string;
  probability: number;
  volume: number;
};

type FdvMarketResponse = {
  asOf: string;
  eventVolume: number | null;
  markets: FdvMarket[];
  source: "hourly-snapshot" | "live-fallback";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function thresholdValue(label: string): number {
  const match = label.match(/\$([\d.]+)\s*([MB])/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount * (match[2].toUpperCase() === "B" ? 1_000 : 1) : Number.MAX_SAFE_INTEGER;
}

function sortMarkets(markets: FdvMarket[]): FdvMarket[] {
  return markets.sort((a, b) => thresholdValue(a.threshold) - thresholdValue(b.threshold));
}

async function getLatestSnapshot(): Promise<FdvMarketResponse | null> {
  try {
    const { rows } = await getPool().query<{
      ts: Date | string;
      threshold: string;
      probability_pct: number | string;
      volume_usd: number | string;
      event_volume_usd: number | string | null;
    }>(
      `SELECT ts, threshold, probability_pct, volume_usd, event_volume_usd
       FROM variational_fdv_market_snapshots
       WHERE ts = (SELECT MAX(ts) FROM variational_fdv_market_snapshots)`,
    );
    if (rows.length === 0) return null;

    const markets = sortMarkets(rows.map((row) => ({
      threshold: row.threshold,
      probability: Number(row.probability_pct),
      volume: Number(row.volume_usd),
    }))).filter((market) => Number.isFinite(market.probability) && Number.isFinite(market.volume));
    if (markets.length === 0) return null;

    return {
      asOf: new Date(rows[0].ts).toISOString(),
      eventVolume: asNumber(rows[0].event_volume_usd),
      markets,
      source: "hourly-snapshot",
    };
  } catch {
    // The migration is applied separately from the Vercel deploy. Before the
    // first snapshot exists, retain a live public fallback instead of blanking
    // the FDV panel.
    return null;
  }
}

async function getLiveFallback(): Promise<FdvMarketResponse> {
  const response = await fetch(POLYMARKET_EVENT_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Polymarket returned ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.markets)) throw new Error("Polymarket returned an invalid event");

  const markets = sortMarkets(payload.markets.flatMap((market): FdvMarket[] => {
    if (!isRecord(market)) return [];
    const threshold = typeof market.groupItemTitle === "string"
      ? market.groupItemTitle
      : typeof market.question === "string"
        ? market.question.match(/\$[\d.]+\s*[MB]/i)?.[0] ?? ""
        : "";
    const outcomes = stringList(market.outcomes);
    const prices = stringList(market.outcomePrices).map(asNumber);
    const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
    const probability = yesIndex >= 0 ? prices[yesIndex] : null;
    const volume = asNumber(market.volume);
    return threshold && probability !== null && volume !== null
      ? [{ threshold, probability: Math.round(probability * 100), volume }]
      : [];
  }));
  if (markets.length === 0) throw new Error("Polymarket did not return any FDV markets");

  return {
    asOf: new Date().toISOString(),
    eventVolume: asNumber(payload.volume),
    markets,
    source: "live-fallback",
  };
}

export async function GET() {
  const snapshot = await getLatestSnapshot();
  if (snapshot) return NextResponse.json(snapshot);

  try {
    return NextResponse.json(await getLiveFallback());
  } catch {
    return NextResponse.json({ error: "Could not load Polymarket FDV markets" }, { status: 502 });
  }
}
