"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { compactCount, compactUsd, dayLabel } from "@/lib/format";
import type { ActivityPoint, ActivityResponse } from "@/lib/activity/types";
import { hasObservedRange, selectObservedRange } from "@/lib/activity-range";

type Range = 30 | 90 | 180;
/** Users is offered only where the protocol publishes a real daily history of
 *  it -- TxFlow, via its official Dune dashboard. Where the response carries no
 *  `uniqueTraders`, the tab does not exist rather than opening onto a dot. */
type Metric = "volume" | "openInterest" | "uniqueTraders";

/** Native market-activity chart. Every plotted point comes from the activity
 * API or a saved observation; unavailable historical ranges stay disabled. */
export function MarketActivityV2({ venueSlug = "variational" }: { venueSlug?: "variational" | "txflow" }) {
  const locale = useLocale();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<Metric>("volume");
  const [rangeDays, setRangeDays] = useState<Range>(30);

  useEffect(() => {
    let active = true;
    fetch(`/api/venues/${venueSlug}/activity`)
      .then((r) => (r.ok ? (r.json() as Promise<ActivityResponse>) : Promise.reject(new Error("failed"))))
      .then((r) => active && setData(r))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [venueSlug]);

  const users = data?.uniqueTraders;
  // A protocol without a trader history must never be left showing that tab --
  // the metric survives a venue switch, the data does not.
  const activeMetric: Metric = metric === "uniqueTraders" && data && !users ? "volume" : metric;
  const isVolume = activeMetric === "volume";
  const isUsers = activeMetric === "uniqueTraders";
  const rawSeries = useMemo(
    () => (data ? (isUsers ? users?.series ?? [] : isVolume ? data.volume.series : data.openInterest.series) : []),
    [data, isUsers, isVolume, users],
  );

  const series = useMemo(() => selectObservedRange(rawSeries, rangeDays), [rangeDays, rawSeries]);

  const latest = data ? (isUsers ? users?.latest ?? null : isVolume ? data.volume.latest24h : data.openInterest.latest) : null;
  const fmt = isUsers ? (value: number) => compactCount(value) : compactUsd;
  const caption = isUsers
    ? tr(locale, "unique traders · protocol-wide", "уникальные трейдеры · по протоколу")
    : isVolume
      ? tr(locale, "traded volume · last 24h", "объём торгов · за 24ч")
      : tr(locale, "open interest · current", "открытый интерес · сейчас");

  const values = series.map((p) => p.value);
  const delta = values.length > 1 && values[0] > 0 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : null;

  const metrics: { key: Metric; label: string }[] = [
    { key: "volume", label: tr(locale, "Volume", "Объём") },
    { key: "openInterest", label: "OI" },
    ...(users ? [{ key: "uniqueTraders" as const, label: tr(locale, "Users", "Пользователи") }] : []),
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
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMetric(m.key);
                  if (data) {
                    const nextSeries = m.key === "uniqueTraders"
                      ? users?.series ?? []
                      : m.key === "volume"
                        ? data.volume.series
                        : data.openInterest.series;
                    if (!hasObservedRange(nextSeries, rangeDays)) setRangeDays(30);
                  }
                }}
                className={tab(activeMetric === m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {/* Unavailable ranges disable rather than disappear, so the row
              cannot reflow when the metric changes. */}
          {(
            <div className="flex gap-0.5 rounded-[10px] border border-border bg-bg p-[3px]">
              {([30, 90, 180] as Range[]).map((d) => (
                (() => {
                  const available = hasObservedRange(rawSeries, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!available}
                      aria-disabled={!available}
                      onClick={() => setRangeDays(d)}
                      className={`pf-transition rounded-[7px] px-3 py-1.5 font-mono-num text-[12px] disabled:cursor-not-allowed disabled:opacity-35 ${rangeDays === d ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                    >
                      {d === 30 ? "30D" : d === 90 ? "3M" : "6M"}
                    </button>
                  );
                })()
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[18px] border border-border bg-surface-1 px-6 pb-5 pt-5">
        <div className="flex items-baseline gap-3.5 pb-4">
          <div className="font-mono-num text-[28px] text-text-primary">{isUsers ? compactCount(latest) : compactUsd(latest)}</div>
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
              ? tr(locale, "No trader history is available yet.", "История по трейдерам пока недоступна.")
              : isVolume
                ? tr(locale, "Historical volume will appear as saved observations accumulate.", "История объёма появится по мере накопления сохранённых наблюдений.")
                : tr(locale, "No open-interest history is available yet.", "История открытого интереса пока недоступна.")}
          </div>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-[14px] text-text-muted">{fmt(series[0].value)}</div>
        ))}
      </div>
    </div>
  );
}

function Chart({ series, fmt, locale }: { series: ActivityPoint[]; fmt: (v: number) => string; locale: "en" | "ru" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);
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

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setHi(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => pick(e.clientX);
  // Touch: dragging a finger across the chart scrubs the point. `touch-action:
  // pan-y` keeps vertical page scrolling while claiming horizontal movement.
  const onTouch = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) pick(t.clientX);
  };
  const hx = hi !== null ? (X(hi) / 1120) * 100 : 0;
  const hy = hi !== null ? (Y(series[hi].value) / 260) * 100 : 0;

  return (
    <>
      <div
        ref={ref}
        className="relative h-[260px] touch-pan-y"
        onMouseMove={onMove}
        onMouseLeave={() => setHi(null)}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={() => setHi(null)}
      >
        <svg viewBox="0 0 1120 260" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
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
        {hi !== null && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute bottom-2 top-0 w-px bg-text-dim/50" style={{ left: `${hx}%` }} />
            <div className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg" style={{ left: `${hx}%`, top: `${hy}%` }} />
            <div
              className="absolute -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-lg"
              style={{ left: `${Math.min(86, Math.max(14, hx))}%`, top: `${hy}%`, transform: "translate(-50%, calc(-100% - 12px))" }}
            >
              <span className="text-text-muted">{dayLabel(series[hi].date, locale)}</span>{" "}
              <span className="font-mono-num text-text-primary">{fmt(series[hi].value)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between pt-2.5">
        {tickIdx.map((i, k) => (
          <div key={k} className="font-mono-num text-[11px] text-text-dim">{dayLabel(series[i].date, locale)}</div>
        ))}
      </div>
    </>
  );
}
