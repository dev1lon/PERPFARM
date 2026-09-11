import { describe, expect, it } from "vitest";
import {
  QUOTE_CLOSED_AFTER_MS,
  QUOTE_RUN_SETTLE_MS,
  bandHasPairs,
  quoteLagMs,
  referenceRunMs,
  resolveBandFilter,
} from "./route-model";

/**
 * "Closed now" marks a market its venue did not quote in the latest run. The
 * newest book alone is the wrong yardstick while a run is still landing: every
 * row carries the run's start time but arrives minutes later, and 272 of
 * Variational's markets, crypto included, briefly read as closed.
 */
describe("referenceRunMs", () => {
  const at = (iso: string) => new Date(iso).getTime();
  const run0803 = "2026-09-11T08:03:00Z";
  const run0903 = "2026-09-11T09:03:00Z";

  it("judges against the newest run once it has settled", () => {
    const now = at(run0903) + QUOTE_RUN_SETTLE_MS;
    expect(referenceRunMs([run0903, run0903, run0803], now)).toBe(at(run0903));
  });

  it("falls back to the previous run while the newest is still landing", () => {
    const now = at(run0903) + 4 * 60_000;
    const reference = referenceRunMs([run0903, run0803, run0803], now);
    expect(reference).toBe(at(run0803));
    // A market not yet written in this run is therefore not closed...
    expect(quoteLagMs(run0803, reference)).toBeLessThanOrEqual(QUOTE_CLOSED_AFTER_MS);
    // ...but one that already missed the previous run still is.
    expect(quoteLagMs("2026-09-11T07:03:00Z", reference)).toBeGreaterThan(QUOTE_CLOSED_AFTER_MS);
  });

  it("does not count trade.xyz's late second pass as a missed run", () => {
    const now = at("2026-09-11T08:40:00Z");
    const reference = referenceRunMs(["2026-09-11T08:12:00Z", run0803], now);
    expect(quoteLagMs(run0803, reference)).toBeLessThanOrEqual(QUOTE_CLOSED_AFTER_MS);
  });

  it("marks nothing when there is nothing to judge against", () => {
    expect(referenceRunMs([])).toBeNull();
    expect(referenceRunMs([run0903], at(run0903) + 60_000)).toBeNull();
    expect(quoteLagMs(run0803, null)).toBe(0);
  });
});

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
