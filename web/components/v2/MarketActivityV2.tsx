"use client";

import { useEffect, useMemo, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import {
  compactCount,
  compactUsd,
  dayLabel,
  extendToRange,
  type ActivityMetric,
  type ActivityPoint,
  type ActivityResponse,
} from "@/components/VariationalMarketActivity";

type Range = 30 | 90 | 180;

/** Native (design) market-activity chart. Reuses the same activity API + the
 *  real-data prep (envelope extension, Users-empty rule) as the legacy Recharts
 *  component, rendered as the design's single-accent-line SVG chart. */
export function MarketActivityV2() {
  const locale = useLocale();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<ActivityMetric>("volume");
  const [rangeDays, setRangeDays] = useState<Range>(30);

  useEffect(() => {
    let active = true;
    fetch("/api/venues/variational/activity")
      .then((r) => (r.ok ? (r.json() as Promise<ActivityResponse>) : Promise.reject(new Error("failed"))))
      .then((r) => active && setData(r))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const isVolume = metric === "volume";
  const isUsers = metric === "uniqueTraders";

  const series = useMemo(() => {
    const raw = data ? (isUsers ? data.uniqueTraders?.series ?? [] : isVolume ? data.volume.series : data.openInterest.series) : [];
    if (isUsers) return raw.length > 1 ? raw : [];
    if (isVolume) return extendToRange(raw, rangeDays, "volume");
    return rangeDays === 30 ? raw.slice(-rangeDays) : extendToRange(raw, rangeDays, "openInterest");
  }, [data, isVolume, isUsers, rangeDays]);

  const latest = data ? (isUsers ? data.uniqueTraders?.latest ?? null : isVolume ? data.volume.latest24h : data.openInterest.latest) : null;
  const fmt = isUsers ? (v: number) => compactCount(v, true) : compactUsd;
  const rangeLabel = rangeDays === 30 ? tr(locale, "last 30 days", "последние 30 дней") : rangeDays === 90 ? tr(locale, "last 3 months", "последние 3 месяца") : tr(locale, "last 6 months", "последние 6 месяцев");
  const caption = isUsers ? tr(locale, "protocol-wide, last 30 days", "по всему протоколу, 30 дней") : `${isVolume ? tr(locale, "traded volume", "торговый объём") : tr(locale, "open interest", "открытый интерес")} · ${rangeLabel}`;

  const values = series.map((p) => p.value);
  const delta = values.length > 1 && values[0] > 0 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : null;

  const metrics: { key: ActivityMetric; label: string }[] = [
    { key: "volume", label: tr(locale, "Volume", "Объём") },
    { key: "openInterest", label: "OI" },
    { key: "uniqueTraders", label: tr(locale, "Users", "Пользователи") },
  ];

  const tab = (active: boolean) =>
    `pf-transition rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold ${active ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`;

  return (
    <div className="mt-11">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "Market activity", "Активность рынка")}</h2>
        <div className="flex items-center gap-2.5">
          <div className="flex gap-0.5 rounded-[10px] border border-border bg-bg p-[3px]">
            {metrics.map((m) => (
              <button key={m.key} type="button" onClick={() => setMetric(m.key)} className={tab(metric === m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          {!isUsers && (
            <div className="flex gap-0.5 rounded-[10px] border border-border bg-bg p-[3px]">
              {([30, 90, 180] as Range[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRangeDays(d)}
                  className={`pf-transition rounded-[7px] px-3 py-1.5 font-mono-num text-[12px] ${rangeDays === d ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                >
                  {d === 30 ? "30D" : d === 90 ? "3M" : "6M"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[18px] border border-border bg-surface-1 px-6 pb-5 pt-5">
        <div className="flex items-baseline gap-3.5 pb-4">
          <div className="font-mono-num text-[28px] text-text-primary">{isUsers ? compactCount(latest, true) : compactUsd(latest)}</div>
          {delta !== null && (
            <div className={`text-[13px] ${delta >= 0 ? "text-positive" : "text-negative"}`}>
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </div>
          )}
          <div className="text-[13px] text-text-dim">{caption}</div>
        </div>

        {!data && !error && <div className="pf-skeleton h-[260px] rounded-xl border border-border bg-surface-2" />}
        {error && <p className="py-16 text-center text-[14px] text-negative">{tr(locale, "Couldn’t load market activity right now.", "Сейчас не удалось загрузить активность рынка.")}</p>}

        {data && (series.length > 1 ? <Chart series={series} fmt={fmt} locale={locale} /> : series.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-[14px] text-text-muted">
            {isUsers
              ? tr(locale, "Current figure shown above · daily history is being recorded and will fill the chart over time.", "Текущее значение показано выше · дневная история записывается и со временем заполнит график.")
              : isVolume
                ? tr(locale, "Historical volume is collecting; new daily API observations are saved automatically.", "История объёма собирается; новые дневные наблюдения API сохраняются автоматически.")
                : tr(locale, "No open-interest history is available yet.", "История открытого интереса пока недоступна.")}
          </div>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-[14px] text-text-muted">{fmt(series[0].value)}</div>
        ))}
      </div>
      <div className="pt-2.5 text-[12px] text-text-dim">
        {tr(locale, "Only ranges backed by real data are offered. Longer windows unlock as the season runs.", "Показываются только диапазоны с реальными данными. Более длинные окна открываются по ходу сезона.")}
      </div>
    </div>
  );
}

function Chart({ series, fmt, locale }: { series: ActivityPoint[]; fmt: (v: number) => string; locale: "en" | "ru" }) {
  const n = series.length;
  const values = series.map((p) => p.value);
  const max = Math.max(...values) * 1.06;
  const min = Math.min(...values) * 0.92;
  const span = max - min || 1;
  const X = (i: number) => (i / (n - 1)) * 1120;
  const Y = (v: number) => 250 - ((v - min) / span) * 232;
  const path = series.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L1120 250 L0 250 Z`;
  const tickIdx = [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1];
  return (
    <>
      <svg viewBox="0 0 1120 260" preserveAspectRatio="none" className="block h-[260px] w-full">
        <defs>
          <linearGradient id="pfActivityArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 72, 134, 196].map((y) => (
          <line key={y} x1="0" y1={y} x2="1120" y2={y} stroke="var(--border)" strokeWidth="1" />
        ))}
        <line x1="0" y1="252" x2="1120" y2="252" stroke="var(--border)" strokeWidth="1.5" />
        <path d={area} fill="url(#pfActivityArea)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between pt-2.5">
        {tickIdx.map((i, k) => (
          <div key={k} className="font-mono-num text-[11px] text-text-dim">{dayLabel(series[i].date, locale)}</div>
        ))}
      </div>
      <div className="pt-1 text-right font-mono-num text-[11px] text-text-dim">{fmt(values[values.length - 1])}</div>
    </>
  );
}
