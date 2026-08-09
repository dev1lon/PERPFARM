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

const READY_VENUE_SLUGS = new Set(["variational", "txflow"]);

export function isReadyVenue(slug: string): boolean {
  return READY_VENUE_SLUGS.has(slug);
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
