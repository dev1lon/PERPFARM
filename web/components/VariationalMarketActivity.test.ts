import { describe, expect, it } from "vitest";
import { hasObservedRange, selectObservedRange } from "../lib/activity-range";

const observed = [
  { date: "2026-01-01", value: 1 },
  { date: "2026-03-31", value: 2 },
  { date: "2026-04-01", value: 3 },
];

describe("market activity ranges", () => {
  it("returns only observed points and never manufactures missing days", () => {
    expect(selectObservedRange(observed, 30)).toEqual([
      { date: "2026-03-31", value: 2 },
      { date: "2026-04-01", value: 3 },
    ]);
  });

  it("enables a long range only when real dates span that range", () => {
    expect(hasObservedRange(observed, 90)).toBe(true);
    expect(hasObservedRange(observed.slice(1), 90)).toBe(false);
  });
});
