import { NextResponse } from "next/server";

const POLYMARKET_EVENT_URL = "https://gamma-api.polymarket.com/events/slug/variational-fdv-above-one-day-after-launch";

// The market moves continuously, but a short cache keeps the public endpoint
// responsive and prevents every page view from becoming an upstream request.
export const revalidate = 300;

type FdvMarket = {
  threshold: string;
  probability: number;
  volume: number;
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

export async function GET() {
  try {
    const response = await fetch(POLYMARKET_EVENT_URL, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Polymarket returned ${response.status}`);

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.markets)) throw new Error("Polymarket returned an invalid event");

    const markets = payload.markets
      .flatMap((market): FdvMarket[] => {
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
      })
      .sort((a, b) => thresholdValue(a.threshold) - thresholdValue(b.threshold));

    if (markets.length === 0) throw new Error("Polymarket did not return any FDV markets");

    return NextResponse.json({
      asOf: new Date().toISOString(),
      eventVolume: asNumber(payload.volume),
      markets,
    });
  } catch {
    return NextResponse.json({ error: "Could not load Polymarket FDV markets" }, { status: 502 });
  }
}
