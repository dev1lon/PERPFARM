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
