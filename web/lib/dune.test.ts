import { describe, expect, it } from "vitest";
import { duneSeries, latestDuneReading, valueFromDuneRow, withCurrentPoint } from "./dune";

/**
 * Real shape of query 6679693 ("volume history"). It carries BOTH a daily
 * `volume` and a cumulative `total_volume`; picking the wrong one draws a line
 * that only ever rises.
 */
const TXFLOW_VOLUME_ROWS = [
  { day: "2026-03-26", day_label: "Mar 26th", total_volume: 5469.6589, volume: 5469.6589 },
  { day: "2026-03-27", day_label: "Mar 27th", total_volume: 11430.65982, volume: 5961.00092 },
  { day: "2026-03-28", day_label: "Mar 28th", total_volume: 3328925.11585, volume: 3317494.45603 },
];

/**
 * Real shape of Dune query 6678737 ("Total OI"), which returns NEWEST FIRST.
 * The old reader reversed the array and took the first row, so it returned
 * TxFlow's launch day and the chart fell off a cliff to $195.
 */
const TXFLOW_OI_ROWS = [
  { "Total OI": 15979969.986481467, day: "2026-08-09" },
  { "Total OI": 18464246.992188666, day: "2026-08-08" },
  { "Total OI": 17733480.151347335, day: "2026-08-07" },
  { "Total OI": 209316.73705000003, day: "2026-03-29" },
  { "Total OI": 94914.55930416666, day: "2026-03-28" },
  { "Total OI": 195.31793, day: "2026-03-27" },
];

const OI_NAMES = ["totaloilatest1h", "totaloi", "openinterest", "oi"];

describe("latestDuneReading", () => {
  it("takes the newest row when the query is sorted newest-first", () => {
    expect(latestDuneReading(TXFLOW_OI_ROWS, OI_NAMES)).toEqual({ value: 15979969.986481467, date: "2026-08-09" });
  });

  it("takes the same row when the query is sorted oldest-first", () => {
    // Row order is a property of someone's ORDER BY, not a contract. Editing
    // the query on Dune must not be able to change what this returns.
    expect(latestDuneReading([...TXFLOW_OI_ROWS].reverse(), OI_NAMES)).toEqual({ value: 15979969.986481467, date: "2026-08-09" });
  });

  it("falls back to the last numeric row when the query has no date column", () => {
    // Query 6678797 ("Total Volume (24h)") is a single-value card.
    expect(latestDuneReading([{ "Total Volume (24h)": 36975161.5080768 }], ["totalvolume24h", "volume24h", "totalvolume"]))
      .toEqual({ value: 36975161.5080768, date: null });
  });

  it("returns null when no column matches", () => {
    expect(latestDuneReading([{ something_else: 1 }], OI_NAMES)).toBeNull();
  });
});

describe("valueFromDuneRow", () => {
  it("prefers an exact column match over a substring one", () => {
    // "total_volume" also contains "volume"; only the exact rule keeps the
    // daily figure from being replaced by a cumulative running total.
    expect(valueFromDuneRow(TXFLOW_VOLUME_ROWS[2], ["volume"])).toBe(3317494.45603);
  });

  it("still falls back to a substring match when nothing matches exactly", () => {
    expect(valueFromDuneRow({ "Total OI": 42, day: "2026-08-09" }, ["oi"])).toBe(42);
  });
});

describe("duneSeries", () => {
  it("builds an oldest-first daily series from the daily column", () => {
    expect(duneSeries(TXFLOW_VOLUME_ROWS, ["volume"], 180)).toEqual([
      { date: "2026-03-26", value: 5469.6589 },
      { date: "2026-03-27", value: 5961.00092 },
      { date: "2026-03-28", value: 3317494.45603 },
    ]);
  });

  it("sorts by date rather than trusting the order rows arrived in", () => {
    const series = duneSeries([...TXFLOW_OI_ROWS], OI_NAMES, 180);
    expect(series.map((point) => point.date)).toEqual([...series.map((point) => point.date)].sort());
    expect(series.at(-1)).toEqual({ date: "2026-08-09", value: 15979969.986481467 });
  });

  it("keeps one point per day", () => {
    const series = duneSeries(
      [{ day: "2026-08-09", "Total OI": 1 }, { day: "2026-08-09", "Total OI": 2 }],
      OI_NAMES,
      180,
    );
    expect(series).toHaveLength(1);
  });

  it("trims to the requested window", () => {
    expect(duneSeries(TXFLOW_OI_ROWS, OI_NAMES, 2)).toHaveLength(2);
  });
});

describe("withCurrentPoint", () => {
  const history = [
    { date: "2026-08-06", value: 17290586 },
    { date: "2026-08-07", value: 17657097 },
  ];

  it("appends the reading on the day it was measured", () => {
    const series = withCurrentPoint(history, { value: 15979969, date: "2026-08-09" }, 180);
    expect(series.at(-1)).toEqual({ date: "2026-08-09", value: 15979969 });
  });

  it("replaces a day already present instead of duplicating it", () => {
    const series = withCurrentPoint(history, { value: 999, date: "2026-08-07" }, 180);
    expect(series.filter((point) => point.date === "2026-08-07")).toEqual([{ date: "2026-08-07", value: 999 }]);
    expect(series).toHaveLength(2);
  });

  it("keeps the history untouched when there is no reading", () => {
    expect(withCurrentPoint(history, null, 180)).toEqual(history);
  });

  it("trims to the requested window", () => {
    expect(withCurrentPoint(history, { value: 1, date: "2026-08-09" }, 2)).toHaveLength(2);
  });
});
