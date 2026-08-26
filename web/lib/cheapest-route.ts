import { getPool } from "@/lib/db";
import { isReadyVenue } from "@/lib/venue-status";

/**
 * The cheapest hedge route the worker published for one protocol.
 *
 * Lives here rather than inside the route handler because the protocol page
 * now renders this card on the server, with the page: the same answer reached
 * two different ways would be two chances to disagree.
 */
export type CheapestRoute = {
  slug: string;
  partnerSlug: string | null;
  cycleCostUsd: number | null;
  snapshotAt: string | null;
};

export async function loadCheapestRoute(slug: string): Promise<CheapestRoute> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // The worker writes this answer immediately after hourly market snapshots.
  // A page load performs one indexed read only; it never scans venues or
  // prices routes itself.
  const { rows } = await getPool().query<{
    partner_slug: string;
    cycle_cost_usd: string | number;
    ts: string;
  }>(
    `SELECT partner.slug AS partner_slug, r.cycle_cost_usd, r.ts
     FROM hedge_route_recommendations r
     JOIN venues home ON home.id = r.venue_id
     JOIN venues partner ON partner.id = r.partner_venue_id
     WHERE home.slug = $1
     ORDER BY r.ts DESC
     LIMIT 1`,
    [slug],
  );
  const best = rows[0];
  // The worker already excludes fixture venues, but a recommendation is
  // published straight to the page, so it is re-checked here: an unverified or
  // synthetic partner is reported as "no recommendation" rather than being
  // named on the card. Returning a stale older row instead would be worse --
  // it would look current.
  const partnerSlug = best && isReadyVenue(best.partner_slug) ? best.partner_slug : null;
  return {
    slug,
    partnerSlug,
    cycleCostUsd: partnerSlug && best ? Number(best.cycle_cost_usd) : null,
    snapshotAt: partnerSlug && best ? best.ts : null,
  };
}
