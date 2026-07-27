const DAY_MS = 86_400_000;

type DatedValue = { date: string };

/** Keep only real observations inside the selected calendar window. */
export function selectObservedRange<T extends DatedValue>(real: T[], rangeDays: number): T[] {
  if (real.length === 0) return [];
  const sorted = [...real].sort((a, b) => a.date.localeCompare(b.date));
  const end = Date.parse(`${sorted[sorted.length - 1].date}T00:00:00Z`);
  const start = end - (rangeDays - 1) * DAY_MS;
  return sorted.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= start);
}

/** A longer range is selectable only when real observations span it. */
export function hasObservedRange(real: DatedValue[], rangeDays: number): boolean {
  if (rangeDays === 30) return real.length > 0;
  if (real.length < 2) return false;
  const sorted = [...real].sort((a, b) => a.date.localeCompare(b.date));
  const first = Date.parse(`${sorted[0].date}T00:00:00Z`);
  const last = Date.parse(`${sorted[sorted.length - 1].date}T00:00:00Z`);
  return last - first >= (rangeDays - 1) * DAY_MS;
}
