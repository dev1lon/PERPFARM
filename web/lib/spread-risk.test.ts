import { describe, expect, it } from "vitest";
import { alignedGapsBps, breakoutShare, spreadRiskOf } from "./cross-cost";

const at = (hour: number) => `2026-08-18T${String(hour).padStart(2, "0")}:00:00.000Z`;
const series = (marks: number[]) => marks.map((mark, i) => ({ ts: at(i), mark }));

describe("alignedGapsBps", () => {
  it("compares only readings taken at the same tick", () => {
    // Prices taken minutes apart would report the market's own move as venue
    // disagreement, so an unmatched timestamp is dropped rather than paired up.
    const a = [{ ts: at(1), mark: 100 }, { ts: at(2), mark: 101 }];
    const b = [{ ts: at(2), mark: 101.01 }, { ts: at(3), mark: 102 }];

    expect(alignedGapsBps(a, b)).toHaveLength(1);
  });

  it("measures the gap in bps of the midpoint", () => {
    const gaps = alignedGapsBps([{ ts: at(1), mark: 100.05 }], [{ ts: at(1), mark: 99.95 }]);

    expect(gaps[0]).toBeCloseTo(10, 1); // 0.1 on ~100 is 10 bps
  });

  it("returns nothing when a series is missing", () => {
    expect(alignedGapsBps(undefined, series([100]))).toEqual([]);
  });
});

describe("breakoutShare", () => {
  const steady = (n: number, gap: number) => Array.from({ length: n }, () => gap);

  it("is zero when the gap holds its place, however wide that place is", () => {
    // A constant 200 bps offset is met going in and coming out: it cancels.
    expect(breakoutShare(steady(24, 200))).toBe(0);
  });

  it("counts only readings that left the pair's own normal gap", () => {
    const gaps = [...steady(18, 10), ...steady(6, 400)];

    expect(breakoutShare(gaps)).toBeCloseTo(6 / 24, 3);
  });

  it("refuses a verdict on too few readings", () => {
    expect(breakoutShare(steady(5, 10))).toBeNull();
  });
});

describe("spreadRiskOf", () => {
  it("grades the frequency, and says unknown rather than guessing", () => {
    expect(spreadRiskOf(0)).toBe("low");
    expect(spreadRiskOf(0.05)).toBe("low");
    expect(spreadRiskOf(0.1)).toBe("medium");
    expect(spreadRiskOf(0.15)).toBe("medium");
    expect(spreadRiskOf(0.4)).toBe("high");
    expect(spreadRiskOf(null)).toBe("unknown");
  });
});
