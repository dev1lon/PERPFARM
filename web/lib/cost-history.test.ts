import { describe, expect, it } from "vitest";
import {
  impactAtNotional,
  measuredDepthUsd,
  percentileSample,
  quoteFromSamples,
  sampleFromSnapshot,
  type CostSample,
} from "./cost-history";

const sample = (legBps: number): CostSample => ({ legBps, spreadBps: legBps, impactBps: 0, markPrice: null, ts: null, firstLimitSide: null });

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

  it("refuses a size past the deepest anchor instead of clamping to it", () => {
    // Clamping answered a $1m question with the $50k reading, so a route was
    // priced as executable on evidence that it would fill twenty times smaller.
    expect(impactAtNotional(1_000_000, [[10_000, 4], [50_000, 12]])).toBeNull();
  });
});

/**
 * Depth is EVIDENCE, and the model may not spend evidence it does not have.
 * Every case here produced a confident price before: the venue publishes a
 * quote curve, the curve stops short of the fill, and the coarse anchors --
 * which only measure smaller sizes -- answered in its place.
 */
describe("measured depth", () => {
  const shallowCurve = {
    reference_price: 100,
    points: [
      { notional_usd: 0, bid: 99.9, ask: 100.1 },
      { notional_usd: 10_000, bid: 99.8, ask: 100.2 },
    ],
  };

  it("prices a fill the curve covers", () => {
    const s = sampleFromSnapshot({ spread_bps: 2, quote_curve_json: shallowCurve }, 10_000);
    expect(s?.impactBps).toBeCloseTo(10, 6);
  });

  it("drops an observation whose curve stops short of the fill", () => {
    expect(sampleFromSnapshot({ spread_bps: 2, quote_curve_json: shallowCurve }, 100_000)).toBeNull();
  });

  it("does not answer a deep fill from the shallower anchors when a curve exists", () => {
    // The anchors would have said 4 bps -- the reading for a tenth of the size.
    const snapshot = { spread_bps: 2, impact_bps_10k: 4, quote_curve_json: shallowCurve };
    expect(sampleFromSnapshot(snapshot, 100_000)).toBeNull();
    expect(measuredDepthUsd(snapshot)).toBe(10_000);
  });

  it("reports how deep the readings actually go", () => {
    expect(measuredDepthUsd({ quote_curve_json: shallowCurve })).toBe(10_000);
    expect(measuredDepthUsd({ impact_bps_10k: 4, impact_bps_50k: 9 })).toBe(50_000);
    expect(measuredDepthUsd({ spread_bps: 2 })).toBeNull();
  });
});

/**
 * WHICH SIDE of the book a leg crosses belongs to the route, not to the
 * function. A same-venue hedge rests its first order on the dearer side and
 * crosses the cheaper one; a cross-venue leg is crossed IN and crossed back
 * OUT, so it pays both sides. Reading a cross route's history the same way as
 * a same-venue one understated an asymmetric book by the whole difference.
 */
describe("side of the book", () => {
  const asymmetric = {
    reference_price: 100,
    points: [
      { notional_usd: 0, bid: 100, ask: 100 },
      // 10 bps to sell into, 100 bps to buy from.
      { notional_usd: 10_000, bid: 99.9, ask: 101 },
    ],
  };

  it("crosses the cheaper side on a same-venue hedge", () => {
    expect(sampleFromSnapshot({ spread_bps: 0, quote_curve_json: asymmetric }, 10_000, "cheapest")?.impactBps)
      .toBeCloseTo(10, 6);
  });

  it("pays the mean of both sides on a cross-venue leg", () => {
    expect(sampleFromSnapshot({ spread_bps: 0, quote_curve_json: asymmetric }, 10_000, "average")?.impactBps)
      .toBeCloseTo(55, 6);
  });

  it("carries the moment it was read, so two venues can be matched on it", () => {
    const s = sampleFromSnapshot({ ts: "2026-09-15T21:05:00.000Z", spread_bps: 2, impact_bps_10k: 1 }, 10_000);
    expect(s?.ts).toBe("2026-09-15T21:05:00.000Z");
  });

  it("keeps a percentile on a real observation's timestamp", () => {
    const at = (legBps: number, ts: string): CostSample =>
      ({ legBps, spreadBps: 0, impactBps: legBps, markPrice: null, ts, firstLimitSide: null });
    const median = percentileSample(
      [at(1, "2026-09-15T19:05:00.000Z"), at(2, "2026-09-15T20:05:00.000Z"), at(3, "2026-09-15T21:05:00.000Z")],
      0.5,
    );
    expect(median?.ts).toBe("2026-09-15T20:05:00.000Z");
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
