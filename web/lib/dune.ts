/**
 * Reading values out of a Dune query result.
 *
 * Dune returns rows in whatever order the query's ORDER BY produced, and that
 * order is not part of any contract we control -- editing the query on Dune can
 * flip it without touching this repository. So nothing here may depend on row
 * position: the newest reading is found by its own date column.
 *
 * That assumption already cost us: the TxFlow open-interest query returns
 * newest-first, the old code reversed the array and took the first row, and the
 * chart plotted TxFlow's launch day ($195, 2026-03-27) as today's open
 * interest -- a vertical cliff from $17.7M.
 */

export type ActivityPoint = { date: string; value: number };

/** A reading plus the day it belongs to, when the query reports one. */
export type DuneReading = { value: number; date: string | null };

const DATE_COLUMN_NAMES = ["date", "day", "blockdate", "period"];

const DUNE_RESULTS_URL = "https://api.dune.com/api/v1/query";

export function asNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Saved results for a Dune query, or an empty list when unavailable. */
export async function fetchDuneRows(queryId: string): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) return [];
  const response = await fetch(`${DUNE_RESULTS_URL}/${queryId}/results?limit=1000`, {
    headers: { "X-Dune-Api-Key": apiKey },
    next: { revalidate: 60 * 60 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return [];
  const payload: unknown = await response.json();
  return isRecord(payload) && isRecord(payload.result) && Array.isArray(payload.result.rows)
    ? payload.result.rows.filter(isRecord)
    : [];
}

/**
 * Column whose normalized name matches one of `names`.
 *
 * An EXACT match always wins over a substring one, and column order is never
 * the tie-breaker. The daily-volume query returns both `volume` and
 * `total_volume`; asking for "volume" by substring alone would let either win
 * depending on key order, and `total_volume` is a cumulative running total --
 * plotting it as a daily bar would show a line that only ever goes up.
 */
export function valueFromDuneRow(row: Record<string, unknown>, names: string[]): unknown {
  const columns = Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value] as const);
  for (const name of names) {
    const exact = columns.find(([normalized]) => normalized === name);
    if (exact) return exact[1];
  }
  for (const name of names) {
    const partial = columns.find(([normalized]) => normalized.includes(name));
    if (partial) return partial[1];
  }
  return undefined;
}

export function duneRowDate(row: Record<string, unknown>): string | null {
  const raw = valueFromDuneRow(row, DATE_COLUMN_NAMES);
  if (raw === undefined || raw === null) return null;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * The newest reading in a Dune result, chosen by its own date column.
 * Queries with no date column (a single-value card) fall back to the last
 * numeric row, which is all the ordering information such a result carries.
 */
export function latestDuneReading(rows: Record<string, unknown>[], names: string[]): DuneReading | null {
  let best: DuneReading | null = null;
  for (const row of rows) {
    const value = asNumber(valueFromDuneRow(row, names));
    if (value === null) continue;
    const date = duneRowDate(row);
    if (best === null || date === null || best.date === null || date > best.date) {
      best = { value, date };
    }
  }
  return best;
}

export function latestDuneValue(rows: Record<string, unknown>[], names: string[]): number | null {
  return latestDuneReading(rows, names)?.value ?? null;
}

/**
 * A full daily series from a dated Dune result, oldest first.
 *
 * Sorted by date rather than trusted in the order it arrived, and de-duplicated
 * by day so a query that returns several rows per day cannot draw a sawtooth.
 */
export function duneSeries(rows: Record<string, unknown>[], names: string[], maxDays: number): ActivityPoint[] {
  const daily = new Map<string, number>();
  for (const row of rows) {
    const date = duneRowDate(row);
    const value = asNumber(valueFromDuneRow(row, names));
    if (date !== null && value !== null) daily.set(date, value);
  }
  return [...daily]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
    .slice(-maxDays);
}

/**
 * Append a live reading to a history series, on the day it was MEASURED --
 * not on whatever day the page happens to be rendered. Stamping yesterday's
 * close as "today" silently shifts the tail of every chart by a day.
 */
export function withCurrentPoint(history: ActivityPoint[], reading: DuneReading | null, maxDays: number): ActivityPoint[] {
  if (reading === null) return history;
  const date = reading.date ?? new Date().toISOString().slice(0, 10);
  return [...history.filter((point) => point.date !== date), { date, value: reading.value }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxDays);
}
