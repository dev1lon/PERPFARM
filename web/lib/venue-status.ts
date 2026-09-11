/**
 * Which protocols may be shown to a user, and under what name.
 *
 * Two separate guarantees live here, and both were violated by the same bug:
 *
 *  1. READINESS — a protocol is "ready" only once PerpFarm has a verified data
 *     path for it. The catalog stays visible, but an unverified route is never
 *     presented as tradable.
 *  2. NAMING — a database slug is an internal identifier, never display text.
 *     The synthetic fixture venues (`venue_alpha` / `venue_beta`) exist as rows
 *     in the database; when a component fell back to rendering the raw slug,
 *     one of them was published to real users as a recommended hedge route.
 *     `protocolName` returns null for anything not in the real catalog, so an
 *     unknown slug can only disappear from the UI -- never leak into it.
 */
import { findProtocol } from "@/lib/home-protocols";

const READY_VENUE_SLUGS = [
  "variational",
  "txflow",
  // Added once BOTH halves of a data path existed: hourly snapshots being
  // collected, and a fee schedule read off the venue. Either alone is not
  // enough -- a route priced without fees reads as cheaper than it is.
  "qfex",
  "risex",
  "polymarket",
  "entropy",
  // Nado: a CLOB on Ink L2, so its impact is a real book walk rather than an
  // interpolated quote curve. Funding is quoted daily and settled hourly --
  // both confirmed against the live API, see worker/perpfarm/adapters/nado.py.
  "nado",
  // trade.xyz: a HIP-3 dex (`xyz`) on Hyperliquid, collected from Hyperliquid's
  // own /info feed like Entropy; fees per market, see venue-fees.ts.
  "tradexyz",
  // Hibachi: collected hourly since 2026-07; its fee row is read live from
  // the venue's exchange-info (0 maker / 4.5 bps taker).
  "hibachi",
  // Lighter RH: Lighter's CLOB on Robinhood Chain, collected hourly from its
  // public API since 2026-09-11; each market's own fee fields read 0 / 0.
  "lighterrh",
  // TrueNorth executes its connected accounts on these order books. The
  // broker itself is not a venue, so each gets its own verified data path.
  "hyperliquid",
  "ondo",
] as const;

/** A protocol whose data path is verified -- the only kind that can be priced. */
export type ReadyVenueSlug = (typeof READY_VENUE_SLUGS)[number];

/**
 * The ONE answer to "do we have data for this protocol". The API routes gate on
 * it, and the page uses it to decide whether to render the calculator and the
 * activity chart at all -- a listed protocol without a data path gets the same
 * layout with those sections stating why they are empty, never a calculator
 * that can only fail.
 */
export function isReadyVenue(slug: string): slug is ReadyVenueSlug {
  return (READY_VENUE_SLUGS as readonly string[]).includes(slug);
}

/** Every protocol we are willing to route to, for server-side filtering. */
export const READY_VENUE_SLUG_LIST = [...READY_VENUE_SLUGS];

/**
 * Display name for a slug, or null when the slug is not a real listed protocol
 * (fixtures, retired venues, typos). Callers must render nothing rather than
 * fall back to the slug.
 */
export function protocolName(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const catalogName = findProtocol(slug)?.name;
  if (catalogName) return catalogName;
  // Execution-only books are selectable in the TrueNorth calculator but do
  // not receive home-page cards or standalone protocol-guide pages.
  return ({ hyperliquid: "Hyperliquid", ondo: "Ondo" } as Record<string, string | undefined>)[slug] ?? null;
}
