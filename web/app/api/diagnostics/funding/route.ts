import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";

/**
 * TEMPORARY diagnostic: the raw funding record behind one pair.
 *
 * Our BZ number disagrees with an external tool by 1.85x while MU agrees to
 * within 3.6%, so this exposes what we actually stored -- per venue, per hour:
 * the venue's own per-interval rate, the interval it settles on, the
 * annualised value we derived, and how many samples the 24h average is built
 * from. That distinguishes "we averaged badly" from "we recorded badly" from
 * "the venues genuinely disagree". Delete once answered.
 */
export const dynamic = "force-dynamic";

type Row = {
  slug: string;
  ts: string;
  funding_rate_raw: string | number | null;
  interval_hours: string | number;
  funding_rate_annualized: string | number;
};

const num = (v: unknown) => (v === null ? null : Number(v));

export async function GET(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const pair = (request.nextUrl.searchParams.get("pair") ?? "BZ").toUpperCase();
    const { rows } = await getPool().query<Row>(
      `SELECT v.slug, f.ts, f.funding_rate_raw, f.interval_hours, f.funding_rate_annualized
       FROM funding_snapshots f
       JOIN markets m ON m.id = f.market_id
       JOIN venues v ON v.id = m.venue_id
       WHERE m.symbol_canonical = $1 AND m.is_active = true
         AND f.ts >= now() - interval '24 hours'
       ORDER BY v.slug, f.ts DESC`,
      [pair],
    );

    const byVenue = new Map<string, Row[]>();
    for (const row of rows) {
      const list = byVenue.get(row.slug) ?? [];
      list.push(row);
      byVenue.set(row.slug, list);
    }

    const venues = [...byVenue.entries()].map(([slug, list]) => {
      const annualised = list.map((r) => Number(r.funding_rate_annualized)).filter(Number.isFinite);
      const avg = annualised.reduce((a, b) => a + b, 0) / (annualised.length || 1);
      return {
        venue: slug,
        samples: annualised.length,
        intervalHours: num(list[0]?.interval_hours),
        latestRaw: num(list[0]?.funding_rate_raw),
        latestAnnualised: num(list[0]?.funding_rate_annualized),
        avg24hAnnualised: Number(avg.toFixed(6)),
        minAnnualised: Number(Math.min(...annualised).toFixed(6)),
        maxAnnualised: Number(Math.max(...annualised).toFixed(6)),
        // Newest first, so a spike inside the window is visible.
        series: list.slice(0, 24).map((r) => ({ ts: r.ts, ann: num(r.funding_rate_annualized) })),
      };
    });

    const [a, b] = venues;
    const spreadAnnualised = a && b ? Number((a.avg24hAnnualised - b.avg24hAnnualised).toFixed(6)) : null;
    return NextResponse.json({
      pair,
      venues,
      spreadAnnualised,
      spreadPer8h: spreadAnnualised === null ? null : Number(((spreadAnnualised * 100) / 1095).toFixed(4)),
      note: "avg24hAnnualised is the mean of the hourly annualised readings; spread = first venue minus second.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "funding check failed" }, { status: 502 });
  }
}
