import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProtocolPageV2 } from "@/components/v2/ProtocolPageV2";
import { ProtocolSoonV2 } from "@/components/v2/ProtocolSoonV2";
import { ProtocolV2 } from "@/components/v2/ProtocolV2";
import { TxFlowV2 } from "@/components/v2/TxFlowV2";
import { loadStoredActivity } from "@/lib/activity/stored";
import { loadTxflowActivity } from "@/lib/activity/txflow";
import { loadVariationalActivity } from "@/lib/activity/variational";
import { loadCheapestRoute, type CheapestRoute } from "@/lib/cheapest-route";
import { getVenueDetail, getVenues } from "@/lib/data-source";
import { loadFdvMarkets } from "@/lib/fdv-market";
import { loadOiComposition } from "@/lib/oi-composition";
import { hasProtocolPage } from "@/lib/protocol-page";
import { isExecutionOnlyVenue, trueNorthExecutionVenues } from "@/lib/truenorth-execution";
import { isReadyVenue } from "@/lib/venue-status";
import { findProtocol } from "@/lib/home-protocols";

// ISR: the page and the numbers on it are generated together and regenerated
// at most hourly -- the same window the API routes behind those numbers are
// cached for, so nothing is staler than it was when each card fetched its own.
// The calculator is the exception and stays live: it prices whatever size the
// visitor types, from the newest stored snapshots, when they press Run.
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

  // TrueNorth is a broker rather than a venue: the books it routes to are
  // collected only to price its routes.
  const executionVenues = trueNorthExecutionVenues(venueSlug);
  // Such a book has no page of its own, so it is offered as a hedge partner
  // only on the page that actually trades it -- naming it anywhere else would
  // point a reader at a venue they cannot open.
  const otherVenues = allVenues.filter(
    (item) =>
      item.slug !== venueSlug &&
      isReadyVenue(item.slug) &&
      (executionVenues.length > 0 || !isExecutionOnlyVenue(item.slug)),
  );

  const pricedVenue = isReadyVenue(venueSlug) ? venueSlug : (executionVenues[0]?.slug ?? null);
  if (hasProtocolPage(venueSlug) && pricedVenue) {
    // The cards' numbers, read HERE rather than by four separate requests from
    // the browser after the page has painted. This page is regenerated hourly,
    // which is the same window those answers are cached for anyway.
    //
    // `allSettled`, and each result handed over only if it arrived: a card
    // whose read failed falls back to asking for itself, exactly as before, so
    // one unavailable source can never blank a page that has everything else.
    // Every book this page can price, compared: a broker's cheapest hedge on
    // Hyperliquid and on Ondo are different answers and both are shown.
    const routeVenues = executionVenues.length ? executionVenues.map((venue) => venue.slug) : [pricedVenue];
    const [activity, routes, fdvMarkets, oiComposition] = await Promise.allSettled([
      pricedVenue === "txflow"
        ? loadTxflowActivity()
        : pricedVenue === "variational"
          ? loadVariationalActivity()
          : loadStoredActivity(pricedVenue),
      Promise.all(
        routeVenues.map(
          async (slug) => [slug, await loadCheapestRoute(slug).catch(() => null)] as const,
        ),
      ),
      loadFdvMarkets(pricedVenue),
      pricedVenue === "variational" ? loadOiComposition(pricedVenue) : Promise.resolve(null),
    ]);
    const settled = <T,>(result: PromiseSettledResult<T>): T | undefined =>
      result.status === "fulfilled" ? result.value : undefined;
    // A book whose read failed is left out entirely, so its card falls back to
    // asking for itself instead of rendering as "no comparison".
    const cheapestRoutes: Record<string, CheapestRoute> = {};
    for (const [slug, route] of settled(routes) ?? []) {
      if (route) cheapestRoutes[slug] = route;
    }
    const initial = {
      activity: settled(activity),
      cheapestRoute: cheapestRoutes[pricedVenue],
      cheapestRoutes,
      fdvMarkets: settled(fdvMarkets),
    };
    if (venueSlug === "variational") {
      return <ProtocolV2 otherVenues={otherVenues} initial={initial} oiComposition={settled(oiComposition)} />;
    }
    if (venueSlug === "txflow") {
      return <TxFlowV2 otherVenues={otherVenues} initial={initial} />;
    }
    return <ProtocolPageV2 slug={venueSlug} otherVenues={otherVenues} initial={initial} />;
  }

  // A listed protocol we do not price yet gets the SAME page, with nothing to
  // prefetch: its calculator and activity sections state why they are empty
  // (see ProtocolPageV2), and everything else on it is real -- links, season,
  // points status, hedge partner.
  if (hasProtocolPage(venueSlug)) {
    return <ProtocolPageV2 slug={venueSlug} otherVenues={otherVenues} />;
  }
  return <ProtocolSoonV2 slug={venueSlug} name={venueRow?.name ?? catalog.name} meta={venueRow?.meta ?? null} />;
}
