/**
 * Single entry point pages import from. Uses Postgres (lib/db.ts) when
 * DATABASE_URL is set -- the production path. Falls back to fixture venues
 * (lib/fixtures-source.ts) ONLY in dev, so `npm run dev` works with zero local
 * infrastructure. In production a missing DATABASE_URL surfaces as a real
 * error rather than silently serving fake data.
 */

import * as db from "./db";
import * as fixtures from "./fixtures-source";
import type { VenueDetail, VenueSummary } from "./types";

export const usingFixtures = !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

export async function getVenues(): Promise<VenueSummary[]> {
  return usingFixtures ? fixtures.fixtureVenues() : db.getVenues();
}

export async function getVenueDetail(slug: string): Promise<VenueDetail | null> {
  return usingFixtures ? fixtures.fixtureVenueDetail(slug) : db.getVenueDetail(slug);
}
