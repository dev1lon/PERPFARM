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
}: {
  data: ActivityPoint[];
  color: string;
  locale: "en" | "ru";
  label: string;
}) {
  return (
    <div className="h-52 w-full" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`activity-${label}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
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
            minTickGap={28}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickFormatter={(value: number) => compactUsd(value)}
            width={58}
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
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#activity-${label})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VariationalMarketActivity() {
  const locale = useLocale();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState(false);

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

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">{tr(locale, "Market activity", "Активность рынка")}</p>
          <h2 className="mt-2 text-base font-semibold text-text-primary">{tr(locale, "Volume and open interest — last 30 days", "Объём и открытый интерес — последние 30 дней")}</h2>
          <p className="mt-1 text-sm text-text-muted">{tr(locale, "Platform-wide figures in USD. Volume is a 24-hour rolling observation for each day.", "Данные по всей платформе в USD. Объём — наблюдение скользящего 24-часового объёма на каждый день.")}</p>
        </div>
        {data && <p className="font-mono-num text-xs text-text-muted">{tr(locale, "Updated", "Обновлено")} {new Date(data.asOf).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })} UTC</p>}
      </div>

      {!data && !error && <div className="pf-skeleton mt-5 h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="mt-4 text-sm text-negative">{tr(locale, "Couldn’t load public market activity data right now.", "Сейчас не удалось загрузить публичные данные активности рынка.")}</p>}

      {data && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-surface-2 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-text-primary">{tr(locale, "Volume (24h)", "Объём (24ч)")}</h3>
                <p className="mt-1 font-mono-num text-xl font-light text-text-primary">{compactUsd(data.volume.latest24h)}</p>
              </div>
              <p className="text-right text-xs text-text-muted">{tr(locale, `${data.volume.observedDays}/30 snapshot days`, `${data.volume.observedDays}/30 дней снимков`)}</p>
            </div>
            {data.volume.series.length > 1 ? (
              <ActivityChart data={data.volume.series} color="#5d9cff" locale={locale} label={tr(locale, "Volume", "Объём")} />
            ) : (
              <div className="flex h-52 items-center justify-center text-center text-sm text-text-muted">{tr(locale, "Collecting daily volume observations. The chart fills automatically from the existing hourly snapshot job.", "Собираем дневные наблюдения объёма. График заполнится автоматически из существующего почасового snapshot-процесса.")}</div>
            )}
            <p className="mt-2 text-xs text-text-muted">{tr(locale, "Source: Variational public API, retained by PerpFarm.", "Источник: публичный API Variational, сохранённый PerpFarm.")}</p>
          </div>

          <div className="rounded-md border border-border bg-surface-2 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-text-primary">{tr(locale, "Open interest", "Открытый интерес")}</h3>
                <p className="mt-1 font-mono-num text-xl font-light text-text-primary">{compactUsd(data.openInterest.latest)}</p>
              </div>
              <p className="text-right text-xs text-text-muted">{tr(locale, "30 daily points", "30 дневных точек")}</p>
            </div>
            {data.openInterest.series.length > 1 ? (
              <ActivityChart data={data.openInterest.series} color="#42d3bf" locale={locale} label="OI" />
            ) : (
              <div className="flex h-52 items-center justify-center text-center text-sm text-text-muted">{tr(locale, "No open-interest history is available yet.", "История открытого интереса пока недоступна.")}</div>
            )}
            <p className="mt-2 text-xs text-text-muted">{tr(locale, "Source: DefiLlama open-interest history.", "Источник: история открытого интереса DefiLlama.")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
