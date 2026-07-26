import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { isReadyVenue } from "@/lib/venue-status";
import { findProtocol } from "@/lib/home-protocols";
import { ProtocolV2 } from "@/components/v2/ProtocolV2";
import { ProtocolSoonV2 } from "@/components/v2/ProtocolSoonV2";

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

export default async function V2VenuePage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const [venueRow, allVenues] = await Promise.all([getVenueDetail(venueSlug), getVenues()]);
  const catalog = findProtocol(venueSlug);
  if (!venueRow && !catalog) notFound();

  const otherVenues = allVenues.filter((v) => v.slug !== venueSlug && isReadyVenue(v.slug));

  if (venueSlug === "variational") {
    return <ProtocolV2 otherVenues={otherVenues} />;
  }
  return <ProtocolSoonV2 slug={venueSlug} name={venueRow?.name ?? catalog!.name} meta={venueRow?.meta ?? null} />;
}
