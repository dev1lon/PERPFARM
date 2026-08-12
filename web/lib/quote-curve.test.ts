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
 * The interpolation rule is span-dependent, and both halves were measured.
 * See the comment above `interpolateDisplacement` in lib/quote-curve.ts.
 */
describe("span-gated power fit", () => {
  /** Variational's real shape: one 100x gap between published sizes. */
  const wideGap = {
    reference_price: 100,
    points: [
      { notional_usd: 0, bid: 100, ask: 100 },
      { notional_usd: 1_000, bid: 99.9, ask: 100.1 },   // 10 bps
      { notional_usd: 100_000, bid: 99, ask: 101 },      // 100 bps
    ],
  };
  /** TxFlow's real shape after the ladder was widened: gaps of ~2x. */
  const narrowGaps = {
    reference_price: 100,
    points: [
      { notional_usd: 0, bid: 100, ask: 100 },
      { notional_usd: 5_000, bid: 99.9, ask: 100.1 },   // 10 bps
      { notional_usd: 10_000, bid: 99.8, ask: 100.2 },  // 20 bps
    ],
  };

  it("bends the curve across a 100x gap, where a line cannot follow", () => {
    const chord = 10 + (100 - 10) * ((10_000 - 1_000) / (100_000 - 1_000));
    expect(quoteCurveImpactBps(wideGap, 10_000, "average")!).toBeGreaterThan(chord);
  });

  it("keeps the straight line across a 2x gap, where the fit measured worse", () => {
    const chord = 10 + (20 - 10) * ((7_500 - 5_000) / (10_000 - 5_000));
    expect(quoteCurveImpactBps(narrowGaps, 7_500, "average")!).toBeCloseTo(chord, 6);
  });

  it("still passes exactly through every measured size", () => {
    expect(quoteCurveImpactBps(wideGap, 1_000, "average")).toBeCloseTo(10, 6);
    expect(quoteCurveImpactBps(wideGap, 100_000, "average")).toBeCloseTo(100, 6);
    expect(quoteCurveImpactBps(narrowGaps, 10_000, "average")).toBeCloseTo(20, 6);
  });

  it("stays linear from the touch, where displacement starts at zero", () => {
    expect(quoteCurveImpactBps(wideGap, 500, "average")).toBeCloseTo(5, 6);
  });
});
