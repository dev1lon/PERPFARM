import { notFound } from "next/navigation";
import { VenuePageClient } from "@/components/VenuePageClient";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { isReadyVenue } from "@/lib/venue-status";

export const dynamic = "force-dynamic";

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

  return <VenuePageClient venue={venue} otherVenues={otherVenues} ready={ready} />;
}
