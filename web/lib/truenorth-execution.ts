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
 * The most a builder is ALLOWED to add on top of the exchange's own
 * maker/taker fee, on either book: "an incremental fee up to 10 bps, added on
 * top of the base maker/taker fee and paid to the builder"
 * (docs.ondoperps.xyz/fees), and the same 10 bps ceiling on Hyperliquid perps
 * (hyperliquid.gitbook.io, "Builder codes").
 *
 * A CEILING IS NOT A RATE. This exists only to say what is not being charged;
 * nothing prices with it. What is actually charged is the constant below,
 * which carries its own source and the date it was read.
 */
export const BUILDER_FEE_CAP_BPS = 10;

/**
 * What TrueNorth actually adds, per book -- with where that was read and when,
 * so the claim can be re-checked rather than taken on trust.
 *
 * It is zero, and TrueNorth says so as a selling point. An independent
 * confirmation from the exchanges themselves is not available: a builder code's
 * rate is set per order by the builder, so neither Hyperliquid nor Ondo
 * publishes what a given builder charges. That makes the venue's own statement
 * the only source there is -- which is exactly why it is pinned here with a
 * date instead of being folded into prose, and why the ceiling above must
 * never stand in for it.
 */
export const TRUE_NORTH_BUILDER_FEE = {
  /** Charged on top of the exchange's rate, in bps. */
  bps: 0,
  source:
    'TrueNorth own posts: "Builder fee the whole way: zero" (June 2026), and "$0 builder fee" with "executes at 0%" (September 2026)',
  /** When those were read (ISO date, UTC). */
  checkedOn: "2026-09-15",
  /** The books the reading was verified for -- both of its execution venues. */
  appliesTo: ["hyperliquid", "ondo"],
} as const;

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
