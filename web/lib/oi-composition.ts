import { getPool } from "@/lib/db";
import { displayedOpenInterestUsd } from "@/lib/route-model";
import { TRADFI_TICKER_LIST } from "@/lib/tradfi";

/**
 * Daily open interest split into BTC / TradFi / other crypto, for any protocol.
 *
 * One reading per market per day (the last of that day) so a market with more
 * snapshots cannot outweigh the rest, then summed per category. Each protocol's
 * own display convention is applied at the end -- Variational stores one side
 * of a gross figure, TxFlow stores what it reports.
 *
 * Extracted from the route handler so the page can render this chart on the
 * server. The route keeps its two audit modes (`?detail=1`, `?review=1`),
 * which have no place on a page.
 */
export const OI_COMPOSITION_HISTORY_DAYS = 180;

export type OiCompositionPoint = {
  date: string;
  btc: number;
  tradfi: number;
  other: number;
  total: number;
};

export type OiComposition = {
  asOf: string;
  days: number;
  latest: OiCompositionPoint | null;
  series: OiCompositionPoint[];
};

type Row = {
  day: string;
  btc: string | number | null;
  tradfi: string | number | null;
  other: string | number | null;
};

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadRows(slug: string): Promise<Row[]> {
  const { rows } = await getPool().query<Row>(
    `WITH v AS (SELECT id FROM venues WHERE slug = $3),
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
     -- ::text, deliberately. node-postgres turns a DATE into a JS Date at LOCAL
     -- midnight, so on a server that is not on UTC the day then shifted by one
     -- when it was formatted back -- the chart read "Aug 25" for Aug 26 data.
     -- Postgres has already done the timezone work; keep its answer as text.
     SELECT day::text AS day,
            SUM(CASE WHEN pair = 'BTC' THEN oi ELSE 0 END) AS btc,
            SUM(CASE WHEN pair <> 'BTC' AND pair = ANY($2) THEN oi ELSE 0 END) AS tradfi,
            SUM(CASE WHEN pair <> 'BTC' AND NOT (pair = ANY($2)) THEN oi ELSE 0 END) AS other
     FROM daily
     GROUP BY day
     ORDER BY day`,
    [OI_COMPOSITION_HISTORY_DAYS, TRADFI_TICKER_LIST, slug],
  );
  return rows;
}

export async function loadOiComposition(slug: string): Promise<OiComposition> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const series = (await loadRows(slug))
    .map((row) => {
      const btc = displayedOpenInterestUsd(num(row.btc), slug);
      const tradfi = displayedOpenInterestUsd(num(row.tradfi), slug);
      const other = displayedOpenInterestUsd(num(row.other), slug);
      return {
        date: typeof row.day === "string" ? row.day.slice(0, 10) : new Date(row.day).toISOString().slice(0, 10),
        btc,
        tradfi,
        other,
        total: btc + tradfi + other,
      };
    })
    .filter((point) => point.total > 0);

  return {
    asOf: new Date().toISOString(),
    days: series.length,
    latest: series[series.length - 1] ?? null,
    series,
  };
}
