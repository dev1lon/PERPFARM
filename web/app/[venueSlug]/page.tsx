import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProtocolSoonV2 } from "@/components/v2/ProtocolSoonV2";
import { ProtocolV2 } from "@/components/v2/ProtocolV2";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { isReadyVenue } from "@/lib/venue-status";
import { findProtocol } from "@/lib/home-protocols";

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
  // The static protocol guide should remain available during a transient DB
  // outage. Live calculator APIs surface their own actionable error states.
  const [venueResult, venuesResult] = await Promise.allSettled([
    getVenueDetail(venueSlug),
    getVenues(),
  ]);
  const venueRow = venueResult.status === "fulfilled" ? venueResult.value : null;
  const allVenues = venuesResult.status === "fulfilled" ? venuesResult.value : [];
  // Listed protocols without a DB row still receive their canonical SOON page.
  const catalog = findProtocol(venueSlug);
  if (!venueRow && !catalog) notFound();

  const otherVenues = allVenues.filter((item) => item.slug !== venueSlug && isReadyVenue(item.slug));

  if (venueSlug === "variational") {
    return <ProtocolV2 otherVenues={otherVenues} />;
  }
  return <ProtocolSoonV2 slug={venueSlug} name={venueRow?.name ?? catalog!.name} meta={venueRow?.meta ?? null} />;
}
