import { getPool } from "@/lib/db";
import { HISTORY_DAYS } from "@/lib/activity/types";

/**
 * The stored daily numbers behind every protocol's activity chart.
 *
 * One row per venue per day, written by the hourly worker from whatever that
 * protocol actually publishes -- its own live totals, its own Dune dashboard,
 * or (only where it publishes neither) a sum of our per-market snapshots. The
 * site reads them back; it never re-derives them, and never asks a third party
 * during a page load.
 */
export type DailyStatsRow = {
  date: string;
  volume_24h_usd: string | number | null;
  open_interest_usd: string | number | null;
  unique_traders: number | null;
  source: string;
};

/**
 * `sources` restricts which writer's rows count.
 *
 * TxFlow passes ["dune"] deliberately: its charts are drawn from its official
 * dashboard, and our own summed rows for it are a DIFFERENT measurement over a
 * shorter history. Serving those when the Dune sync has not run yet would
 * quietly swap the numbers under a published chart.
 */
export async function loadDailyStats(
  slug: string,
  { sources }: { sources?: string[] } = {},
): Promise<DailyStatsRow[]> {
  const { rows } = await getPool().query<DailyStatsRow>(
    `SELECT s.day::text AS date, s.volume_24h_usd, s.open_interest_usd, s.unique_traders, s.source
     FROM venue_daily_stats s
     JOIN venues v ON v.id = s.venue_id
     WHERE v.slug = $1
       AND s.day >= ((now() AT TIME ZONE 'UTC')::date - make_interval(days => $2))
       AND ($3::text[] IS NULL OR s.source = ANY($3))
     ORDER BY s.day ASC`,
    [slug, HISTORY_DAYS, sources ?? null],
  );
  return rows;
}

/** How stale the stored series may be before the caller should look elsewhere.
 *
 *  A published dashboard is often a day behind, and one quiet day is normal.
 *  Three is not: that is a sync that has stopped, and a chart ending three days
 *  ago should be refetched rather than shown as current. */
const MAX_STALE_DAYS = 3;

export function isFresh(rows: DailyStatsRow[], now = new Date()): boolean {
  const newest = rows.at(-1)?.date;
  if (!newest) return false;
  const ageDays = (now.getTime() - Date.parse(`${newest}T00:00:00Z`)) / 86_400_000;
  return ageDays <= MAX_STALE_DAYS;
}
