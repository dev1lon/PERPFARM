import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenuePageClient } from "@/components/VenuePageClient";
import { VariationalLayoutPreview } from "@/components/VariationalLayoutPreview";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { isReadyVenue } from "@/lib/venue-status";

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
  const name = venue?.name ?? venueSlug;
  return { title: `${name} — perpfarm` };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const [venue, allVenues] = await Promise.all([getVenueDetail(venueSlug), getVenues()]);
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
