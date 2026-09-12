import type { ReadyVenueSlug } from "@/lib/venue-status";

/**
 * TrueNorth is a broker layer, not an order book. These are the books where
 * its connected accounts execute, in the order shown to a farmer.
 *
 * A builder/broker surcharge is represented separately from exchange fees.
 * TrueNorth does not publish a per-fill surcharge for either route, so the
 * calculator models it as 0 bps until a verifiable rate is supplied. This
 * keeps a possible unverified interface charge from being presented as an
 * Ondo or Hyperliquid exchange fee.
 */
export const TRUE_NORTH_EXECUTION_VENUES = [
  { slug: "hyperliquid", name: "Hyperliquid" },
  { slug: "ondo", name: "Ondo" },
] as const satisfies ReadonlyArray<{ slug: ReadyVenueSlug; name: string }>;

export type TrueNorthExecutionVenue = (typeof TRUE_NORTH_EXECUTION_VENUES)[number]["slug"];

export const TRUE_NORTH_DEFAULT_EXECUTION_VENUE: TrueNorthExecutionVenue = "hyperliquid";

/**
 * The broker's currently modelled surcharge, deliberately separate from
 * exchange fees. A non-zero value needs a public fee schedule or a verified
 * fill before it can be added here.
 */
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
