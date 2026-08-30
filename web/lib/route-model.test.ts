import { describe, expect, it } from "vitest";
import { bandHasPairs, resolveBandFilter } from "./route-model";

/**
 * The results table offers four tabs, but an answer carries only the bands
 * that ended up with pairs in them. Selecting one it does not carry used to
 * leave the table with nothing to draw -- and on the cross-protocol card it
 * replaced the whole block, tabs included, so the reader could not get back
 * without re-running the scan.
 */
describe("resolveBandFilter", () => {
  const band = (key: string, count: number) => ({ key, pairs: Array.from({ length: count }, (_, i) => i) });

  it("keeps a band the answer actually has", () => {
    expect(resolveBandFilter([band("high", 10), band("medium", 3)], "medium")).toBe("medium");
  });

  it("falls back to All for a band this comparison has none of", () => {
    // QFEX x TxFlow: every shared market is large, so only `high` comes back.
    expect(resolveBandFilter([band("high", 10)], "medium")).toBe("all");
    expect(resolveBandFilter([band("high", 10)], "low")).toBe("all");
  });

  it("falls back for a band that exists but is empty", () => {
    expect(resolveBandFilter([band("high", 10), band("medium", 0)], "medium")).toBe("all");
  });

  it("leaves All alone, including when there is nothing at all", () => {
    expect(resolveBandFilter([], "all")).toBe("all");
    expect(resolveBandFilter([], "high")).toBe("all");
  });
});

describe("bandHasPairs", () => {
  const band = (key: string, count: number) => ({ key, pairs: Array.from({ length: count }, (_, i) => i) });

  it("reports which tabs can be offered", () => {
    const bands = [band("high", 10), band("low", 2)];

    expect(bandHasPairs(bands, "high")).toBe(true);
    expect(bandHasPairs(bands, "low")).toBe(true);
    expect(bandHasPairs(bands, "medium")).toBe(false);
    expect(bandHasPairs(bands, "all")).toBe(true);
  });

  it("says All is unavailable only when every band is empty", () => {
    expect(bandHasPairs([band("high", 0)], "all")).toBe(false);
    expect(bandHasPairs([], "all")).toBe(false);
  });
});
