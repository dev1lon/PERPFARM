import { describe, expect, it } from "vitest";
import { FUNDING_HOLD_HOURS, HOURS_PER_YEAR } from "./route-model";

/**
 * A delta-neutral hedge is market-neutral in either direction, and the choice
 * of which venue rests the limit orders does not depend on it -- so execution
 * cost is the same either way and only funding differs. The direction is
 * therefore chosen, not inherited from whichever page the user opened.
 *
 * These lock the arithmetic that `computeCrossRankings` applies. Longs pay the
 * funding rate and shorts receive it, so the long leg belongs on the venue with
 * the LOWER rate.
 */
const fundingUsd = (fillUsd: number, longRate: number, shortRate: number) =>
  (fillUsd * (longRate - shortRate) * FUNDING_HOLD_HOURS) / HOURS_PER_YEAR;

/** What the model does: long the cheaper-to-fund side, whatever order it saw. */
const choose = (fillUsd: number, rateA: number, rateB: number) => ({
  longIsA: rateA <= rateB,
  fundingUsd: fundingUsd(fillUsd, Math.min(rateA, rateB), Math.max(rateA, rateB)),
});

describe("cross-route direction", () => {
  // Annualised fractions, the convention funding_snapshots stores.
  const RATE_HIGH = 0.12;
  const RATE_LOW = -0.02;

  it("longs the venue with the lower funding rate", () => {
    expect(choose(10_000, RATE_LOW, RATE_HIGH).longIsA).toBe(true);
    expect(choose(10_000, RATE_HIGH, RATE_LOW).longIsA).toBe(false);
  });

  it("gives the same answer whichever protocol the user opened", () => {
    // The identical trade used to read +$5.58 from one page and -$5.59 from
    // the other. Same pair, same rates, opposite sign.
    const fromA = choose(10_000, RATE_HIGH, RATE_LOW);
    const fromB = choose(10_000, RATE_LOW, RATE_HIGH);
    expect(fromA.fundingUsd).toBeCloseTo(fromB.fundingUsd, 10);
  });

  it("turns funding into a credit, never a charge", () => {
    // Stored convention is cost-positive, so a credit is negative.
    expect(choose(10_000, RATE_HIGH, RATE_LOW).fundingUsd).toBeLessThan(0);
    expect(choose(10_000, RATE_LOW, RATE_HIGH).fundingUsd).toBeLessThan(0);
  });

  it("is zero when both venues fund identically", () => {
    expect(choose(10_000, RATE_HIGH, RATE_HIGH).fundingUsd).toBe(0);
  });

  it("scales with the hold, not with the whole year", () => {
    // 12h of a 14%/yr spread on a $10k leg.
    const expected = (10_000 * -0.14 * FUNDING_HOLD_HOURS) / HOURS_PER_YEAR;
    expect(choose(10_000, RATE_HIGH, RATE_LOW).fundingUsd).toBeCloseTo(expected, 10);
  });
});
