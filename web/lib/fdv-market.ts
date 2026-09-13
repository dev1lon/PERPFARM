/**
 * Prediction-market expectations for a protocol's token, read from Polymarket.
 *
 * Extracted from the route handler so the protocol page can render the panel
 * on the server, with the page, instead of the browser asking for it after the
 * page has already painted. The route still exists and calls the same
 * function -- one source for one answer.
 *
 * There is no local history here: the panel shows the market's current view,
 * and the answer is cached for an hour rather than stored.
 */

/**
 * What the public market actually asks, because it is not the same question
 * everywhere: Variational and QFEX have markets on the FDV one day after
 * launch, while RiseX and Hibachi only have markets on WHETHER a token launches
 * by a given date. Both are drawn, each in its own words -- reading a launch
 * market as an FDV would claim a number nobody is trading.
 */
export type FdvEventKind = "fdv" | "launch";

/** Which book the odds are read from. Each answers a different API. */
export type MarketSource = "polymarket" | "predictfun";

type MarketEvent = {
  kind: FdvEventKind;
  source: MarketSource;
  /** The event slug, which is also its API path and its page URL. */
  slug: string;
  /** The page a reader opens; Variational's carries the referral it shipped with. */
  page: string;
};

const EVENTS: Record<string, MarketEvent> = {
  variational: {
    kind: "fdv",
    source: "polymarket",
    slug: "variational-fdv-above-one-day-after-launch",
    page: "https://polymarket.com/event/variational-fdv-above-one-day-after-launch?r=DEVIL0N#vPCdW9Y",
  },
  qfex: {
    kind: "fdv",
    source: "polymarket",
    slug: "qfex-fdv-above-one-day-after-launch",
    page: "https://polymarket.com/event/qfex-fdv-above-one-day-after-launch",
  },
  risex: {
    kind: "launch",
    source: "polymarket",
    slug: "will-risex-launch-a-token-by-20260708174012702",
    page: "https://polymarket.com/event/will-risex-launch-a-token-by-20260708174012702",
  },
  hibachi: {
    kind: "launch",
    source: "polymarket",
    slug: "will-hibachi-launch-a-token-by",
    page: "https://polymarket.com/event/will-hibachi-launch-a-token-by",
  },
  // Polymarket's own token trades on Predict, not on Polymarket itself.
  polymarket: {
    kind: "fdv",
    source: "predictfun",
    slug: "polymarket-official-token-fdv-above-one-day-after-launch",
    page: "https://predict.fun/market/polymarket-official-token-fdv-above-one-day-after-launch",
  },
};

/**
 * Predict answers its REST API only with a key, and the key we hold is bound to
 * one browser origin -- so a server call has to state that origin itself or the
 * API refuses it (401). The key is a secret and lives in the environment; the
 * origin is not, and is written here so a deploy cannot forget half of the pair.
 */
const PREDICT_FUN_API = "https://api.predict.fun/v1";
const PREDICT_FUN_ORIGIN = process.env.PREDICT_FUN_ORIGIN ?? "https://perpfarm.vercel.app";

export const FDV_REVALIDATE_SECONDS = 3600;

export type FdvMarket = {
  threshold: string;
  probability: number;
  /** Total traded on that threshold; null where the source publishes none. */
  volume: number | null;
  /**
   * How far the odds moved in the last 24 hours, in the same units as
   * `probability` -- so 44 with a change of 11 means it read 33 yesterday.
   * Polymarket's own `oneDayPriceChange`; null when it does not publish one.
   */
  dayChange: number | null;
};

export type FdvMarketResponse = {
  asOf: string;
  kind: FdvEventKind;
  source: MarketSource;
  eventVolume: number | null;
  markets: FdvMarket[];
};

export function hasFdvMarket(slug: string): boolean {
  return slug in EVENTS;
}

/** The event a protocol has, or null -- the panel asks before it draws. */
export function fdvEvent(slug: string): MarketEvent | null {
  return EVENTS[slug] ?? null;
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

/**
 * "September 30, 2026" -> "Sep 30, 2026"; anything else is left alone.
 *
 * Parsed AND printed in UTC. Parsed as local time it lands at midnight in the
 * machine's zone, and printing that in UTC walks a date east of Greenwich back
 * a day -- "September 30" rendered as "Sep 29" on this machine.
 */
function shortDate(label: string): string {
  const at = Date.parse(`${label} UTC`);
  if (!Number.isFinite(at)) return label;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(at);
}

function sortMarkets(markets: FdvMarket[], kind: FdvEventKind): FdvMarket[] {
  return markets.sort((a, b) =>
    kind === "launch"
      ? Date.parse(a.threshold) - Date.parse(b.threshold)
      : thresholdValue(a.threshold) - thresholdValue(b.threshold),
  );
}

/** The event's current markets, or null where the protocol has no such event. */
export async function loadFdvMarkets(slug: string): Promise<FdvMarketResponse | null> {
  const event = EVENTS[slug];
  if (!event) return null;
  return event.source === "predictfun" ? loadPredictEvent(event) : loadPolymarketEvent(event);
}

/**
 * One Predict call, authorised the way that API wants it.
 *
 * The key is a secret and never reaches the browser: this runs on the server,
 * and the panel receives only the odds it returns.
 */
async function predictGet(path: string): Promise<Record<string, unknown>> {
  const key = process.env.PREDICT_FUN_API_KEY;
  if (!key) throw new Error("PREDICT_FUN_API_KEY is not set");

  const response = await fetch(`${PREDICT_FUN_API}${path}`, {
    headers: { "x-api-key": key, Origin: PREDICT_FUN_ORIGIN, Accept: "application/json" },
    next: { revalidate: FDV_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Predict returned ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error("Predict returned an invalid answer");
  return payload.data;
}

/** The mid of the Yes side, which is the market's own read on the chance. */
function yesChance(market: Record<string, unknown>): number | null {
  const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
  const yes = outcomes.find((outcome) => isRecord(outcome) && outcome.name === "Yes");
  if (!isRecord(yes)) return null;
  const bid = isRecord(yes.bestBid) ? asNumber(yes.bestBid.price) : null;
  const ask = isRecord(yes.bestAsk) ? asNumber(yes.bestAsk.price) : null;
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  return bid ?? ask;
}

/**
 * Predict publishes no 24h price move and no per-market volume on the event, so
 * the volume is asked for per market and the move is left absent rather than
 * derived from a history this panel does not keep.
 */
async function loadPredictEvent(event: MarketEvent): Promise<FdvMarketResponse> {
  const data = await predictGet(`/categories/${event.slug}`);
  const rows = Array.isArray(data.markets) ? data.markets : [];

  const markets = await Promise.all(rows.flatMap((row): Array<Promise<FdvMarket>> => {
    if (!isRecord(row)) return [];
    // A resolved market prices at 0 or 1 and is no longer an expectation.
    if (row.resolution !== null && row.resolution !== undefined) return [];
    const threshold = typeof row.title === "string" ? row.title : "";
    const chance = yesChance(row);
    if (!threshold || chance === null) return [];
    const id = asNumber(row.id);
    return [(async () => ({
      threshold,
      probability: Math.round(chance * 100),
      // A failed stats call costs the volume line, not the odds.
      volume: id === null ? null : await predictGet(`/markets/${id}/stats`)
        .then((stats) => asNumber(stats.volumeTotalUsd))
        .catch(() => null),
      dayChange: null,
    }))()];
  }));
  if (markets.length === 0) throw new Error("Predict did not return any open markets");

  const stats = isRecord(data.stats) ? data.stats : {};
  return {
    asOf: new Date().toISOString(),
    kind: event.kind,
    source: event.source,
    eventVolume: asNumber(stats.volumeTotalUsd),
    markets: sortMarkets(markets, event.kind),
  };
}

async function loadPolymarketEvent(event: MarketEvent): Promise<FdvMarketResponse> {
  const response = await fetch(`https://gamma-api.polymarket.com/events/slug/${event.slug}`, {
    next: { revalidate: FDV_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Polymarket returned ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.markets)) throw new Error("Polymarket returned an invalid event");

  const markets = sortMarkets(payload.markets.flatMap((market): FdvMarket[] => {
    if (!isRecord(market)) return [];
    // A resolved market prices at 0 or 1 and is not an expectation any more --
    // Hibachi's "by March 2026" and "by June 2026" both passed.
    if (market.closed === true) return [];
    const label = typeof market.groupItemTitle === "string"
      ? market.groupItemTitle
      : typeof market.question === "string"
        ? market.question.match(/\$[\d.]+\s*[MB]/i)?.[0] ?? ""
        : "";
    const threshold = event.kind === "launch" ? shortDate(label) : label;
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
  }), event.kind);
  if (markets.length === 0) throw new Error("Polymarket did not return any open markets");

  return {
    asOf: new Date().toISOString(),
    kind: event.kind,
    source: event.source,
    eventVolume: asNumber(payload.volume),
    markets,
  };
}
