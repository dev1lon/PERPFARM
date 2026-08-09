export function formatUsd(value: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const decimals = opts.decimals ?? 2;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
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

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
