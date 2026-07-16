"use client";

import { useEffect, useState } from "react";
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

type ActivityMetric = "volume" | "openInterest";
type ActivityPoint = { date: string; value: number };

interface ActivityResponse {
  asOf: string;
  days: number;
  volume: { series: ActivityPoint[]; observedDays: number; latest24h: number | null };
  openInterest: { series: ActivityPoint[]; latest: number | null };
}

function compactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function dayLabel(value: string, locale: "en" | "ru"): string {
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
}: {
  data: ActivityPoint[];
  color: string;
  locale: "en" | "ru";
  label: string;
  id: ActivityMetric;
}) {
  const gradientId = `activity-${id}`;
  return (
    <div className="h-80 w-full" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
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
            tickFormatter={(value: number) => compactUsd(value)}
            width={62}
          />
          <Tooltip
            labelFormatter={(value) => dayLabel(String(value), locale)}
            formatter={(value) => [compactUsd(Number(value)), label]}
            contentStyle={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              color: "var(--color-text-primary)",
              fontSize: "12px",
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VariationalMarketActivity() {
  const locale = useLocale();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<ActivityMetric>("volume");

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
  const label = isVolume
    ? tr(locale, "Volume (24h)", "Объём (24ч)")
    : tr(locale, "Open interest (24h)", "Открытый интерес (24ч)");
  const series = data ? (isVolume ? data.volume.series : data.openInterest.series) : [];
  const latest = data ? (isVolume ? data.volume.latest24h : data.openInterest.latest) : null;
  const color = isVolume ? "#5d9cff" : "#42d3bf";
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-accent">{tr(locale, "Market activity", "Активность рынка")}</p>
          <h2 className="mt-2 text-base font-semibold text-text-primary">{tr(locale, "Volume and open interest — last 30 days", "Объём и открытый интерес — последние 30 дней")}</h2>
          <p className="mt-1 text-sm text-text-muted">{tr(locale, "Platform-wide figures in USD.", "Данные по всей платформе в USD.")}</p>
        </div>
        {data && <p className="font-mono-num text-sm text-text-muted">{tr(locale, "Updated", "Обновлено")} {new Date(data.asOf).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })} UTC</p>}
      </div>

      <div className="mt-5 inline-flex rounded-md border border-border bg-surface-2 p-1" role="tablist" aria-label={tr(locale, "Market activity metric", "Показатель активности рынка")}>
        {(["volume", "openInterest"] as const).map((value) => {
          const active = metric === value;
          const tabLabel = value === "volume" ? tr(locale, "Volume", "Объём") : "OI";
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

      {!data && !error && <div className="pf-skeleton mt-4 h-96 rounded-md border border-border bg-surface-2" />}
      {error && <p className="mt-4 text-sm text-negative">{tr(locale, "Couldn’t load public market activity data right now.", "Сейчас не удалось загрузить публичные данные активности рынка.")}</p>}

      {data && (
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{label}</h3>
              <p className="mt-1 font-mono-num text-xl font-light text-text-primary">{compactUsd(latest)}</p>
            </div>
            <p className="font-mono-num text-right text-sm text-text-muted">{data.days}(D)</p>
          </div>

          {series.length > 1 ? (
            <ActivityChart data={series} color={color} locale={locale} label={label} id={metric} />
          ) : (
            <div className="flex h-80 items-center justify-center text-center text-sm text-text-muted">
              {isVolume
                ? tr(locale, "Historical volume is collecting; new daily API observations are saved automatically.", "История объёма собирается; новые дневные наблюдения API сохраняются автоматически.")
                : tr(locale, "No open-interest history is available yet.", "История открытого интереса пока недоступна.")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
