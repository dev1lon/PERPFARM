import { describe, expect, it } from "vitest";
import { assetClassLabel, feesVaryByAssetClass, publishedFees } from "./venue-fees";

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
  });

  it("treats a venue with no verified schedule as unknown, not free", () => {
    expect(publishedFees("nowhere")).toBeNull();
    expect(publishedFees("nowhere", "EQUITY")).toBeNull();
  });

  it("says which venues vary by class, so the fee note can name them", () => {
    expect(feesVaryByAssetClass("qfex")).toBe(true);
    expect(feesVaryByAssetClass("risex")).toBe(false);
    expect(assetClassLabel("EQUITY")).toBe("stocks");
    expect(assetClassLabel("fx")).toBe("FX");
    expect(assetClassLabel(null)).toBeNull();
  });
});
