import { describe, expect, it } from "vitest";
import {
  TRUE_NORTH_EXECUTION_VENUES,
  trueNorthBuilderFeeBps,
} from "./truenorth-execution";

describe("TrueNorth execution venues", () => {
  it("offers the two connected venues with their actual exchange routes", () => {
    expect(TRUE_NORTH_EXECUTION_VENUES.map((venue) => venue.slug)).toEqual(["hyperliquid", "ondo"]);
  });

  it("models no TrueNorth surcharge until a rate can be verified", () => {
    expect(trueNorthBuilderFeeBps("hyperliquid")).toBe(0);
    expect(trueNorthBuilderFeeBps("ondo")).toBe(0);
  });
});
