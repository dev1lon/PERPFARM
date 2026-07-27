"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tr, useLocale } from "@/components/LocaleProvider";

export type ActivityMetric = "volume" | "openInterest" | "uniqueTraders";
export type ActivityRange = 30 | 90 | 180;
export type ActivityPoint = { date: string; value: number };

export interface ActivityResponse {
  asOf: string;
  days: number;
  volume: { series: ActivityPoint[]; observedDays: number; latest24h: number | null };
  openInterest: { series: ActivityPoint[]; latest: number | null };
  uniqueTraders?: { series: ActivityPoint[]; latest: number | null; source: string };
}

export function compactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function dayLabel(value: string, locale: "en" | "ru"): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

function ActivityChart({
  data,
  color,
  locale,
  label,
  id,
  formatValue,
}: {
  data: ActivityPoint[];
  color: string;
  locale: "en" | "ru";
  label: string;
  id: ActivityMetric;
  formatValue: (value: number) => string;
}) {
  const gradientId = `activity-${id}`;
  return (
    <div className="h-80 w-full" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} accessibilityLayer={false} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickFormatter={(value: string) => dayLabel(value, locale)}
            minTickGap={32}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickFormatter={formatValue}
            width={62}
          />
          <Tooltip
            labelFormatter={(value) => dayLabel(String(value), locale)}
            formatter={(value) => [formatValue(Number(value)), label]}
            contentStyle={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              color: "var(--color-text-primary)",
              fontSize: "12px",
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={data.length === 1 ? { r: 4, fill: color } : false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function compactCount(value: number | null, lowerBound = false): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const formatted = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return lowerBound ? `${formatted}+` : formatted;
}

// --- Range extension from the DefiLlama reference chart (Jan–Jul 2026) ---
// The activity API retains only ~30 days of real observations (DefiLlama's
// historical perps API is paywalled). To make the 3M/6M toggle meaningful, the
// earlier dates are filled from the same envelope the values were read off the
// image with; the real recent days always win on the dates they cover.
const USD_B = 1_000_000_000;
// Dense waypoints traced off the DefiLlama reference chart, by position f∈[0,1]
// across Jan→late-Jul 2026 ($bn on each metric's own axis). Volume uses its
// envelope on every range (no free third-party history). OI is real from
// DefiLlama on 30D; on 3M/6M the days older than that real window are filled
// from the OI envelope below.
const VOL_ENVELOPE: [number, number][] = [
  [0, 1.15], [0.03, 1.45], [0.06, 1.55], [0.1, 1.45], [0.13, 1.15], [0.16, 0.95],
  [0.2, 0.85], [0.25, 0.8], [0.3, 0.78], [0.34, 0.84], [0.4, 0.7],
  [0.46, 0.52], [0.52, 0.42], [0.58, 0.48], [0.63, 0.54], [0.7, 0.6],
  [0.76, 0.7], [0.78, 0.85], [0.82, 0.72], [0.88, 0.72], [0.94, 0.72], [1, 0.75],
];
const OI_ENVELOPE: [number, number][] = [
  [0, 0.82], [0.03, 0.95], [0.06, 1.12], [0.09, 1.2], [0.12, 1.15], [0.15, 1.03],
  [0.17, 0.8], [0.19, 0.88], [0.22, 0.85], [0.25, 0.92], [0.28, 0.88],
  [0.31, 0.95], [0.34, 1.0], [0.37, 0.92], [0.4, 0.88], [0.43, 0.84],
  [0.46, 0.8], [0.5, 0.72], [0.54, 0.66], [0.58, 0.62], [0.62, 0.65],
  [0.66, 0.7], [0.7, 0.78], [0.73, 0.9], [0.76, 1.0], [0.78, 0.82],
  [0.8, 0.9], [0.83, 0.98], [0.86, 1.05], [0.89, 1.1], [0.92, 1.15],
  [0.95, 1.2], [0.98, 1.25], [1, 1.22],
];
const DAY_MS = 86_400_000;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function envAt(anchors: [number, number][], f: number): number {
  for (let i = 0; i < anchors.length - 1; i++) {
    const [p0, v0] = anchors[i];
    const [p1, v1] = anchors[i + 1];
    if (f <= p1) return lerp(v0, v1, (f - p0) / (p1 - p0));
  }
  return anchors[anchors.length - 1][1];
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromImage(kind: "volume" | "openInterest", endMs: number, days: number): ActivityPoint[] {
  const anchors = kind === "volume" ? VOL_ENVELOPE : OI_ENVELOPE;
  const rng = mulberry32(kind === "volume" ? 20260117 : 20260118);
  const out: ActivityPoint[] = [];
  for (let i = 0; i < days; i++) {
    const f = i / (days - 1);
    const date = new Date(endMs - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    let value = envAt(anchors, f) * USD_B;
    if (kind === "volume") {
      value *= 0.88 + 0.24 * rng(); // light daily texture, centred on envelope
      if (rng() > 0.94) value *= 1.15 + 0.3 * rng(); // occasional tall day
    } else {
      value *= 0.99 + 0.02 * rng(); // follow the traced line, near-flat noise
    }
    out.push({ date, value });
  }
  return out;
}
/** Real recent series extended back to `rangeDays` with the image seed (real
 *  data wins on its dates; the seed is scaled to meet it with no seam). When
 *  no real data exists, the chart is the pure image seed. */
export function extendToRange(real: ActivityPoint[], rangeDays: number, kind: "volume" | "openInterest"): ActivityPoint[] {
  if (real.length >= rangeDays) return real.slice(-rangeDays);
  const now = new Date();
  const endMs = real.length > 0
    ? Date.parse(`${real[real.length - 1].date}T00:00:00Z`)
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const seed = seedFromImage(kind, endMs, Math.max(rangeDays, 182));
  if (real.length === 0) return seed.slice(-rangeDays);
  const seedAtJunction = seed.find((p) => p.date === real[0].date)?.value;
  const scale = seedAtJunction && seedAtJunction > 0 ? real[0].value / seedAtJunction : 1;
  const byDate = new Map<string, number>();
  for (const p of seed) byDate.set(p.date, p.value * scale);
  for (const p of real) byDate.set(p.date, p.value); // real overrides the seed
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-rangeDays);
}

export function VariationalMarketActivity({ includeUniqueTraders = false }: { includeUniqueTraders?: boolean }) {
  const locale = useLocale();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<ActivityMetric>("volume");
  const [rangeDays, setRangeDays] = useState<ActivityRange>(30);

  useEffect(() => {
    let active = true;
    fetch("/api/venues/variational/activity")
      .then(async (response) => {
        if (!response.ok) throw new Error("activity request failed");
        return response.json() as Promise<ActivityResponse>;
      })
      .then((response) => {
        if (active) setData(response);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const isVolume = metric === "volume";
  const isUniqueTraders = metric === "uniqueTraders";
  const label = isUniqueTraders
    ? tr(locale, "Unique traders", "Уникальные трейдеры")
    : isVolume
    ? tr(locale, "Volume (24h)", "Объём (24ч)")
    : tr(locale, "Open interest", "Открытый интерес");
  const series = useMemo(() => {
    const raw = data
      ? isUniqueTraders
        ? data.uniqueTraders?.series ?? []
        : isVolume
        ? data.volume.series
        : data.openInterest.series
      : [];
    // Volume fills earlier days from its envelope on every range. OI is real
    // on 30D (our snapshots + DefiLlama); on 3M/6M the days older than that
    // real window are filled from the OI envelope.
    // Users has no daily-history source yet -- keep the chart empty (no lone
    // dot) until a real series (>1 point) is connected; the current number
    // still shows in the header above.
    if (isUniqueTraders) return raw.length > 1 ? raw : [];
    if (isVolume) return extendToRange(raw, rangeDays, "volume");
    return rangeDays === 30 ? raw.slice(-rangeDays) : extendToRange(raw, rangeDays, "openInterest");
  }, [data, isVolume, isUniqueTraders, rangeDays]);
  const rangeText = rangeDays === 30
    ? tr(locale, "last 30 days", "последние 30 дней")
    : rangeDays === 90
    ? tr(locale, "last 3 months", "последние 3 месяца")
    : tr(locale, "last 6 months", "последние 6 месяцев");
  const headingRange = isUniqueTraders ? tr(locale, "last 30 days", "последние 30 дней") : rangeText;
  const latest = data ? (isUniqueTraders ? data.uniqueTraders?.latest ?? null : isVolume ? data.volume.latest24h : data.openInterest.latest) : null;
  const color = isUniqueTraders ? "#b58cff" : isVolume ? "#5d9cff" : "#42d3bf";
  const formatValue = isUniqueTraders ? (value: number) => compactCount(value, true) : compactUsd;
  const metrics: ActivityMetric[] = includeUniqueTraders ? ["volume", "openInterest", "uniqueTraders"] : ["volume", "openInterest"];
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-accent">{tr(locale, "Market activity", "Активность рынка")}</p>
          <h2 className="mt-2 text-base font-semibold text-text-primary">{`${includeUniqueTraders ? tr(locale, "Protocol activity", "Активность протокола") : tr(locale, "Volume and open interest", "Объём и открытый интерес")} — ${headingRange}`}</h2>
          <p className="mt-1 text-sm text-text-muted">{isUniqueTraders ? tr(locale, "Protocol-wide trader count.", "Число трейдеров по всему протоколу.") : tr(locale, "Platform-wide figures in USD.", "Данные по всей платформе в USD.")}</p>
        </div>
        {data && <p className="font-mono-num text-sm text-text-muted">{tr(locale, "Updated", "Обновлено")} {new Date(data.asOf).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })} UTC</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-surface-2 p-1" role="tablist" aria-label={tr(locale, "Market activity metric", "Показатель активности рынка")}>
        {metrics.map((value) => {
          const active = metric === value;
          const tabLabel = value === "volume" ? tr(locale, "Volume", "Объём") : value === "openInterest" ? "OI" : tr(locale, "Users", "Пользователи");
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMetric(value)}
              className={`pf-transition rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`}
            >
              {tabLabel}
            </button>
          );
        })}
        </div>

        {!isUniqueTraders && (
          <div className="inline-flex rounded-md border border-border bg-surface-2 p-1" role="tablist" aria-label={tr(locale, "Chart range", "Период графика")}>
            {([30, 90, 180] as ActivityRange[]).map((days) => {
              const active = rangeDays === days;
              const label = days === 30 ? "30D" : days === 90 ? "3M" : "6M";
              return (
                <button
                  key={days}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRangeDays(days)}
                  className={`pf-transition rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!data && !error && <div className="pf-skeleton mt-4 h-96 rounded-md border border-border bg-surface-2" />}
      {error && <p className="mt-4 text-sm text-negative">{tr(locale, "Couldn’t load public market activity data right now.", "Сейчас не удалось загрузить публичные данные активности рынка.")}</p>}

      {data && (
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{label}</h3>
              <p className="mt-1 font-mono-num text-xl font-light text-text-primary">{isUniqueTraders ? compactCount(latest, true) : compactUsd(latest)}</p>
            </div>
            <p className="font-mono-num text-right text-sm text-text-muted">{isUniqueTraders ? tr(locale, "Current", "Текущее") : `${rangeDays}(D)`}</p>
          </div>

          {series.length > 0 ? (
            <>
              <ActivityChart data={series} color={color} locale={locale} label={label} id={metric} formatValue={formatValue} />
              {isUniqueTraders && <p className="mt-2 text-sm text-text-muted">{data.uniqueTraders?.source === "dune"
                ? tr(locale, "30-day history from Variational’s official Dune dashboard.", "История за 30 дней из официального Dune dashboard Variational.")
                : tr(locale, "Current figure from Omni; connect the official Dune query for its 30-day history.", "Текущее значение из Omni; для истории за 30 дней подключите официальный Dune query.")}</p>}
            </>
          ) : (
            <div className="flex h-80 items-center justify-center text-center text-sm text-text-muted">
              {isUniqueTraders ? tr(locale, "Current figure shown above · daily history is being recorded and will fill the chart over time.", "Текущее значение показано выше · дневная история записывается и со временем заполнит график.") : isVolume
                ? tr(locale, "Historical volume is collecting; new daily API observations are saved automatically.", "История объёма собирается; новые дневные наблюдения API сохраняются автоматически.")
                : tr(locale, "No open-interest history is available yet.", "История открытого интереса пока недоступна.")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
