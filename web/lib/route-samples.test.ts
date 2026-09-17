import { describe, expect, it } from "vitest";
import { cheaperAssignment, matchByTick, routeSampleOf, type LegCost, type TakerBook } from "./route-samples";

/** A book whose parts are internally consistent: legBps = spread/2 + impact. */
const book = (fullSpreadBps: number, impactBps: number): TakerBook => ({
  legBps: fullSpreadBps / 2 + impactBps,
  spreadBps: fullSpreadBps,
  impactBps,
});

/** A venue's schedule, with the crossing cost its own book implies. */
const leg = (makerFee: number, takerFee: number, fullSpreadBps: number, impactBps: number): LegCost => ({
  makerFee,
  takerFee,
  taker: takerFee + fullSpreadBps / 2 + impactBps,
  spreadBps: fullSpreadBps / 2,
  impactBps,
});

/**
 * Ondo x Variational, the pair the audit caught: Ondo charges 1.0 bps maker and
 * 2.5 taker, Variational 0 and 0. At $20,000 the two assignments therefore cost
 * $2 and $5 in fees -- and a route that DISPLAYED the $2 assignment while
 * charging $5 is what these lock out.
 */
describe("fees belong to the assignment that is shown", () => {
  const ondo = { slug: "ondo", maker: 1.0, taker: 2.5 };
  const variational = { slug: "variational", maker: 0, taker: 0 };
  const accountVolumeUsd = 20_000;

  it("charges the maker of the venue named as maker, and nothing else", () => {
    // Ondo's book is the cheap one to cross, so resting on Variational wins.
    const sample = cheaperAssignment({
      accountVolumeUsd,
      venueA: ondo.slug,
      costA: leg(ondo.maker, ondo.taker, 1, 0),
      bookA: book(1, 0),
      venueB: variational.slug,
      costB: leg(variational.maker, variational.taker, 40, 0),
      bookB: book(40, 0),
    });
    expect(sample.makerVenue).toBe("variational");
    expect(sample.takerVenue).toBe("ondo");
    // Variational maker 0 + Ondo taker 2.5 bps of $20k.
    expect(sample.feeUsd).toBeCloseTo(5, 6);
  });

  it("prices the other direction when that one is cheaper", () => {
    const sample = cheaperAssignment({
      accountVolumeUsd,
      venueA: ondo.slug,
      costA: leg(ondo.maker, ondo.taker, 40, 0),
      bookA: book(40, 0),
      venueB: variational.slug,
      costB: leg(variational.maker, variational.taker, 1, 0),
      bookB: book(1, 0),
    });
    expect(sample.makerVenue).toBe("ondo");
    expect(sample.takerVenue).toBe("variational");
    // Ondo maker 1.0 + Variational taker 0 bps of $20k.
    expect(sample.feeUsd).toBeCloseTo(2, 6);
  });

  it("adds up: the parts a reader sees are the total above them", () => {
    const sample = routeSampleOf({
      accountVolumeUsd,
      makerVenue: "ondo",
      makerFeeBps: 1.0,
      takerVenue: "variational",
      takerFeeBps: 0,
      takerBook: book(6, 4),
    });
    expect(sample.feeUsd + sample.spreadUsd + sample.slippageUsd).toBeCloseTo(sample.totalUsd, 6);
  });
});

/**
 * The 24h band prices both books AT ONE MOMENT. These are the readings a
 * position-walked loop mismatched.
 */
describe("matching two venues' observations", () => {
  const at = (ts: string | null, legBps = 1) => ({ ts, legBps });

  it("pairs the readings of the same run across venues stamped minutes apart", () => {
    const matched = matchByTick(
      [at("2026-09-15T21:05:00Z"), at("2026-09-15T20:05:00Z")],
      [at("2026-09-15T21:16:00Z"), at("2026-09-15T20:16:00Z")],
      30 * 60_000,
    );
    expect(matched).toHaveLength(2);
    expect(matched.every(({ a, b }) => a.ts!.slice(11, 13) === b.ts!.slice(11, 13))).toBe(true);
  });

  it("leaves an hour unmatched when one venue missed its collection", () => {
    // Walking these by position paired 20:00 with 21:05 -- two moments an hour
    // apart, priced as one -- and every later reading with it.
    const matched = matchByTick(
      [at("2026-09-15T21:00:00Z"), at("2026-09-15T20:00:00Z"), at("2026-09-15T19:00:00Z")],
      [at("2026-09-15T21:05:00Z"), at("2026-09-15T19:05:00Z")],
      30 * 60_000,
    );
    expect(matched).toHaveLength(2);
    expect(matched.map(({ a }) => a.ts)).not.toContain("2026-09-15T20:00:00Z");
  });

  it("does not reorder the answer when the rows arrive shuffled", () => {
    const ordered = matchByTick(
      [at("2026-09-15T19:00:00Z"), at("2026-09-15T20:00:00Z")],
      [at("2026-09-15T19:05:00Z"), at("2026-09-15T20:05:00Z")],
      30 * 60_000,
    );
    const shuffled = matchByTick(
      [at("2026-09-15T20:00:00Z"), at("2026-09-15T19:00:00Z")],
      [at("2026-09-15T20:05:00Z"), at("2026-09-15T19:05:00Z")],
      30 * 60_000,
    );
    const key = (rows: ReturnType<typeof matchByTick>) =>
      rows.map(({ a, b }) => `${a.ts}|${b.ts}`).sort().join(",");
    expect(key(shuffled)).toBe(key(ordered));
  });

  it("refuses a partner further away than the tolerance", () => {
    expect(matchByTick([at("2026-09-15T21:00:00Z")], [at("2026-09-15T22:01:00Z")], 30 * 60_000)).toHaveLength(0);
  });

  it("never matches a reading that carries no time", () => {
    expect(matchByTick([at(null)], [at("2026-09-15T21:00:00Z")], 30 * 60_000)).toHaveLength(0);
    expect(matchByTick([at(null)], [at(null)], 30 * 60_000)).toHaveLength(0);
  });

  it("uses each reading at most once", () => {
    const matched = matchByTick(
      [at("2026-09-15T21:00:00Z"), at("2026-09-15T21:02:00Z")],
      [at("2026-09-15T21:01:00Z")],
      30 * 60_000,
    );
    expect(matched).toHaveLength(1);
  });
});
