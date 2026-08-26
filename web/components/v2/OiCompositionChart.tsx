"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { tr, useLocale, type Locale } from "@/components/LocaleProvider";

type Point = { date: string; btc: number; tradfi: number; other: number; total: number };
interface Composition {
  asOf: string;
  days: number;
  latest: Point | null;
  series: Point[];
}

/** Category order is bottom-to-top in the stack. */
const CATS = ["other", "tradfi", "btc"] as const;
type Cat = (typeof CATS)[number];

// Fixed hues rather than theme tokens: the three shares must stay
// distinguishable from each other in either theme.
const COLORS: Record<Cat, string> = {
  btc: "#4d8dff", // accent blue
  tradfi: "#e2792f", // TradFi orange, as on the reference chart
  other: "#7d8798", // neutral grey
};

function catLabel(locale: Locale, cat: Cat): string {
  if (cat === "btc") return "BTC";
  if (cat === "tradfi") return "TradFi";
  return tr(locale, "Other crypto", "Другая крипта");
}

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtDay = (iso: string, locale: Locale) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
/** Full date for the reading currently shown, e.g. "August 7, 2026". */
const fmtFullDay = (iso: string, locale: Locale) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Six evenly spaced tick positions (or every point when the series is short). */
function tickIndexes(n: number): number[] {
  if (n <= 6) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: 6 }, (_, k) => Math.round((k * (n - 1)) / 5));
}

export function OiCompositionChart({
  venueSlug = "variational",
  initialData = null,
}: {
  venueSlug?: "variational" | "txflow";
  /** Rendered with the page when the server could read it. The fetch below is
   *  then never made; it stays for the case where that server read failed. */
  initialData?: Composition | null;
}) {
  const locale = useLocale();
  const [data, setData] = useState<Composition | null>(initialData);
  const [error, setError] = useState(false);
  const [hi, setHi] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialData) return;
    let active = true;
    fetch(`/api/venues/${venueSlug}/oi-composition`)
      .then((r) => (r.ok ? (r.json() as Promise<Composition>) : Promise.reject(new Error("failed"))))
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [venueSlug, initialData]);

  const series = data?.series ?? [];
  const n = series.length;
  const shown = hi !== null && series[hi] ? series[hi] : series[n - 1];

  const pick = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r || n < 2) return;
    setHi(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => pick(e.clientX);
  const onTouch = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) pick(t.clientX);
  };

  // Stacked bands as SVG paths. The viewBox keeps the plot's real aspect ratio
  // (1000x300) instead of stretching a 1000x100 box, so edges stay crisp.
  const VB_W = 1000;
  const VB_H = 300;
  const bands: { cat: Cat; d: string }[] = [];
  if (n > 1) {
    let base = series.map(() => 0);
    for (const cat of CATS) {
      const tops = series.map((p, i) => base[i] + pct(p[cat], p.total));
      const X = (i: number) => (i / (n - 1)) * VB_W;
      const Y = (v: number) => ((100 - v) / 100) * VB_H;
      const up = tops.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(2)}`).join(" ");
      const down = base.map((_, i) => `L${X(n - 1 - i).toFixed(1)} ${Y(base[n - 1 - i]).toFixed(2)}`).join(" ");
      bands.push({ cat, d: `${up} ${down} Z` });
      base = tops;
    }
  }

  return (
    <div className="mt-11">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">
          {tr(locale, "Open interest composition", "Состав открытого интереса")}
        </h2>
      </div>

      <div className="rounded-[18px] border border-border bg-surface-1 px-6 pb-5 pt-5">
        {!data && !error && <div className="pf-skeleton h-[300px] rounded-xl border border-border bg-surface-2" />}
        {error && (
          <p className="py-16 text-center text-[14px] text-negative">
            {tr(locale, "Couldn’t load the composition right now.", "Сейчас не удалось загрузить состав.")}
          </p>
        )}

        {data && n < 2 && (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-[14px] text-text-muted">
            {tr(
              locale,
              "Composition history will appear once at least two days of snapshots are saved.",
              "История состава появится, когда накопится минимум два дня снимков.",
            )}
          </div>
        )}

        {data && n > 1 && shown && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 pb-4">
              {[...CATS].reverse().map((cat) => (
                <span key={cat} className="flex items-baseline gap-2">
                  <span className="h-2.5 w-2.5 translate-y-[-1px] rounded-sm" style={{ background: COLORS[cat] }} />
                  <span className="text-[13px] text-text-muted">{catLabel(locale, cat)}</span>
                  <span className="font-mono-num text-[15px] text-text-primary">{fmtPct(pct(shown[cat], shown.total))}</span>
                </span>
              ))}
              {/* Brand mark sits above the plot, opposite the category shares. */}
              <span className="ml-auto flex items-center gap-2 self-center">
                <Image src="/icon.svg" alt="" aria-hidden width={18} height={18} className="h-[18px] w-[18px] rounded-[5px]" />
                <span className="text-[13px] font-bold tracking-tight text-text-primary">PerpFarm</span>
              </span>
            </div>

            <div
              ref={plotRef}
              className="relative h-[300px] overflow-hidden rounded-lg touch-pan-y"
              onMouseMove={onMove}
              onMouseLeave={() => setHi(null)}
              onTouchStart={onTouch}
              onTouchMove={onTouch}
              onTouchEnd={() => setHi(null)}
            >
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {bands.map((b) => (
                  <path key={b.cat} d={b.d} fill={COLORS[b.cat]} shapeRendering="geometricPrecision" />
                ))}
                {[25, 50, 75].map((p) => (
                  <line key={p} x1="0" y1={(p / 100) * VB_H} x2={VB_W} y2={(p / 100) * VB_H} stroke="rgba(255,255,255,0.16)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              {/* The reading's date rides on the plot, following the cursor. */}
              <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/35 px-2.5 py-1.5 font-mono-num text-[12px] text-white backdrop-blur-[2px]">
                {fmtFullDay(shown.date, locale)}
              </div>
              {hi !== null && (
                <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/70" style={{ left: `${(hi / (n - 1)) * 100}%` }} />
              )}
            </div>

            <div className="flex justify-between pt-2.5">
              {tickIndexes(n).map((i) => (
                <span key={i} className="font-mono-num text-[11px] text-text-dim">{fmtDay(series[i].date, locale)}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
