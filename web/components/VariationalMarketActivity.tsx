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
import { hasObservedRange, selectObservedRange } from "@/lib/activity-range";

export type ActivityMetric = "volume" | "openInterest" | "uniqueTraders";
export type ActivityRange = 30 | 90 | 180;
export type ActivityPoint = { date: string; value: number };

export interface ActivityResponse {
  asOf: string;
  days: number;
  volume: { series: ActivityPoint[]; observedDays: number; latest24h: number | null };
  openInterest: { series: ActivityPoint[]; latest: number | null };
  uniqueTraders?: {
    series: ActivityPoint[];
    latest: number | null;
    source: string;
    metric?: "uniqueTraders" | "activeAddresses";
  };
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
  const isActiveAddresses = data?.uniqueTraders?.metric === "activeAddresses";
  const label = isUniqueTraders
    ? isActiveAddresses
      ? tr(locale, "Active addresses", "Активные адреса")
      : tr(locale, "Unique traders", "Уникальные трейдеры")
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
    // Users has no daily-history source yet -- keep the chart empty (no lone
    // dot) until a real series (>1 point) is connected. All market-series
    // points shown here come from APIs or saved observations.
    if (isUniqueTraders) return raw.length > 1 ? raw : [];
    return selectObservedRange(raw, rangeDays);
  }, [data, isVolume, isUniqueTraders, rangeDays]);
  const rangeText = rangeDays === 30
    ? tr(locale, "last 30 days", "последние 30 дней")
    : rangeDays === 90
    ? tr(locale, "last 3 months", "последние 3 месяца")
    : tr(locale, "last 6 months", "последние 6 месяцев");
  const headingRange = isUniqueTraders ? tr(locale, "last 30 days", "последние 30 дней") : rangeText;
  const latest = data ? (isUniqueTraders ? data.uniqueTraders?.latest ?? null : isVolume ? data.volume.latest24h : data.openInterest.latest) : null;
  const color = isUniqueTraders ? "#b58cff" : isVolume ? "#5d9cff" : "#42d3bf";
  const usersLowerBound = data?.uniqueTraders?.source !== "dune";
  const formatValue = isUniqueTraders ? (value: number) => compactCount(value, usersLowerBound) : compactUsd;
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
              onClick={() => {
                setMetric(value);
                if (value !== "uniqueTraders" && data) {
                  const nextSeries = value === "volume" ? data.volume.series : data.openInterest.series;
                  if (!hasObservedRange(nextSeries, rangeDays)) setRangeDays(30);
                }
              }}
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
              const raw = isVolume ? data?.volume.series ?? [] : data?.openInterest.series ?? [];
              const available = hasObservedRange(raw, days);
              const label = days === 30 ? "30D" : days === 90 ? "3M" : "6M";
              return (
                <button
                  key={days}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-disabled={!available}
                  disabled={!available}
                  onClick={() => setRangeDays(days)}
                  className={`pf-transition rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-35 ${active ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`}
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
              <p className="mt-1 font-mono-num text-xl font-light text-text-primary">{isUniqueTraders ? compactCount(latest, usersLowerBound) : compactUsd(latest)}</p>
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
              {isUniqueTraders ? tr(locale, "Only the current public figure is available.", "Сейчас доступно только текущее публичное значение.") : isVolume
                ? tr(locale, "Historical volume will appear as saved observations accumulate.", "История объёма появится по мере накопления сохранённых наблюдений.")
                : tr(locale, "No open-interest history is available yet.", "История открытого интереса пока недоступна.")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
