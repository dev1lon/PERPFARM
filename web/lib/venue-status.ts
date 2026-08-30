/**
 * Which protocols may be shown to a user, and under what name.
 *
 * Two separate guarantees live here, and both were violated by the same bug:
 *
 *  1. READINESS — a protocol is "ready" only once PerpFarm has a verified data
 *     path for it. The catalog stays visible, but an unverified route is never
 *     presented as tradable.
 *  2. NAMING — a database slug is an internal identifier, never display text.
 *     The synthetic fixture venues (`venue_alpha` / `venue_beta`) exist as rows
 *     in the database; when a component fell back to rendering the raw slug,
 *     one of them was published to real users as a recommended hedge route.
 *     `protocolName` returns null for anything not in the real catalog, so an
 *     unknown slug can only disappear from the UI -- never leak into it.
 */
import { findProtocol } from "@/lib/home-protocols";

const READY_VENUE_SLUGS = [
  "variational",
  "txflow",
  // Added once BOTH halves of a data path existed: hourly snapshots being
  // collected, and a fee schedule read off the venue. Either alone is not
  // enough -- a route priced without fees reads as cheaper than it is.
  "qfex",
  "risex",
  "polymarket",
  "entropy",
] as const;

/** A protocol whose data path is verified -- the only kind that can be priced. */
export type ReadyVenueSlug = (typeof READY_VENUE_SLUGS)[number];

/**
 * The ONE answer to "do we have data for this protocol". The API routes gate on
 * it, and the page uses it to decide whether to render the calculator and the
 * activity chart at all -- a listed protocol without a data path gets the same
 * layout with those sections stating why they are empty, never a calculator
 * that can only fail.
 */
export function isReadyVenue(slug: string): slug is ReadyVenueSlug {
  return (READY_VENUE_SLUGS as readonly string[]).includes(slug);
}

/** Every protocol we are willing to route to, for server-side filtering. */
export const READY_VENUE_SLUG_LIST = [...READY_VENUE_SLUGS];

/**
 * Display name for a slug, or null when the slug is not a real listed protocol
 * (fixtures, retired venues, typos). Callers must render nothing rather than
 * fall back to the slug.
 */
export function protocolName(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return findProtocol(slug)?.name ?? null;
}
