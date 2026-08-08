import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

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
    return NextResponse.json(
      {
        slug,
        partnerSlug: best?.partner_slug ?? null,
        cycleCostUsd: best ? Number(best.cycle_cost_usd) : null,
        snapshotAt: best?.ts ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load cheapest hedge" }, { status: 502 });
  }
}
