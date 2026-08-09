import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProtocolSoonV2 } from "@/components/v2/ProtocolSoonV2";
import { ProtocolV2 } from "@/components/v2/ProtocolV2";
import { TxFlowV2 } from "@/components/v2/TxFlowV2";
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
  // The curated catalog names the page, not the database: a slug is an
  // internal id and must never reach a title bar or a search result.
  const catalog = findProtocol(venueSlug);
  if (!catalog) return { title: "perpfarm" };
  const venue = await getVenueDetail(venueSlug).catch(() => null);
  return { title: `${venue?.name ?? catalog.name} — perpfarm` };
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
  // The curated catalog decides what is a page, in BOTH directions: a listed
  // protocol without a DB row still gets its SOON page, and a database row
  // that is not listed gets nothing. A synthetic fixture venue seeded into the
  // database used to satisfy the old `!venueRow &&` condition and served a
  // full protocol page under its raw slug.
  const catalog = findProtocol(venueSlug);
  if (!catalog) notFound();

  const otherVenues = allVenues.filter((item) => item.slug !== venueSlug && isReadyVenue(item.slug));

  if (venueSlug === "variational") {
    return <ProtocolV2 otherVenues={otherVenues} />;
  }
  if (venueSlug === "txflow") {
    return <TxFlowV2 otherVenues={otherVenues} />;
  }
  return <ProtocolSoonV2 slug={venueSlug} name={venueRow?.name ?? catalog.name} meta={venueRow?.meta ?? null} />;
}
