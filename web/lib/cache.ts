/**
 * How long an answer built from stored snapshots may be reused.
 *
 * Not a flat number of minutes. The data behind these endpoints changes once an
 * hour, when the collector runs -- so a fixed window is wrong in both
 * directions: too short and every visitor pays for a fresh scan of data that
 * did not change; too long and a new snapshot sits unseen for most of the
 * window. A 15-minute cache filled at :46 keeps showing the previous hour's
 * book until :01.
 *
 * So the cache expires WITH THE DATA: it is held until shortly after the next
 * collection is due. A visitor right after a run gets the new numbers, and
 * everyone in between is served without touching the database.
 */

/** The collector runs on GitHub Actions at five past the hour
 *  (.github/workflows/sync-snapshots.yml), and GitHub starts a scheduled run
 *  best-effort -- often several minutes late. The books land within about five
 *  minutes of the start, so the cache is held to :25: that clears an on-time run
 *  with room for a late one, instead of expiring into the middle of it and
 *  caching the previous hour for another hour. (It was :10 while Render started
 *  the run on the hour, to the minute.) A venue retried for up to half an hour
 *  (worker/perpfarm/jobs/sync_snapshots.py) still lands after this window --
 *  deliberately: the rest of the site should not wait for one venue's second
 *  chance, and that venue is picked up an hour later. */
const COLLECTION_LAG_MINUTES = 25;
/** Never hold longer than this, so a stalled collector cannot freeze the page
 *  on one answer for an hour. */
const MAX_SECONDS = 3_600;
/** Nor shorter, or a request landing during the lag window would re-scan on
 *  every load. */
const MIN_SECONDS = 60;

export function secondsUntilNextCollection(now = new Date()): number {
  const next = new Date(now);
  next.setUTCMinutes(COLLECTION_LAG_MINUTES, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  const seconds = Math.round((next.getTime() - now.getTime()) / 1_000);
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds));
}

/**
 * Cache-Control for an answer built from the hourly snapshots.
 *
 * `browser` caches in the visitor's own browser as well. Use it for answers
 * that belong to one person's settings -- a pair table priced at the volume
 * they typed is theirs, and pressing Run again with the same inputs should not
 * cost a round trip. Leave it off for answers everyone shares, where the edge
 * cache already serves the second visitor.
 */
export function snapshotCacheControl({ browser = false }: { browser?: boolean } = {}): string {
  const seconds = secondsUntilNextCollection();
  return `public, max-age=${browser ? seconds : 0}, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;
}
