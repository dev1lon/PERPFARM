/**
 * Prediction-market FDV expectations, read from Polymarket.
 *
 * Extracted from the route handler so the protocol page can render the panel
 * on the server, with the page, instead of the browser asking for it after the
 * page has already painted. The route still exists and calls the same
 * function -- one source for one answer.
 *
 * There is no local history here: the panel shows the market's current view,
 * and the answer is cached for an hour rather than stored.
 */
const POLYMARKET_EVENT_URL =
  "https://gamma-api.polymarket.com/events/slug/variational-fdv-above-one-day-after-launch";

/** Only Variational has a launch-FDV market on Polymarket to read. */
const EVENT_BY_SLUG: Record<string, string> = { variational: POLYMARKET_EVENT_URL };

export const FDV_REVALIDATE_SECONDS = 3600;

export type FdvMarket = {
  threshold: string;
  probability: number;
  volume: number;
  /**
   * How far the odds moved in the last 24 hours, in the same units as
   * `probability` -- so 44 with a change of 11 means it read 33 yesterday.
   * Polymarket's own `oneDayPriceChange`; null when it does not publish one.
   */
  dayChange: number | null;
};

export type FdvMarketResponse = {
  asOf: string;
  eventVolume: number | null;
  markets: FdvMarket[];
};

export function hasFdvMarket(slug: string): boolean {
  return slug in EVENT_BY_SLUG;
}

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

/** The event's current markets, or null where the protocol has no such event. */
export async function loadFdvMarkets(slug: string): Promise<FdvMarketResponse | null> {
  const eventUrl = EVENT_BY_SLUG[slug];
  if (!eventUrl) return null;

  const response = await fetch(eventUrl, {
    next: { revalidate: FDV_REVALIDATE_SECONDS },
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
    const dayChange = asNumber(market.oneDayPriceChange);
    return threshold && probability !== null && volume !== null
      ? [{
          threshold,
          probability: Math.round(probability * 100),
          volume,
          dayChange: dayChange === null ? null : Math.round(dayChange * 100),
        }]
      : [];
  }));
  if (markets.length === 0) throw new Error("Polymarket did not return any FDV markets");

  return {
    asOf: new Date().toISOString(),
    eventVolume: asNumber(payload.volume),
    markets,
  };
}
