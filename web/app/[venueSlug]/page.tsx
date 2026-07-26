import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenuePageClient } from "@/components/VenuePageClient";
import { VariationalLayoutPreview } from "@/components/VariationalLayoutPreview";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { isReadyVenue } from "@/lib/venue-status";
import { findProtocol } from "@/lib/home-protocols";
import type { VenueDetail } from "@/lib/types";

/** A listed protocol that has no DB row yet (added after the DB was seeded)
 *  still gets its SOON page: build a minimal not-ready stub from the catalog. */
function soonStub(slug: string, name: string): VenueDetail {
  return {
    slug,
    name,
    apiStatus: "stub",
    meta: null,
    executionRules: null,
    currentFees: null,
    feeHistory: [],
    markets: [],
  };
}

// ISR: the page shell (layout, venue list, static copy) is cached and
// regenerated at most hourly. Live numbers (Run, activity chart) are fetched
// client-side from API routes, so they stay fresh regardless of this window.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}): Promise<Metadata> {
  const { venueSlug } = await params;
  const venue = await getVenueDetail(venueSlug).catch(() => null);
  const name = venue?.name ?? findProtocol(venueSlug)?.name ?? venueSlug;
  return { title: `${name} — perpfarm` };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const [venueRow, allVenues] = await Promise.all([getVenueDetail(venueSlug), getVenues()]);
  // Fall back to a SOON stub for a listed protocol the DB doesn't have yet, so
  // it never 404s (e.g. bullet / ondo / qfex on a DB seeded before they existed).
  const catalog = findProtocol(venueSlug);
  const venue = venueRow ?? (catalog ? soonStub(venueSlug, catalog.name) : null);
  if (!venue) notFound();

  const ready = isReadyVenue(venueSlug);
  const otherVenues = allVenues.filter((item) => item.slug !== venueSlug && isReadyVenue(item.slug));

  // The only "done" perp uses the full designed layout; every other perp is
  // not ready yet, so VenuePageClient renders its SOON page (isReadyVenue).
  if (venueSlug === "variational") {
    return <VariationalLayoutPreview otherVenues={otherVenues} />;
  }
  return <VenuePageClient venue={venue} otherVenues={otherVenues} ready={ready} />;
}
