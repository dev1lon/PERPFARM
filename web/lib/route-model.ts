/**
 * The one definition of how a farming route is priced and bucketed.
 *
 * Three calculators quote the same product -- Variational same-protocol, TxFlow
 * same-protocol, and the cross-protocol route -- and each used to carry its own
 * copy of these numbers. They drifted: the funding horizon was 24h in one, 12h
 * in another and absent in the third, and the OI bands differed by two orders
 * of magnitude, so the same market landed in "high" on one page and "low" on
 * the next. Importing from here is what keeps the three answers comparable.
 */

/**
 * Funding is quoted for a fixed 12-hour hold on every protocol.
 *
 * A hold length has to be assumed to put a number on funding at all, and a
 * constant one keeps pairs comparable. It is NOT part of the route's cost: it
 * has its own sign, it can be a credit as easily as a charge, and it drifts
 * during the hold. Ranking uses execution cost; funding is reported beside it.
 */
export const FUNDING_HOLD_HOURS = 12;

/** Funding is averaged over this window before the 12-hour hold is applied. */
export const FUNDING_AVERAGE_WINDOW_HOURS = 24;

export const HOURS_PER_YEAR = 8_760;

/**
 * A market is hidden only when it is DEAD: under this 24h volume AND under the
 * open interest below, both at once.
 *
 * There used to be per-protocol floors ($1,000 of volume everywhere, and $10k
 * to $100k of open interest depending on the venue). They removed real markets
 * a farmer can use: Variational's TWT turned over $350 in a day with $55k of
 * open interest -- thin, but open and hedgeable -- and Hibachi's AUD, CAD and
 * NZD sat at $6-8k of open interest. Liquidity is a cost the table already
 * prices (spread and depth); it is not a reason to hide a market. The one thing
 * worth hiding is a listing nobody trades and nobody holds.
 */
/**
 * A market whose newest book is this far behind its venue's newest one got no
 * quote in the latest run: it is shut for now -- a Variational swap's daily
 * 17:00-18:00 ET break, an equity perp over a holiday. A run takes minutes, so
 * half an hour cannot catch a market merely read late in the same run.
 */
export const QUOTE_CLOSED_AFTER_MS = 30 * 60_000;
/** Past a day it is no longer a break but a market that stopped quoting. */
export const QUOTE_GONE_AFTER_MS = 24 * 60 * 60_000;

/**
 * How long a run takes to finish landing. Every book in a run carries the
 * run's START time, but the rows arrive over the next few minutes (Variational's
 * 552 took about four), so while a run is still landing half a venue looks a
 * run behind. Judged against the newest book alone, 272 of Variational's
 * markets -- PUMP among them -- read as closed. Until a run has settled, the
 * run before it is the reference. trade.xyz's late second pass (+9 to +15
 * minutes) stays inside QUOTE_CLOSED_AFTER_MS either way.
 */
export const QUOTE_RUN_SETTLE_MS = 15 * 60_000;

/** The run a venue's markets are judged against, in ms; null with no books. */
export function referenceRunMs(bookTimes: Iterable<string | Date>, nowMs: number = Date.now()): number | null {
  const times = [...bookTimes].map((ts) => new Date(ts).getTime()).filter((ms) => Number.isFinite(ms));
  if (times.length === 0) return null;
  const newest = Math.max(...times);
  if (nowMs - newest >= QUOTE_RUN_SETTLE_MS) return newest;
  const settled = times.filter((ms) => newest - ms > QUOTE_CLOSED_AFTER_MS);
  return settled.length > 0 ? Math.max(...settled) : null;
}

/** How far a market's newest book trails the reference run, in ms. */
export function quoteLagMs(bookTs: string | Date, referenceMs: number | null): number {
  if (referenceMs === null) return 0;
  const lag = referenceMs - new Date(bookTs).getTime();
  return Number.isFinite(lag) ? Math.max(0, lag) : 0;
}

export const DEAD_MARKET_VOLUME_USD = 100;
export const DEAD_MARKET_OI_USD = 1_000;

/** True only for a listing with near-zero volume AND near-zero open interest. */
export function isDeadMarket(volume24hUsd: number, displayedOiUsd: number): boolean {
  return volume24hUsd < DEAD_MARKET_VOLUME_USD && displayedOiUsd < DEAD_MARKET_OI_USD;
}

/**
 * Account volumes are priced on a $100 grid.
 *
 * Every distinct number a visitor types is its own cached answer, and a typed
 * figure is arbitrary: $20,450 and $20,500 are the same trade. Snapping to $100
 * means the second person to ask a near-identical question is served the first
 * one's answer instead of repricing several hundred markets for it.
 *
 * $100 and no coarser, because the answer moves with size and the user has to
 * be able to see that: at the bottom of the allowed range ($1,000) one step is
 * a tenth of the position. The snapped value is what gets priced AND what the
 * response reports, so the number on screen is always the number that was
 * costed.
 */
export const ACCOUNT_VOLUME_STEP_USD = 100;

export function quantizeAccountVolumeUsd(accountVolumeUsd: number): number {
  return Math.round(accountVolumeUsd / ACCOUNT_VOLUME_STEP_USD) * ACCOUNT_VOLUME_STEP_USD;
}

/**
 * Past this age the newest snapshot is no longer "live".
 *
 * The worker runs hourly, so three hours means it has missed two turns. The
 * rule lives here because every protocol has to answer the freshness question
 * the same way: TxFlow's endpoint used to report `live: true` unconditionally,
 * so a stopped cron kept publishing days-old books as current while the
 * Variational page beside it correctly reported staleness.
 */
export const STALE_SNAPSHOT_MS = 3 * 60 * 60 * 1_000;

/** Whether the newest snapshot in a set is recent enough to price from. */
export function snapshotsAreFresh(newestBookTs: string | null, now = Date.now()): boolean {
  if (newestBookTs === null) return false;
  const takenAt = new Date(newestBookTs).getTime();
  return Number.isFinite(takenAt) && now - takenAt < STALE_SNAPSHOT_MS;
}

/**
 * How a protocol's stored open interest becomes the number we display.
 *
 * Protocols do not agree on what "open interest" counts, so a single global
 * multiplier is guaranteed to be wrong for someone. The rule is to show what
 * the protocol's OWN interface shows, verified per protocol:
 *
 *  - Variational stores long + short and its UI shows twice that (checked
 *    against the venue UI on 2026-08-09).
 *  - TxFlow has no confirmed display adjustment, so we retain its raw API
 *    value. Doubling it made the same market read $51k on its own page and
 *    $102k in the cross table.
 *
 * Anything unverified stays at 1: showing a venue's raw number is a smaller
 * error than confidently doubling it for no reason.
 */
const OI_DISPLAY_FACTOR: Record<string, number> = {
  variational: 2,
  txflow: 1,
};

export function oiDisplayFactor(venueSlug: string): number {
  return OI_DISPLAY_FACTOR[venueSlug] ?? 1;
}

/** Normalize a stored OI observation to this protocol's displayed convention. */
export function displayedOpenInterestUsd(rawOiUsd: number, venueSlug: string): number {
  return rawOiUsd * oiDisplayFactor(venueSlug);
}

/** Band cutoffs. Nothing sits under a floor any more: below `medium` is Low. */
export type OiBands = { high: number; medium: number };

/**
 * OI thresholds, in each protocol's displayed convention. Variational's is
 * gross (long + short); TxFlow's is its unadjusted raw API value. Lower open interest means fewer farmers
 * splitting the same emission, at a wider spread -- so the bands are a
 * points-per-cost trade-off control, not a quality ranking.
 *
 * The CONVENTION and the formula are shared; the numbers cannot be. Protocol
 * OI universes differ by three orders of magnitude -- Variational's markets run
 * $51k to $410M, TxFlow's $7k to $20M -- so a single set of cutoffs puts every
 * Variational market in one band and makes the filter a no-op there.
 */
const DEFAULT_OI_BANDS: OiBands = { high: 300_000, medium: 100_000 };

const OI_BANDS_BY_VENUE: Record<string, OiBands> = {
  // Set against TxFlow's live book, where $358k is a large TradFi market.
  txflow: DEFAULT_OI_BANDS,
  // Variational is a far deeper venue; these are its previously calibrated
  // cutoffs and are what its "Medium OI" guidance refers to.
  variational: { high: 20_000_000, medium: 3_000_000 },
  // Cut at each venue's own terciles, measured from its live book on
  // 2026-08-30. On the TxFlow defaults every QFEX market was "high" -- its
  // book starts where TxFlow's ends -- so Medium and Low were permanently
  // empty tabs, and choosing one emptied the table.
  //
  //   QFEX  162 markets, $0-13.7M (p33 $665k, p66 $1.28M) -> 56 / 54 / 41
  //   RiseX  26 markets, $109k-11.2M (p33 $447k, p66 $2.0M)
  //   Entropy 3 markets, $504k-6.0M -- too few to band.
  qfex: { high: 1_250_000, medium: 650_000 },
  risex: { high: 2_000_000, medium: 450_000 },
  entropy: { high: 3_000_000, medium: 1_000_000 },
  // Polymarket Perps is deliberately NOT listed: its book (p33 $62k, p66
  // $265k) sits almost exactly on the default cutoffs, and all three of its
  // bands fill.
};

export function oiBandsFor(venueSlug: string): OiBands {
  return OI_BANDS_BY_VENUE[venueSlug] ?? DEFAULT_OI_BANDS;
}

export type OiBandKey = "high" | "medium" | "low";

/**
 * Band for a displayed OI figure on a given protocol.
 *
 * Every listed market has one: below Medium is Low. The bands sort the table;
 * they no longer remove anything (see DEAD_MARKET_VOLUME_USD).
 */
export function oiBandFor(displayedOiUsd: number, venueSlug: string): OiBandKey {
  const bands = oiBandsFor(venueSlug);
  if (displayedOiUsd > bands.high) return "high";
  if (displayedOiUsd >= bands.medium) return "medium";
  return "low";
}

/**
 * Below this many eligible pairs the table is not split into OI bands at all.
 *
 * Three tabs over a handful of markets sort them into one populated band and
 * two empty ones, which says more about the cutoffs than about the markets.
 * Shared so the same-protocol and cross-protocol answers group alike.
 */
export const MIN_PAIRS_FOR_BANDS = 15;

/** The tab keys the results table offers: the three OI bands plus "All". */
export type BandFilterKey = OiBandKey | "all";

/**
 * Which band the table can actually show.
 *
 * A response carries only the bands that ended up with pairs in them -- a
 * comparison whose every market is large has a `high` band and nothing else.
 * The tab row is fixed, so a selected band can name one the answer does not
 * contain, and the table then has nothing to draw. On the cross-protocol card
 * that emptied the whole block, tabs included, leaving no way back to a tab
 * that works.
 *
 * So the selection is resolved against the data before it is used: an empty or
 * missing band falls back to "All", which is never empty when there are pairs
 * at all.
 */
export function resolveBandFilter<T>(
  bands: ReadonlyArray<{ key: string; pairs: readonly T[] }>,
  selected: BandFilterKey,
): BandFilterKey {
  if (selected === "all") return "all";
  return bandHasPairs(bands, selected) ? selected : "all";
}

/** Whether a band exists in this answer and has anything to show. */
export function bandHasPairs<T>(
  bands: ReadonlyArray<{ key: string; pairs: readonly T[] }>,
  key: BandFilterKey,
): boolean {
  if (key === "all") return bands.some((band) => band.pairs.length > 0);
  return (bands.find((band) => band.key === key)?.pairs.length ?? 0) > 0;
}
