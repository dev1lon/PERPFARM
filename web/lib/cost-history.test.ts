import { describe, expect, it } from "vitest";
import { impactAtNotional, percentileSample, quoteFromSamples, sampleFromSnapshot, type CostSample } from "./cost-history";

const sample = (legBps: number): CostSample => ({ legBps, spreadBps: legBps, impactBps: 0 });

/**
 * The calculator is a REFERENCE: every protocol prices a route the same way and
 * differs only in its data. These lock the formula itself, so a protocol cannot
 * quietly acquire its own model the way TxFlow once did.
 */
describe("cost model", () => {
  it("charges half the spread per crossing leg, not the whole spread", () => {
    // Mid is the benchmark: a market buy fills at the ask, i.e. spread/2 above
    // fair value. The full spread is paid over the round trip, by two legs.
    const s = sampleFromSnapshot({ spread_bps: 0.722, impact_bps_10k: 0 }, 10_000);
    expect(s?.legBps).toBeCloseTo(0.361, 6);
    expect(s?.spreadBps).toBeCloseTo(0.722, 6);
  });

  it("adds quote impact on top of the half-spread", () => {
    const s = sampleFromSnapshot({ spread_bps: 2, impact_bps_10k: 3 }, 10_000);
    expect(s?.legBps).toBeCloseTo(1 + 3, 6);
    expect(s?.impactBps).toBeCloseTo(3, 6);
  });

  it("refuses to price a snapshot with no spread", () => {
    // Missing data must never become a cheap route.
    expect(sampleFromSnapshot({ spread_bps: null, impact_bps_10k: 1 }, 10_000)).toBeNull();
  });

  it("interpolates impact between published depth anchors", () => {
    expect(impactAtNotional(5_000, [[10_000, 4], [50_000, 12]])).toBeCloseTo(2, 6);
    expect(impactAtNotional(30_000, [[10_000, 4], [50_000, 12]])).toBeCloseTo(8, 6);
  });

  it("clamps past the deepest anchor rather than extrapolating", () => {
    expect(impactAtNotional(1_000_000, [[10_000, 4], [50_000, 12]])).toBeCloseTo(12, 6);
  });
});

describe("percentileSample", () => {
  it("returns the median of the observed window", () => {
    expect(percentileSample([1, 2, 3, 4, 5].map(sample), 0.5)?.legBps).toBeCloseTo(3, 6);
  });

  it("interpolates between neighbours", () => {
    expect(percentileSample([1, 2, 3, 4].map(sample), 0.5)?.legBps).toBeCloseTo(2.5, 6);
  });

  it("has nothing to say about an empty window", () => {
    expect(percentileSample([], 0.5)).toBeNull();
  });
});

describe("quoteFromSamples", () => {
  it("prices from the 24h window once history exists", () => {
    const quote = quoteFromSamples(sample(10), [1, 2, 3, 4].map(sample));
    expect(quote?.observations).toBe(5);
    expect(quote?.median.legBps).toBeCloseTo(3, 6);
    // The live reading stays available separately, so an outlier right now is
    // visible without dragging the headline with it.
    expect(quote?.latest.legBps).toBeCloseTo(10, 6);
  });

  it("reports a single observation when only the live book is available", () => {
    // The caller uses this to say "priced from the live order book" instead of
    // presenting one snapshot as a 24h median with a $x-$x range.
    const quote = quoteFromSamples(sample(7), []);
    expect(quote?.observations).toBe(1);
    expect(quote?.median.legBps).toBeCloseTo(7, 6);
    expect(quote?.low.legBps).toBeCloseTo(quote!.high.legBps, 6);
  });

  it("still prices from history when the live quote is missing", () => {
    const quote = quoteFromSamples(null, [2, 4].map(sample));
    expect(quote?.median.legBps).toBeCloseTo(3, 6);
    expect(quote?.latest.legBps).toBeCloseTo(3, 6);
  });

  it("returns nothing when there is no data at all", () => {
    expect(quoteFromSamples(null, [])).toBeNull();
  });
});
