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

export const usingFixtures = !process.env.DATABASE_URL;

export async function getLatestRouteScores(
  filters: db.RouteFilters = {}
): Promise<RouteScoreRow[]> {
  if (usingFixtures) return fixtures.fixtureRoutes();
  return db.getLatestRouteScores(filters);
}

export async function getRouteDetail(
  symbolCanonical: string,
  longSlug: string,
  shortSlug: string
): Promise<RouteDetail | null> {
  if (usingFixtures) return fixtures.fixtureRouteDetail(symbolCanonical, longSlug, shortSlug);
  return db.getRouteDetail(symbolCanonical, longSlug, shortSlug);
}

export async function getVenues(): Promise<VenueSummary[]> {
  if (usingFixtures) return fixtures.fixtureVenues();
  return db.getVenues();
}

export async function getVenueDetail(slug: string): Promise<VenueDetail | null> {
  if (usingFixtures) return fixtures.fixtureVenueDetail(slug);
  return db.getVenueDetail(slug);
}

export async function getRoutesForVenuePair(
  venueSlug: string,
  hedgeSlug: string
): Promise<RouteScoreRow[]> {
  if (usingFixtures) return fixtures.fixtureRoutesForVenuePair(venueSlug, hedgeSlug);
  return db.getRoutesForVenuePair(venueSlug, hedgeSlug);
}

export type { RouteSort, RouteFilters } from "./db";
