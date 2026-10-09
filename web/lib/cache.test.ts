import { describe, expect, it } from "vitest";
import {
  secondsUntilNextCollection,
  snapshotCacheControl,
} from "./cache";

const at = (iso: string) => new Date(iso);

describe("secondsUntilNextCollection", () => {
  it("holds an answer until just after the next collection is due", () => {
    // 12:00 -> the run starts at 12:05, best-effort, so wait for 12:25.
    expect(secondsUntilNextCollection(at("2026-08-20T12:00:00Z"))).toBe(1_500);
  });

  it("rolls to the next hour once this hour's run has landed", () => {
    // 12:26 is past the lag window, so the next new data is at 13:25.
    expect(secondsUntilNextCollection(at("2026-08-20T12:26:00Z"))).toBe(3_540);
  });

  it("never holds a stale answer for more than an hour", () => {
    expect(secondsUntilNextCollection(at("2026-08-20T12:25:30Z"))).toBeLessThanOrEqual(3_600);
  });

  it("keeps a floor so a request inside the lag window does not re-scan every time", () => {
    // 12:24:30 is 30 seconds from the boundary; without a floor every load in
    // that half minute would go to the database.
    expect(secondsUntilNextCollection(at("2026-08-20T12:24:30Z"))).toBe(60);
  });
});

describe("snapshotCacheControl", () => {
  it("keeps a shared answer out of the browser cache", () => {
    expect(snapshotCacheControl()).toMatch(/max-age=0,/);
  });

  it("lets a personal answer sit in the browser too", () => {
    const header = snapshotCacheControl({ browser: true });
    const [, maxAge] = header.match(/max-age=(\d+),/) ?? [];

    expect(Number(maxAge)).toBeGreaterThan(0);
  });
});
