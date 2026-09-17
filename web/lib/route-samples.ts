/**
 * One priced observation of a CROSS-venue route, and how two venues' series of
 * observations are lined up with each other.
 *
 * Extracted from cross-cost.ts so both rules can be tested at all: the cross
 * ranking itself reads Postgres through Next's request cache and cannot run
 * outside a request, which is how two defects lived in it unnoticed.
 *
 * The rules, and what went wrong without them:
 *
 *  1. THE ASSIGNMENT TRAVELS WITH THE MONEY. Which venue rests the limit
 *     orders is decided per observation, and the headline is a percentile over
 *     observations -- so the order types displayed must come from the same
 *     observation as the dollars. Reading them off the newest snapshot instead
 *     printed Ondo x Variational TSLA as LIMIT on Ondo and MARKET on
 *     Variational, 1.0 bps of fees ($2 at $20k), above a Fees field of $5 --
 *     the 2.5 bps of the opposite assignment, the one the median had priced.
 *
 *  2. OBSERVATIONS ARE MATCHED BY TIME. A cross route is the joint cost of two
 *     books at ONE moment. Walking the two series by position -- historyA[i]
 *     against historyB[i] -- silently slid every later reading onto a
 *     different hour as soon as one venue missed a collection.
 */
import type { CostSample } from "@/lib/cost-history";

/** What one venue costs per order type, in bps of the turnover done on it. */
export type LegCost = {
  /** Maker fee alone: a resting order crosses nothing. */
  makerFee: number;
  /** Taker fee alone, without the book it has to cross. */
  takerFee: number;
  /** Fee plus half-spread plus quote impact: what crossing actually costs. */
  taker: number;
  /** Half the spread, as paid by the crossing side. */
  spreadBps: number;
  impactBps: number;
};

export type RouteSample = {
  totalUsd: number;
  spreadUsd: number;
  slippageUsd: number;
  feeUsd: number;
  /** Venue whose limit orders rest -- it pays `makerFee` and crosses nothing. */
  makerVenue: string;
  /** Venue whose market orders cross -- it pays `takerFee` and the book. */
  takerVenue: string;
  /** The moment both legs were read at, when both readings carried one. */
  ts: string | null;
};

/** The crossing book of ONE observation, which is all a route sample prices. */
export type TakerBook = Pick<CostSample, "legBps" | "spreadBps" | "impactBps">;

/**
 * One assignment, priced.
 *
 * `accountVolumeUsd` is the turnover each venue does across its open and its
 * close, so a fee in bps applies to it once. The crossing book's `legBps`
 * already carries its half-spread and its impact.
 */
export function routeSampleOf(args: {
  accountVolumeUsd: number;
  makerVenue: string;
  makerFeeBps: number;
  takerVenue: string;
  takerFeeBps: number;
  takerBook: TakerBook;
  ts?: string | null;
}): RouteSample {
  const { accountVolumeUsd, makerVenue, makerFeeBps, takerVenue, takerFeeBps, takerBook } = args;
  const usd = (bps: number) => (accountVolumeUsd * bps) / 10_000;
  const feeBps = makerFeeBps + takerFeeBps;
  return {
    totalUsd: usd(feeBps + takerBook.legBps),
    spreadUsd: usd(takerBook.spreadBps / 2),
    slippageUsd: usd(takerBook.impactBps),
    feeUsd: usd(feeBps),
    makerVenue,
    takerVenue,
    ts: args.ts ?? null,
  };
}

/**
 * Both directions priced, and the cheaper one returned WITH its assignment.
 *
 * Resting on A means crossing B's book, and the other way round; which is
 * cheaper can change from one tick to the next as the two books move. The
 * returned sample therefore always names the venues its own fees came from.
 */
export function cheaperAssignment(args: {
  accountVolumeUsd: number;
  venueA: string;
  costA: LegCost;
  bookA: TakerBook;
  venueB: string;
  costB: LegCost;
  bookB: TakerBook;
  ts?: string | null;
}): RouteSample {
  const { accountVolumeUsd, venueA, costA, bookA, venueB, costB, bookB, ts } = args;
  const restOnA = routeSampleOf({
    accountVolumeUsd,
    makerVenue: venueA,
    makerFeeBps: costA.makerFee,
    takerVenue: venueB,
    takerFeeBps: costB.takerFee,
    takerBook: bookB,
    ts,
  });
  const restOnB = routeSampleOf({
    accountVolumeUsd,
    makerVenue: venueB,
    makerFeeBps: costB.makerFee,
    takerVenue: venueA,
    takerFeeBps: costA.takerFee,
    takerBook: bookA,
    ts,
  });
  return restOnA.totalUsd <= restOnB.totalUsd ? restOnA : restOnB;
}

/**
 * Two series lined up by WHEN they were read, closest first, each reading used
 * at most once.
 *
 * `toleranceMs` is how far apart two readings may sit and still be the same
 * moment: the two venues stamp their books with their own run's start, minutes
 * apart, but a venue that missed a run must find no partner rather than pair
 * with the hour next door. A reading with no timestamp is not matched at all --
 * there is nothing to line it up by.
 */
export function matchByTick<A extends { ts: string | null }, B extends { ts: string | null }>(
  seriesA: readonly A[],
  seriesB: readonly B[],
  toleranceMs: number,
): Array<{ a: A; b: B; gapMs: number }> {
  const dated = <T extends { ts: string | null }>(series: readonly T[]) =>
    series
      .map((entry) => ({ entry, ms: entry.ts === null ? NaN : Date.parse(entry.ts) }))
      .filter((row): row is { entry: T; ms: number } => Number.isFinite(row.ms));

  const datedA = dated(seriesA);
  const datedB = dated(seriesB);

  // Every admissible pairing, closest first, then taken greedily. Closest-first
  // is what stops a reading from being consumed by a distant partner while its
  // own tick is still waiting: with A at 12:00 and 13:00 and B at 13:05, the
  // pair is 13:00/13:05 whatever order the rows arrived in.
  const candidates: Array<{ ai: number; bi: number; gapMs: number }> = [];
  for (let ai = 0; ai < datedA.length; ai++) {
    for (let bi = 0; bi < datedB.length; bi++) {
      const gapMs = Math.abs(datedA[ai]!.ms - datedB[bi]!.ms);
      if (gapMs <= toleranceMs) candidates.push({ ai, bi, gapMs });
    }
  }
  candidates.sort((left, right) => left.gapMs - right.gapMs || left.ai - right.ai || left.bi - right.bi);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const matched: Array<{ a: A; b: B; gapMs: number }> = [];
  for (const { ai, bi, gapMs } of candidates) {
    if (usedA.has(ai) || usedB.has(bi)) continue;
    usedA.add(ai);
    usedB.add(bi);
    matched.push({ a: datedA[ai]!.entry, b: datedB[bi]!.entry, gapMs });
  }
  return matched;
}
