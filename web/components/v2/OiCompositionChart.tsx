"use client";

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

// Fixed hues (not theme tokens): the copied PNG must look the same for everyone,
// and the three shares need to stay distinguishable side by side.
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

export function OiCompositionChart() {
  const locale = useLocale();
  const [data, setData] = useState<Composition | null>(null);
  const [error, setError] = useState(false);
  const [hi, setHi] = useState<number | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/venues/variational/oi-composition")
      .then((r) => (r.ok ? (r.json() as Promise<Composition>) : Promise.reject(new Error("failed"))))
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

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

  /** Renders the chart to a PNG on the clipboard, watermarked with PerpFarm. */
  async function copyImage() {
    if (n < 2) return;
    try {
      const W = 1600;
      const H = 900;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");

      const pad = { top: 120, right: 60, bottom: 70, left: 90 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;

      ctx.fillStyle = "#070a12";
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#f3f6fc";
      ctx.font = "600 40px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(tr(locale, "Open interest over time", "Открытый интерес по времени"), pad.left, 66);
      ctx.fillStyle = "#8b96ad";
      ctx.font = "400 22px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText("Variational · BTC / TradFi / Other crypto", pad.left, 100);

      // Watermark: logo mark + wordmark, mirroring the reference chart's corner.
      const bx = W - pad.right - 200;
      ctx.fillStyle = "#4d8dff";
      ctx.beginPath();
      ctx.roundRect(bx, 44, 34, 34, 10);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(bx + 10, 52, 5, 12, 2.5);
      ctx.roundRect(bx + 19, 52, 5, 18, 2.5);
      ctx.fill();
      ctx.fillStyle = "#e8ecf5";
      ctx.font = "700 26px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText("PerpFarm", bx + 46, 70);

      // Gridlines at 0/25/50/75/100%.
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.fillStyle = "#78849c";
      ctx.font = "400 18px 'JetBrains Mono', monospace";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const y = pad.top + (plotH * g) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.fillText(`${100 - g * 25}%`, 28, y + 6);
      }

      // 100%-stacked areas, bottom-up.
      const X = (i: number) => pad.left + (i / (n - 1)) * plotW;
      let base = series.map(() => 0);
      for (const cat of CATS) {
        const tops = series.map((p, i) => base[i] + pct(p[cat], p.total));
        ctx.fillStyle = COLORS[cat];
        ctx.beginPath();
        ctx.moveTo(X(0), pad.top + plotH * (1 - base[0] / 100));
        for (let i = 0; i < n; i++) ctx.lineTo(X(i), pad.top + plotH * (1 - tops[i] / 100));
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), pad.top + plotH * (1 - base[i] / 100));
        ctx.closePath();
        ctx.fill();
        base = tops;
      }

      // Date axis + legend.
      ctx.fillStyle = "#78849c";
      ctx.font = "400 18px 'JetBrains Mono', monospace";
      for (const i of [0, Math.round((n - 1) / 2), n - 1]) {
        const label = fmtDay(series[i].date, locale);
        const w = ctx.measureText(label).width;
        ctx.fillText(label, Math.min(Math.max(X(i) - w / 2, pad.left), pad.left + plotW - w), H - 30);
      }
      let lx = pad.left;
      for (const cat of [...CATS].reverse()) {
        ctx.fillStyle = COLORS[cat];
        ctx.beginPath();
        ctx.roundRect(lx, H - 62, 16, 16, 4);
        ctx.fill();
        const label = catLabel(locale, cat);
        ctx.fillStyle = "#cfd8ea";
        ctx.font = "500 20px 'Plus Jakarta Sans', system-ui, sans-serif";
        ctx.fillText(label, lx + 24, H - 48);
        lx += 24 + ctx.measureText(label).width + 34;
      }

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("no blob");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied(null), 2200);
  }

  // Stacked bands as SVG paths (0-100 space, y flipped by the viewBox).
  const bands: { cat: Cat; d: string }[] = [];
  if (n > 1) {
    let base = series.map(() => 0);
    for (const cat of CATS) {
      const tops = series.map((p, i) => base[i] + pct(p[cat], p.total));
      const X = (i: number) => (i / (n - 1)) * 1000;
      const up = tops.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${(100 - v).toFixed(2)}`).join(" ");
      const down = base
        .map((v, i) => `L${X(n - 1 - i).toFixed(1)} ${(100 - base[n - 1 - i]).toFixed(2)}`)
        .join(" ");
      bands.push({ cat, d: `${up} ${down} Z` });
      base = tops;
    }
  }

  return (
    <div className="mt-11">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">
            {tr(locale, "Open interest composition", "Состав открытого интереса")}
          </h2>
          <div className="text-[14px] text-text-muted">
            {tr(locale, "Share of open interest by category, one reading per day.", "Доля открытого интереса по категориям, одно значение в день.")}
          </div>
        </div>
        <button
          type="button"
          onClick={copyImage}
          disabled={n < 2}
          className="pf-transition flex items-center gap-2 rounded-[10px] border border-border bg-bg px-3.5 py-2 text-[13px] font-semibold text-text-muted hover:border-text-muted/50 hover:text-text-primary disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {copied === "ok"
            ? tr(locale, "Copied", "Скопировано")
            : copied === "fail"
              ? tr(locale, "Copy failed", "Не удалось")
              : tr(locale, "Copy", "Копировать")}
        </button>
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
              <span className="font-mono-num text-[12px] text-text-dim">{fmtDay(shown.date, locale)}</span>
            </div>

            <div
              ref={plotRef}
              className="relative h-[300px] touch-pan-y"
              onMouseMove={onMove}
              onMouseLeave={() => setHi(null)}
              onTouchStart={onTouch}
              onTouchMove={onTouch}
              onTouchEnd={() => setHi(null)}
            >
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {bands.map((b) => (
                  <path key={b.cat} d={b.d} fill={COLORS[b.cat]} />
                ))}
                {[25, 50, 75].map((y) => (
                  <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke="rgba(255,255,255,0.14)" strokeWidth="0.3" />
                ))}
              </svg>
              {hi !== null && (
                <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/60" style={{ left: `${(hi / (n - 1)) * 100}%` }} />
              )}
            </div>

            <div className="flex justify-between pt-2.5">
              {[0, Math.round((n - 1) / 2), n - 1].map((i) => (
                <span key={i} className="font-mono-num text-[11px] text-text-dim">{fmtDay(series[i].date, locale)}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
