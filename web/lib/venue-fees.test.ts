import { describe, expect, it } from "vitest";
import { assetClassLabel, classFees, feesVaryByAssetClass, publishedFees, resolveFees } from "./venue-fees";

/**
 * QFEX charges by instrument class: 0.05%/0.10% on a single stock, 0.02%/0.05%
 * on an index or commodity, 0.01%/0.02% on FX. Pricing all of them at the
 * stock rate overstated its 23 non-equity markets by up to five times -- and
 * did it silently, since the table still rendered.
 */
describe("publishedFees", () => {
  it("prices a QFEX market by the class the venue published for it", () => {
    expect(publishedFees("qfex", "EQUITY")).toEqual({ makerBps: 5.0, takerBps: 10.0 });
    expect(publishedFees("qfex", "INDEX")).toEqual({ makerBps: 2.0, takerBps: 5.0 });
    expect(publishedFees("qfex", "COMMODITY")).toEqual({ makerBps: 2.0, takerBps: 5.0 });
    expect(publishedFees("qfex", "FX")).toEqual({ makerBps: 1.0, takerBps: 2.0 });
  });

  it("falls back to the venue rate for a class it has never seen", () => {
    // A product line added after this shipped must be priced dearly, never free.
    expect(publishedFees("qfex", "CRYPTO")).toEqual({ makerBps: 5.0, takerBps: 10.0 });
    expect(publishedFees("qfex", null)).toEqual({ makerBps: 5.0, takerBps: 10.0 });
  });

  it("ignores the class on a venue that charges one rate", () => {
    expect(publishedFees("risex", "EQUITY")).toEqual(publishedFees("risex"));
    expect(publishedFees("variational", "FX")).toEqual({ makerBps: 0, takerBps: 0 });
    expect(publishedFees("hyperliquid", "CRYPTO")).toEqual({ makerBps: 1.5, takerBps: 4.5 });
    expect(publishedFees("ondo", "EQUITY")).toEqual({ makerBps: 1.0, takerBps: 2.5 });
  });

  it("treats a venue with no verified schedule as unknown, not free", () => {
    expect(publishedFees("nowhere")).toBeNull();
    expect(publishedFees("nowhere", "EQUITY")).toBeNull();
  });

  it("prices trade.xyz crypto at Hyperliquid's core schedule, over the venue row", () => {
    // Core perps pay half the HIP-3 rate; the venue-wide row is Standard Mode.
    expect(classFees("tradexyz", "CRYPTO")).toEqual({ makerBps: 1.5, takerBps: 4.5 });
    expect(publishedFees("tradexyz", "CRYPTO")).toEqual({ makerBps: 1.5, takerBps: 4.5 });
    expect(publishedFees("tradexyz", null)).toEqual({ makerBps: 3.0, takerBps: 9.0 });
    expect(classFees("risex", "CRYPTO")).toBeNull();
    // Named without a venue in it: three venues store this class.
    expect(assetClassLabel("CRYPTO")).toBe("crypto");
    expect(assetClassLabel("STOCK")).toBe("stocks");
    expect(assetClassLabel("ETF")).toBe("ETFs");
  });

  it("says which venues vary by class, so the fee note can name them", () => {
    expect(feesVaryByAssetClass("qfex")).toBe(true);
    expect(feesVaryByAssetClass("risex")).toBe(false);
    expect(assetClassLabel("EQUITY")).toBe("stocks");
    expect(assetClassLabel("fx")).toBe("FX");
    expect(assetClassLabel(null)).toBeNull();
  });
});

/**
 * One order of sources, for every page and for the worker.
 *
 * The cross table read the stored row; the same-protocol table never did. The
 * day the fee watcher writes one, those two pages priced the same venue
 * differently -- so the order lives in resolveFees() alone now, and it is the
 * order hedge_recommendations.py already used.
 */
describe("resolveFees", () => {
  it("lets THIS market's class beat a stored venue-wide rate", () => {
    // QFEX's stored row is its single-stock 5/10; an index costs 2/5.
    const stored = { makerBps: 5, takerBps: 10 };
    expect(resolveFees("qfex", "INDEX", stored)).toEqual({ makerBps: 2, takerBps: 5 });
  });

  it("uses the stored row where the venue has one rate for everything", () => {
    expect(resolveFees("hibachi", null, { makerBps: 0.5, takerBps: 4 })).toEqual({ makerBps: 0.5, takerBps: 4 });
  });

  it("falls back to the published headline with no stored row", () => {
    expect(resolveFees("hibachi", null, null)).toEqual(publishedFees("hibachi"));
    expect(resolveFees("hibachi", null)).toEqual(publishedFees("hibachi"));
  });

  it("treats a venue with neither as unknown, never as free", () => {
    expect(resolveFees("not-a-venue", null, null)).toBeNull();
    expect(resolveFees("not-a-venue", null, { makerBps: null, takerBps: null })).toBeNull();
  });
});
