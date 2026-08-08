"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { compactUsd, dayLabel, type ActivityPoint } from "@/components/VariationalMarketActivity";

type Range = 30 | 90 | 180;
type ActivityResponse = {
  asOf: string;
  days: number;
  openInterest: { series: ActivityPoint[]; latest: number | null; source: "defillama" };
};

function availableRange(series: ActivityPoint[], days: Range): boolean {
  return series.length >= Math.min(days, 2);
}

export function TxFlowActivityV2() {
  const locale = useLocale();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState(false);
  const [rangeDays, setRangeDays] = useState<Range>(30);

  useEffect(() => {
    let active = true;
    fetch("/api/venues/txflow/activity")
      .then((response) => (response.ok ? (response.json() as Promise<ActivityResponse>) : Promise.reject(new Error("failed"))))
      .then((response) => active && setData(response))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const series = useMemo(() => {
    const all = data?.openInterest.series ?? [];
    return all.slice(-rangeDays);
  }, [data, rangeDays]);
  const values = series.map((point) => point.value);
  const delta = values.length > 1 && values[0] > 0 ? ((values.at(-1)! - values[0]) / values[0]) * 100 : null;
  const tab = (active: boolean) =>
    `pf-transition rounded-[7px] px-3 py-1.5 font-mono-num text-[12px] ${active ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`;

  return (
    <section className="mt-11" aria-labelledby="txflow-activity-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h2 id="txflow-activity-heading" className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">
            {tr(locale, "Market activity", "Активность рынка")}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {tr(locale, "Protocol-wide open interest", "Открытый интерес по протоколу")}
          </p>
        </div>
        <div className="flex gap-0.5 rounded-[10px] border border-border bg-bg p-[3px]">
          {([30, 90, 180] as Range[]).map((days) => {
            const enabled = availableRange(data?.openInterest.series ?? [], days);
            return (
              <button
                key={days}
                type="button"
                disabled={!enabled}
                onClick={() => setRangeDays(days)}
                className={`${tab(rangeDays === days)} disabled:cursor-not-allowed disabled:opacity-35`}
              >
                {days === 30 ? "30D" : days === 90 ? "3M" : "6M"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[18px] border border-border bg-surface-1 px-6 pb-5 pt-5">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-4">
          <div className="font-mono-num text-[28px] text-text-primary">{compactUsd(data?.openInterest.latest ?? null)}</div>
          {delta !== null && (
            <div className={`text-[13px] ${delta >= 0 ? "text-positive" : "text-negative"}`}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
            </div>
          )}
          <div className="text-[13px] text-text-dim">{tr(locale, "OI · current", "OI · сейчас")}</div>
        </div>

        {!data && !error && <div className="pf-skeleton h-[260px] rounded-xl border border-border bg-surface-2" />}
        {error && <p className="py-16 text-center text-[14px] text-negative">{tr(locale, "Couldn’t load market activity right now.", "Сейчас не удалось загрузить активность рынка.")}</p>}
        {data && series.length > 1 && <Chart series={series} locale={locale} />}
        {data && series.length <= 1 && (
          <p className="flex h-[260px] items-center justify-center text-center text-[14px] text-text-muted">
            {tr(locale, "Historical open interest is not available yet.", "История открытого интереса пока недоступна.")}
          </p>
        )}
        <p className="pt-3 text-[11px] text-text-dim">
          {tr(locale, "Source: DefiLlama · refreshed hourly", "Источник: DefiLlama · обновление раз в час")}
        </p>
      </div>
    </section>
  );
}

function Chart({ series, locale }: { series: ActivityPoint[]; locale: "en" | "ru" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const values = series.map((point) => point.value);
  const max = Math.max(...values) * 1.06;
  const min = Math.min(...values) * 0.92;
  const span = max - min || 1;
  const x = (index: number) => (index / (series.length - 1)) * 1120;
  const y = (value: number) => 250 - ((value - min) / span) * 232;
  const path = series.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const area = `${path} L1120 250 L0 250 Z`;
  const tickIndexes = [0, Math.round((series.length - 1) * 0.25), Math.round((series.length - 1) * 0.5), Math.round((series.length - 1) * 0.75), series.length - 1];
  const pick = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setHighlight(Math.max(0, Math.min(series.length - 1, Math.round(((clientX - rect.left) / rect.width) * (series.length - 1)))));
  };
  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => pick(event.clientX);
  const onTouch = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (touch) pick(touch.clientX);
  };
  const hx = highlight === null ? 0 : (x(highlight) / 1120) * 100;
  const hy = highlight === null ? 0 : (y(series[highlight].value) / 260) * 100;

  return (
    <>
      <div ref={ref} className="relative h-[260px] touch-pan-y" onMouseMove={onMouseMove} onMouseLeave={() => setHighlight(null)} onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={() => setHighlight(null)}>
        <svg viewBox="0 0 1120 260" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="txflowOiArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fce43" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#8fce43" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[10, 72, 134, 196].map((lineY) => <line key={lineY} x1="0" y1={lineY} x2="1120" y2={lineY} stroke="var(--border)" strokeWidth="1" />)}
          <line x1="0" y1="252" x2="1120" y2="252" stroke="var(--border)" strokeWidth="1.5" />
          <path d={area} fill="url(#txflowOiArea)" />
          <path d={path} fill="none" stroke="#8fce43" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {highlight !== null && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute bottom-2 top-0 w-px bg-text-dim/50" style={{ left: `${hx}%` }} />
            <div className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#8fce43] bg-bg" style={{ left: `${hx}%`, top: `${hy}%` }} />
            <div className="absolute -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-lg" style={{ left: `${Math.min(86, Math.max(14, hx))}%`, top: `${hy}%`, transform: "translate(-50%, calc(-100% - 12px))" }}>
              <span className="text-text-muted">{dayLabel(series[highlight].date, locale)}</span>{" "}
              <span className="font-mono-num text-text-primary">{compactUsd(series[highlight].value)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between pt-2.5">
        {tickIndexes.map((index, key) => <div key={key} className="font-mono-num text-[11px] text-text-dim">{dayLabel(series[index].date, locale)}</div>)}
      </div>
    </>
  );
}
