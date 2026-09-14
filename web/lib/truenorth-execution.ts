import type { ReadyVenueSlug } from "@/lib/venue-status";

/**
 * TrueNorth is a broker layer, not an order book. These are the books where
 * its connected accounts execute, in the order shown to a farmer.
 *
 * They are collected ONLY to price TrueNorth's routes: neither gets a home-page
 * card, a protocol page of its own, or a hedge slot on another protocol's
 * calculator (see `isExecutionOnlyVenue`).
 */
export const TRUE_NORTH_EXECUTION_VENUES = [
  { slug: "hyperliquid", name: "Hyperliquid", short: "HL" },
  { slug: "ondo", name: "Ondo", short: "Ondo" },
] as const satisfies ReadonlyArray<{ slug: ReadyVenueSlug; name: string; short: string }>;

export type TrueNorthExecutionVenue = (typeof TRUE_NORTH_EXECUTION_VENUES)[number]["slug"];

export const TRUE_NORTH_DEFAULT_EXECUTION_VENUE: TrueNorthExecutionVenue = "hyperliquid";

/**
 * The most a builder can add on top of the exchange's own maker/taker fee, on
 * either book: "an incremental fee up to 10 bps, added on top of the base
 * maker/taker fee and paid to the builder" (docs.ondoperps.xyz/fees), and the
 * same 10 bps ceiling on Hyperliquid perps (hyperliquid.gitbook.io, "Builder
 * codes").
 *
 * TrueNorth charges NONE of it, and says so as a selling point: "builder fee
 * the whole way: zero" (its own post, June 2026), and "$0 builder fee" with
 * "executes at 0%" in September 2026. So a route through it costs what the
 * exchange costs, and this ceiling is kept only to say what it is NOT charging.
 */
export const BUILDER_FEE_CAP_BPS = 10;

/** The execution books of a broker page; empty for a venue with its own book. */
export function trueNorthExecutionVenues(
  protocolSlug: string,
): ReadonlyArray<{ slug: TrueNorthExecutionVenue; name: string; short: string }> {
  return protocolSlug === "truenorth" ? TRUE_NORTH_EXECUTION_VENUES : [];
}

/**
 * A book that exists on this site only to price a broker's routes.
 *
 * Priced like any venue, and deliberately invisible everywhere else: it has no
 * page to link to, so offering it as a hedge partner on another protocol would
 * name a venue a reader cannot open.
 */
export function isExecutionOnlyVenue(slug: string): boolean {
  return TRUE_NORTH_EXECUTION_VENUES.some((venue) => venue.slug === slug);
}
