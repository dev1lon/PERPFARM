import type { ReadyVenueSlug } from "@/lib/venue-status";

/**
 * TrueNorth is a broker layer, not an order book. These are the books where
 * its connected accounts execute, in the order shown to a farmer.
 *
 * TrueNorth's Hyperliquid builder integration is advertised at 0 bps. The
 * same no-surcharge policy is used for its Ondo route; only the selected
 * exchange's maker/taker fees enter the execution-cost calculation.
 */
export const TRUE_NORTH_EXECUTION_VENUES = [
  { slug: "hyperliquid", name: "Hyperliquid" },
  { slug: "ondo", name: "Ondo" },
] as const satisfies ReadonlyArray<{ slug: ReadyVenueSlug; name: string }>;

export type TrueNorthExecutionVenue = (typeof TRUE_NORTH_EXECUTION_VENUES)[number]["slug"];

export const TRUE_NORTH_DEFAULT_EXECUTION_VENUE: TrueNorthExecutionVenue = "hyperliquid";

/** The broker's builder surcharge, deliberately separate from exchange fees. */
export function trueNorthBuilderFeeBps(venue: TrueNorthExecutionVenue): number {
  // Keep the venue argument: if an integration ever adds a fee, the calculator
  // and this test have one explicit place to change instead of silently
  // treating an exchange fee as TrueNorth's.
  void venue;
  return 0;
}

export function trueNorthExecutionVenue(protocolSlug: string): TrueNorthExecutionVenue | null {
  return protocolSlug === "truenorth" ? TRUE_NORTH_DEFAULT_EXECUTION_VENUE : null;
}
