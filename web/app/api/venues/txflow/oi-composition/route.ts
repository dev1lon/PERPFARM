import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { TRADFI_TICKER_LIST } from "@/lib/tradfi";

export const dynamic = "force-dynamic";
const HISTORY_DAYS = 180;

type Row = { day: string; btc: string | number | null; tradfi: string | number | null; other: string | number | null };
function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Same chart contract as Variational; TxFlow's hourly worker snapshots supply
 * the per-market OI, so no browser request has to crawl TxFlow's whole market list. */
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const { rows } = await getPool().query<Row>(
      `WITH v AS (SELECT id FROM venues WHERE slug = 'txflow'),
       daily AS (
         SELECT DISTINCT ON (s.market_id, (s.ts AT TIME ZONE 'UTC')::date)
           (s.ts AT TIME ZONE 'UTC')::date AS day,
           m.symbol_canonical AS pair,
           s.open_interest_usd AS oi
         FROM volume_snapshots s
         JOIN markets m ON m.id = s.market_id
         WHERE m.venue_id = (SELECT id FROM v)
           AND s.open_interest_usd IS NOT NULL
           AND s.ts >= now() - ($1 || ' days')::interval
         ORDER BY s.market_id, (s.ts AT TIME ZONE 'UTC')::date, s.ts DESC
       )
       SELECT day,
         SUM(CASE WHEN pair = 'BTC' THEN oi ELSE 0 END) AS btc,
         SUM(CASE WHEN pair <> 'BTC' AND pair = ANY($2) THEN oi ELSE 0 END) AS tradfi,
         SUM(CASE WHEN pair <> 'BTC' AND NOT (pair = ANY($2)) THEN oi ELSE 0 END) AS other
       FROM daily GROUP BY day ORDER BY day`,
      [HISTORY_DAYS, TRADFI_TICKER_LIST],
    );
    const series = rows
      .map((row) => {
        const btc = number(row.btc);
        const tradfi = number(row.tradfi);
        const other = number(row.other);
        return { date: row.day.slice(0, 10), btc, tradfi, other, total: btc + tradfi + other };
      })
      .filter((point) => point.total > 0);
    return NextResponse.json(
      { asOf: new Date().toISOString(), days: series.length, latest: series.at(-1) ?? null, series },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=900" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load TxFlow open-interest composition" }, { status: 502 });
  }
}
