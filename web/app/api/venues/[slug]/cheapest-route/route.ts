import { NextResponse } from "next/server";
import { publicMessage } from "@/lib/api-error";
import { getPool } from "@/lib/db";
import { isReadyVenue } from "@/lib/venue-status";

// The worker writes this answer immediately after hourly market snapshots.
// A page load performs one indexed read only; it never scans venues or prices
// routes itself.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const { slug } = await params;
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
    // published straight to the page, so it is re-checked here: an unverified
    // or synthetic partner is reported as "no recommendation" rather than
    // being named on the card. Returning a stale older row instead would be
    // worse -- it would look current.
    const partnerSlug = best && isReadyVenue(best.partner_slug) ? best.partner_slug : null;
    return NextResponse.json(
      {
        slug,
        partnerSlug,
        cycleCostUsd: partnerSlug && best ? Number(best.cycle_cost_usd) : null,
        snapshotAt: partnerSlug && best ? best.ts : null,
      },
      // The worker rewrites this once an hour, so serving it from the edge for
      // an hour costs no freshness and spares the database a query per visit.
      // `no-store` here meant every page load waited on a round trip.
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return NextResponse.json({ error: publicMessage(error, "Could not load cheapest hedge") }, { status: 502 });
  }
}
