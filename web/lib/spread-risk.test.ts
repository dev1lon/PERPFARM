import { describe, expect, it } from "vitest";
import { basisDriftBps, spreadRiskOf } from "./cross-cost";
import type { CostSample } from "./cost-history";

const tick = (markPrice: number | null): CostSample => ({ legBps: 1, spreadBps: 2, impactBps: 0, markPrice });

describe("basisDriftBps", () => {
  it("is near zero when the two venues track each other", () => {
    const a = [100, 101, 102, 103, 104, 105].map(tick);
    const b = [100.01, 101.01, 102.01, 103.01, 104.01, 105.01].map(tick);

    expect(basisDriftBps(a, b)).toBeLessThan(1);
  });

  it("measures how far the gap MOVES, not how wide it is", () => {
    // A constant 50 bps offset is met on the way in and out, so it nets out.
    const a = [100, 101, 102, 103, 104, 105].map(tick);
    const b = a.map((_, i) => tick([100, 101, 102, 103, 104, 105][i]! * 1.005));

    expect(basisDriftBps(a, b)).toBeLessThan(1);
  });

  it("rises when the gap wanders", () => {
    const a = [100, 100, 100, 100, 100, 100].map(tick);
    const b = [100, 100.5, 99.6, 100.8, 99.4, 100.2].map(tick);

    expect(basisDriftBps(a, b)).toBeGreaterThan(50);
  });

  it("refuses to rate a window too short to describe", () => {
    expect(basisDriftBps([tick(100), tick(100)], [tick(100), tick(100)])).toBeNull();
    // Older rows carry no mark at all.
    expect(basisDriftBps([tick(null), tick(null), tick(null), tick(null)], [tick(100), tick(100), tick(100), tick(100)])).toBeNull();
  });
});

describe("spreadRiskOf", () => {
  it("grades the drift, and says so honestly when it cannot", () => {
    expect(spreadRiskOf(2)).toBe("low");
    expect(spreadRiskOf(15)).toBe("low");
    expect(spreadRiskOf(32)).toBe("medium"); // the live median
    expect(spreadRiskOf(50)).toBe("medium");
    expect(spreadRiskOf(120)).toBe("high");
    expect(spreadRiskOf(null)).toBe("unknown");
  });
});
