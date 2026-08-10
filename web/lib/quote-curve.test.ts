import { describe, expect, it } from "vitest";
import { quoteCurveImpactBps, quoteCurveMarketSide } from "./quote-curve";

const curve = {
  reference_price: 100,
  points: [
    { notional_usd: 0, bid: 99.9, ask: 100.1 },
    { notional_usd: 1_000, bid: 99.8, ask: 100.2 },
    { notional_usd: 100_000, bid: 99, ask: 101 },
  ],
};

describe("quoteCurveImpactBps", () => {
  it("uses the native $1k point for a small fill instead of the $10k bucket", () => {
    expect(quoteCurveImpactBps(curve, 500)).toBeCloseTo(5);
  });

  it("can select the cheaper direction for a same-protocol hedge", () => {
    const asymmetric = {
      ...curve,
      points: [
        curve.points[0],
        { notional_usd: 1_000, bid: 99.85, ask: 100.4 },
        curve.points[2],
      ],
    };
    expect(quoteCurveImpactBps(asymmetric, 1_000, "cheapest")).toBeCloseTo(5);
    expect(quoteCurveImpactBps(asymmetric, 1_000)).toBeCloseTo(17.5);
    const side = quoteCurveMarketSide(asymmetric, 1_000);
    expect(side?.firstLimitSide).toBe("long");
    expect(side?.marketImpactBps).toBeCloseTo(5);
  });

  it("does not invent a quote past the largest native point", () => {
    expect(quoteCurveImpactBps(curve, 100_001)).toBeNull();
  });
});

/**
 * Impact between measured sizes follows a power law, not a straight line.
 * Measured on production curves: linear understates near the touch and
 * overstates deep in the book. See lib/quote-curve.ts.
 */
describe("power-law interpolation", () => {
  /** Square-root book: impact doubles when size quadruples. */
  const sqrtCurve = {
    reference_price: 100,
    points: [
      { notional_usd: 0, bid: 100, ask: 100 },
      { notional_usd: 1_000, bid: 99.9, ask: 100.1 },   // 10 bps
      { notional_usd: 100_000, bid: 99, ask: 101 },      // 100 bps
    ],
  };

  it("passes exactly through every measured point", () => {
    expect(quoteCurveImpactBps(sqrtCurve, 1_000, "average")).toBeCloseTo(10, 6);
    expect(quoteCurveImpactBps(sqrtCurve, 100_000, "average")).toBeCloseTo(100, 6);
  });

  it("puts a sub-linear book ABOVE the chord, where the real one sits", () => {
    // Straight line from (1k, 10bps) to (100k, 100bps) would give ~18.9 bps at
    // 10k. The power fit (exponent 0.5) gives ~31.6 -- and the production
    // measurement says the truth is above the chord, not on it.
    const atTenK = quoteCurveImpactBps(sqrtCurve, 10_000, "average")!;
    const chord = 10 + (100 - 10) * ((10_000 - 1_000) / (100_000 - 1_000));
    expect(atTenK).toBeGreaterThan(chord);
    expect(atTenK).toBeCloseTo(31.62, 1);
  });

  it("puts a super-linear book BELOW the chord", () => {
    // A book that thins out: impact grows faster than size.
    // Impact x1000 while size x100 -> exponent 1.5, genuinely super-linear.
    // (x100 against x100 would be exponent 1, i.e. the straight line itself.)
    const thinning = {
      reference_price: 100,
      points: [
        { notional_usd: 0, bid: 100, ask: 100 },
        { notional_usd: 1_000, bid: 99.99, ask: 100.01 }, // 1 bps
        { notional_usd: 100_000, bid: 90, ask: 110 },      // 1000 bps
      ],
    };
    const atTenK = quoteCurveImpactBps(thinning, 10_000, "average")!;
    const chord = 1 + (1_000 - 1) * ((10_000 - 1_000) / (100_000 - 1_000));
    expect(atTenK).toBeLessThan(chord);
    expect(atTenK).toBeCloseTo(31.62, 1);
  });

  it("stays linear on the first segment, where impact starts at zero", () => {
    // No logarithm of zero: 0 -> 1k keeps the straight line.
    expect(quoteCurveImpactBps(sqrtCurve, 500, "average")).toBeCloseTo(5, 6);
  });

  it("never reports negative impact", () => {
    expect(quoteCurveImpactBps(sqrtCurve, 250, "average")).toBeGreaterThanOrEqual(0);
  });
});
