import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { TRADFI_TICKER_LIST } from "@/lib/tradfi";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 180;

type Row = {
  day: string;
  btc: string | number | null;
  tradfi: string | number | null;
  other: string | number | null;
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Daily open-interest split into BTC / TradFi / other crypto.
 *
 * One reading per market per day (the last of that day) so a market with more
 * snapshots cannot outweigh the rest, then summed per category. Values are the
 * stored single-sided OI doubled, matching the gross convention Omni displays
 * and the rest of the site.
 */
async function loadComposition(): Promise<Row[]> {
  const { rows } = await getPool().query<Row>(
    `WITH v AS (SELECT id FROM venues WHERE slug = 'variational'),
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
     FROM daily
     GROUP BY day
     ORDER BY day`,
    [HISTORY_DAYS, TRADFI_TICKER_LIST],
  );
  return rows;
}

/** Latest reading per market, so a share can be traced back to the tickers. */
async function loadLatestByPair(): Promise<{ pair: string; oi: string | number | null }[]> {
  const { rows } = await getPool().query<{ pair: string; oi: string | number | null }>(
    `WITH v AS (SELECT id FROM venues WHERE slug = 'variational')
     SELECT DISTINCT ON (s.market_id) m.symbol_canonical AS pair, s.open_interest_usd AS oi
     FROM volume_snapshots s
     JOIN markets m ON m.id = s.market_id
     WHERE m.venue_id = (SELECT id FROM v)
       AND s.open_interest_usd IS NOT NULL
       AND s.ts >= now() - interval '48 hours'
     ORDER BY s.market_id, s.ts DESC`,
  );
  return rows;
}

export async function GET(request: Request) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

    // `?probe=1` reports what the venue's own feed says about a listing, so the
    // asset class can come from the protocol instead of a hand-kept list.
    if (new URL(request.url).searchParams.get("probe") === "1") {
      const response = await fetch(
        "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats",
        {
          signal: AbortSignal.timeout(8_000),
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
        },
      );
      const payload = (await response.json()) as { listings?: Record<string, unknown>[] };
      const listings = payload.listings ?? [];
      const pick = (ticker: string) => listings.find((l) => l.ticker === ticker);
      const strip = (l: Record<string, unknown> | undefined) =>
        l === undefined
          ? null
          : Object.fromEntries(Object.entries(l).filter(([, v]) => typeof v !== "object" || v === null));
      return NextResponse.json({
        topLevelKeys: Object.keys(payload),
        listingKeys: listings[0] ? Object.keys(listings[0]) : [],
        xau: strip(pick("XAU")),
        xaut: strip(pick("XAUT")),
        paxg: strip(pick("PAXG")),
        btc: strip(pick("BTC")),
      });
    }

    // `?detail=1` lists every market with its category — used to audit the
    // split against third-party dashboards.
    if (new URL(request.url).searchParams.get("detail") === "1") {
      const rows = await loadLatestByPair();
      const markets = rows
        .map((row) => ({
          pair: row.pair,
          openInterestUsd: num(row.oi) * 2,
          category: row.pair === "BTC" ? "btc" : TRADFI_TICKER_LIST.includes(row.pair) ? "tradfi" : "other",
        }))
        .sort((a, b) => b.openInterestUsd - a.openInterestUsd);
      return NextResponse.json({ count: markets.length, markets });
    }

    const rows = await loadComposition();

    const series = rows
      .map((row) => {
        // Stored OI is one side; Omni reports gross (user + OLP counterparty).
        const btc = num(row.btc) * 2;
        const tradfi = num(row.tradfi) * 2;
        const other = num(row.other) * 2;
        const total = btc + tradfi + other;
        return {
          date: typeof row.day === "string" ? row.day.slice(0, 10) : new Date(row.day).toISOString().slice(0, 10),
          btc,
          tradfi,
          other,
          total,
        };
      })
      .filter((point) => point.total > 0);

    const latest = series[series.length - 1] ?? null;
    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        days: series.length,
        latest,
        series,
      },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=900" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load open-interest composition" },
      { status: 502 },
    );
  }
}
