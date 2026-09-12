import { HISTORY_DAYS, type ActivityPoint } from "@/lib/activity/types";

/**
 * One series out of several, later sources winning per date.
 *
 * Every chart on the site is built the same way: a verified export for the days
 * before PerpFarm started collecting, then our own stored rows on top. They
 * measure the same thing differently -- a calendar-day total against the
 * venue's rolling 24-hour figure -- so a day we observed ourselves must never
 * be replaced by an export's version of it, and neither is rescaled to fit the
 * other.
 */
export function mergeHistory(...sources: ActivityPoint[][]): ActivityPoint[] {
  const values = new Map<string, number>();
  for (const source of sources) {
    for (const point of source) values.set(point.date, point.value);
  }
  return [...values]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-HISTORY_DAYS);
}
