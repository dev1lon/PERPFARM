export function formatUsd(value: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const decimals = opts.decimals ?? 2;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Chart-scale money: $1.23M, $45.6K. Used by the activity chart's axis, its
 *  headline figure and its tooltip, so all three read the same way. */
export function compactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Chart-scale counts: 6.6K traders. */
export function compactCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** A chart tick's day, in the reader's language: "24 Aug" / "24 авг.". */
export function dayLabel(value: string, locale: "en" | "ru"): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

export function formatNumber(value: number | null, decimals = 0): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatBps(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} bps`;
}

export function formatPct(value: number | null, decimals = 1): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "n/a";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }).format(date);
}

/** Stable, timezone-safe timestamp for every market-data status line. */
export function formatUtcDateTime(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "n/a";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
  return `${day}, ${time} UTC`;
}

/**
 * Russian noun form for a count. Russian takes three: 1 пара, 2 пары, 5 пар —
 * and it goes by the LAST digits, so 241 reads like 1 and 111 reads like 11.
 * Without this, a count and its noun disagree ("241 подходящих пар" instead of
 * "241 подходящая пара").
 */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** English is the simple case, kept beside its Russian counterpart. */
export function pluralEn(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
