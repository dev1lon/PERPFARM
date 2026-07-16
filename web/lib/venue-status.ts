/**
 * A venue is "ready" only once PerpFarm has a verified data path for it.
 *
 * This deliberately differs from a venue merely being listed in the catalog:
 * we keep the catalog visible, but never present an unverified route as a
 * tradable recommendation.
 */
const READY_VENUE_SLUGS = new Set(["variational"]);

export function isReadyVenue(slug: string): boolean {
  return READY_VENUE_SLUGS.has(slug);
}
