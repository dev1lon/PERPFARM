import { describe, expect, it } from "vitest";
import {
  dailyCacheControl,
  secondsUntilNextCollection,
  secondsUntilNextDay,
  snapshotCacheControl,
} from "./cache";

const at = (iso: string) => new Date(iso);

describe("secondsUntilNextCollection", () => {
  it("holds an answer until just after the next collection is due", () => {
    // 12:00 -> the run starts now and takes a few minutes, so wait for 12:10.
    expect(secondsUntilNextCollection(at("2026-08-20T12:00:00Z"))).toBe(600);
  });

  it("rolls to the next hour once this hour's run has landed", () => {
    // 12:11 is past the lag window, so the next new data is at 13:10.
    expect(secondsUntilNextCollection(at("2026-08-20T12:11:00Z"))).toBe(3_540);
  });

  it("never holds a stale answer for more than an hour", () => {
    expect(secondsUntilNextCollection(at("2026-08-20T12:10:30Z"))).toBeLessThanOrEqual(3_600);
  });

  it("keeps a floor so a request inside the lag window does not re-scan every time", () => {
    // 12:09:30 is 30 seconds from the boundary; without a floor every load in
    // that half minute would go to the database.
    expect(secondsUntilNextCollection(at("2026-08-20T12:09:30Z"))).toBe(60);
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

describe("secondsUntilNextDay", () => {
  it("holds a daily chart until the new day's first readings have landed", () => {
    // 2026-08-20 12:00 -> 2026-08-21 00:10, which is 12h10m away.
    expect(secondsUntilNextDay(at("2026-08-20T12:00:00Z"))).toBe(12 * 3_600 + 600);
  });

  it("waits out the lag rather than expiring at midnight sharp", () => {
    expect(secondsUntilNextDay(at("2026-08-20T00:00:00Z"))).toBe(600);
  });

  it("never holds longer than a day", () => {
    expect(secondsUntilNextDay(at("2026-08-20T00:10:01Z"))).toBeLessThanOrEqual(24 * 3_600);
  });

  it("keeps a daily chart out of the browser cache", () => {
    // A visitor who leaves a tab open overnight must not be pinned to
    // yesterday's chart by their own browser.
    expect(dailyCacheControl()).toMatch(/max-age=0,/);
  });
});
