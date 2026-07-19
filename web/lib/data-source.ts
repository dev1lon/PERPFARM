/**
 * Single entry point pages/API routes import from. Uses Postgres
 * (lib/db.ts) when DATABASE_URL is set -- the production path on Render.
 * Falls back to the fixture venues (lib/fixtures-source.ts) otherwise, so
 * `npm run dev` works with zero local infrastructure. Matches the Phase 3
 * goal: "API layer + frontend running on fixture data end-to-end."
 */

import * as db from "./db";
import * as fixtures from "./fixtures-source";
import type { RouteDetail, RouteScoreRow, VenueDetail, VenueSummary } from "./types";
import { isReadyVenue } from "./venue-status";

// Fall back to synthetic fixtures ONLY in dev. In production a missing
// DATABASE_URL must surface as a real error, not silently serve fake data.
export const usingFixtures = !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

/**
 * Venues excluded from the public site everywhere: the two synthetic demo
 * venues (kept only as dev/test fixtures, never meant for the live catalog)
 * and real venues we no longer list. Filtered here at the single data entry
 * point so it applies to both the DB and fixture paths and covers rows that
 * may already be seeded in a deployed database -- no destructive DB delete.
 */
const HIDDEN_VENUE_SLUGS = new Set(["venue_alpha", "venue_beta", "paradex", "lighter"]);

function isHidden(slug: string): boolean {
  return HIDDEN_VENUE_SLUGS.has(slug);
}

function visibleRoutes(routes: RouteScoreRow[]): RouteScoreRow[] {
  return routes.filter(
    (r) =>
      !isHidden(r.longVenueSlug) &&
      !isHidden(r.shortVenueSlug) &&
      isReadyVenue(r.longVenueSlug) &&
      isReadyVenue(r.shortVenueSlug) &&
      r.longVenueSlug !== r.shortVenueSlug
  );
}

export async function getLatestRouteScores(
  filters: db.RouteFilters = {}
): Promise<RouteScoreRow[]> {
  const routes = usingFixtures
    ? fixtures.fixtureRoutes()
    : await db.getLatestRouteScores(filters);
  return visibleRoutes(routes);
}

export async function getRouteDetail(
  symbolCanonical: string,
  longSlug: string,
  shortSlug: string
): Promise<RouteDetail | null> {
  if (
    isHidden(longSlug) ||
    isHidden(shortSlug) ||
    !isReadyVenue(longSlug) ||
    !isReadyVenue(shortSlug) ||
    longSlug === shortSlug
  ) {
    return null;
  }
  if (usingFixtures) return fixtures.fixtureRouteDetail(symbolCanonical, longSlug, shortSlug);
  return db.getRouteDetail(symbolCanonical, longSlug, shortSlug);
}

export async function getVenues(): Promise<VenueSummary[]> {
  const venues = usingFixtures ? fixtures.fixtureVenues() : await db.getVenues();
  return venues.filter((v) => !isHidden(v.slug));
}

export async function getVenueDetail(slug: string): Promise<VenueDetail | null> {
  if (isHidden(slug)) return null;
  if (usingFixtures) return fixtures.fixtureVenueDetail(slug);
  return db.getVenueDetail(slug);
}

export async function getRoutesForVenuePair(
  venueSlug: string,
  hedgeSlug: string
): Promise<RouteScoreRow[]> {
  if (
    isHidden(venueSlug) ||
    isHidden(hedgeSlug) ||
    !isReadyVenue(venueSlug) ||
    !isReadyVenue(hedgeSlug) ||
    venueSlug === hedgeSlug
  ) {
    return [];
  }
  const routes = usingFixtures
    ? fixtures.fixtureRoutesForVenuePair(venueSlug, hedgeSlug)
    : await db.getRoutesForVenuePair(venueSlug, hedgeSlug);
  return visibleRoutes(routes);
}

export type { RouteSort, RouteFilters } from "./db";
