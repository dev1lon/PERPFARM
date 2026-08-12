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

    // ?all=true compares the three aggregates across every pair, to decide
    // between median and a trimmed mean on evidence instead of one example.
    if (request.nextUrl.searchParams.get("all") === "true") {
      const { rows: allRows } = await getPool().query<Row & { pair: string }>(
        `SELECT m.symbol_canonical AS pair, v.slug, f.ts, f.funding_rate_raw,
                f.interval_hours, f.funding_rate_annualized
         FROM funding_snapshots f
         JOIN markets m ON m.id = f.market_id
         JOIN venues v ON v.id = m.venue_id
         WHERE m.is_active = true AND f.ts >= now() - interval '24 hours'`,
        [],
      );
      const series = new Map<string, number[]>();
      for (const row of allRows) {
        const key = `${row.pair}|${row.slug}`;
        const list = series.get(key) ?? [];
        list.push(Number(row.funding_rate_annualized));
        series.set(key, list);
      }
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const medianOf = (xs: number[]) => {
        const s2 = [...xs].sort((x, y) => x - y);
        const mid = (s2.length - 1) / 2;
        return (s2[Math.floor(mid)]! + s2[Math.ceil(mid)]!) / 2;
      };
      const trimmed = (xs: number[], frac = 0.1) => {
        const s2 = [...xs].sort((x, y) => x - y);
        const k = Math.max(1, Math.floor(s2.length * frac));
        const cut = s2.length - 2 * k > 0 ? s2.slice(k, s2.length - k) : s2;
        return mean(cut);
      };
      const stats = [...series.entries()]
        .filter(([, xs]) => xs.length >= 8)
        .map(([key, xs]) => {
          const [pair, venue] = key.split("|");
          const m = mean(xs), md = medianOf(xs), tr = trimmed(xs);
          return {
            pair, venue, samples: xs.length,
            mean: Number(m.toFixed(4)), median: Number(md.toFixed(4)), trimmed10: Number(tr.toFixed(4)),
            // How far the median sits from the aggregate that actually accrues.
            medianVsMean: Number(Math.abs(md - m).toFixed(4)),
            trimmedVsMean: Number(Math.abs(tr - m).toFixed(4)),
          };
        })
        .sort((a, b) => b.medianVsMean - a.medianVsMean);
      return NextResponse.json({ pairs: stats.length, stats });
    }

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
