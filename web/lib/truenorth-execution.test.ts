import { describe, expect, it } from "vitest";
import { findProtocol } from "./home-protocols";
import { hasProtocolPage } from "./protocol-page";
import {
  BUILDER_FEE_CAP_BPS,
  TRUE_NORTH_EXECUTION_VENUES,
  isExecutionOnlyVenue,
  trueNorthExecutionVenues,
} from "./truenorth-execution";
import { isReadyVenue } from "./venue-status";

describe("TrueNorth execution venues", () => {
  it("offers the two connected venues with their actual exchange routes", () => {
    expect(TRUE_NORTH_EXECUTION_VENUES.map((venue) => venue.slug)).toEqual(["hyperliquid", "ondo"]);
    // The short label the chart tabs and the route cards print.
    expect(TRUE_NORTH_EXECUTION_VENUES.map((venue) => venue.short)).toEqual(["HL", "Ondo"]);
  });

  it("only a broker page has execution books", () => {
    expect(trueNorthExecutionVenues("truenorth")).toHaveLength(2);
    expect(trueNorthExecutionVenues("variational")).toHaveLength(0);
  });

  it("states the builder-fee ceiling both books publish", () => {
    // The ceiling is what TrueNorth is NOT charging: it advertises a zero
    // builder fee, where both books would allow up to this much.
    expect(BUILDER_FEE_CAP_BPS).toBe(10);
  });

  it("keeps an execution book out of the catalog and out of the pages", () => {
    // Collected and priced, but it has no page -- so it must never be listed
    // as a protocol or offered as a hedge partner that cannot be opened.
    for (const venue of TRUE_NORTH_EXECUTION_VENUES) {
      expect(isExecutionOnlyVenue(venue.slug)).toBe(true);
      expect(isReadyVenue(venue.slug)).toBe(true);
      expect(findProtocol(venue.slug)).toBeUndefined();
      expect(hasProtocolPage(venue.slug)).toBe(false);
    }
    expect(isExecutionOnlyVenue("variational")).toBe(false);
  });
});
