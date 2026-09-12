import { describe, expect, it } from "vitest";
import { DEFILLAMA_ACTIVITY_HISTORY } from "./defillama-history";
import { mergeHistory } from "./merge";
import { HISTORY_DAYS } from "./types";
import { isReadyVenue } from "@/lib/venue-status";

/** The day the export was supplied, and the oldest day the chart can draw. */
const WINDOW_START = "2026-03-16";

describe("DefiLlama activity history", () => {
  const venues = Object.entries(DEFILLAMA_ACTIVITY_HISTORY);

  it("covers the protocols whose own history is too short to chart", () => {
    expect(venues.map(([slug]) => slug).sort()).toEqual([
      "entropy",
      "hibachi",
      "hyperliquid",
      "lighterrh",
      "ondo",
      "qfex",
      "risex",
      "tradexyz",
    ]);
    // Priced venues only -- an unpriced slug has no chart to fill.
    for (const [slug] of venues) expect(isReadyVenue(slug)).toBe(true);
    // Variational and TxFlow each carry their own export already, and
    // Polymarket's DefiLlama history starts inside the days we collected.
    expect(DEFILLAMA_ACTIVITY_HISTORY.variational).toBeUndefined();
    expect(DEFILLAMA_ACTIVITY_HISTORY.txflow).toBeUndefined();
    expect(DEFILLAMA_ACTIVITY_HISTORY.polymarket).toBeUndefined();
  });

  it.each(venues)("%s is one sorted day per row, inside the window", (_slug, rows) => {
    const dates = rows.map(([date]) => date);

    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates[0] >= WINDOW_START).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(HISTORY_DAYS + 1);
    // A row with neither figure would draw nothing and only widen the range.
    for (const [, volume, openInterest] of rows) {
      expect(volume !== null || openInterest !== null).toBe(true);
    }
  });

  it("keeps the figures it was given", () => {
    // Spot checks against the supplied export, so a regenerated file that
    // shifted a column or a day fails here instead of on the chart.
    const hibachi = new Map(DEFILLAMA_ACTIVITY_HISTORY.hibachi.map(([date, volume]) => [date, volume]));
    expect(hibachi.get("2026-03-16")).toBe(50441868);
    const ondo = new Map(DEFILLAMA_ACTIVITY_HISTORY.ondo.map(([date, volume]) => [date, volume]));
    expect(ondo.get("2026-09-10")).toBe(153775331);
    // The two days the export left empty stay empty.
    const hyperliquid = new Map(DEFILLAMA_ACTIVITY_HISTORY.hyperliquid.map(([date, volume]) => [date, volume]));
    expect(hyperliquid.get("2026-08-14")).toBeNull();
  });
});

describe("mergeHistory", () => {
  it("lets our own observation win the day it shares with an export", () => {
    const exported = [
      { date: "2026-09-10", value: 100 },
      { date: "2026-09-11", value: 200 },
    ];
    const observed = [{ date: "2026-09-11", value: 999 }];

    expect(mergeHistory(exported, observed)).toEqual([
      { date: "2026-09-10", value: 100 },
      { date: "2026-09-11", value: 999 },
    ]);
  });

  it("sorts by date and never draws more than the chart can show", () => {
    const many = Array.from({ length: HISTORY_DAYS + 40 }, (_, index) => ({
      date: `2026-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`,
      value: index,
    }));

    const merged = mergeHistory([...many].reverse());

    expect(merged).toHaveLength(HISTORY_DAYS);
    expect(merged.map((point) => point.date)).toEqual([...merged].map((p) => p.date).sort());
  });
});
