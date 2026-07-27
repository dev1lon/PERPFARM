"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import { tr, useLocale } from "@/components/LocaleProvider";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { RouteMap } from "@/components/v2/RouteMap";
import { CrossPairRankings } from "@/components/CrossPairRankings";
import type { VenueSummary } from "@/lib/types";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  volume24hUsd: number;
  competitionEligible: boolean;
  firstLimitSide: "long" | "short";
  cycleCostUsd: number;
  spreadCostUsd: number;
  slippageCostUsd: number;
}
interface Band {
  key: "high" | "medium" | "low" | "all";
  pairs: PairRanking[];
}
interface RankingResponse {
  asOf: string;
  fillNotionalUsd: number;
  accountVolumeUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  minVolumeUsd: number;
  competition: { active: boolean; name: string };
  bands: Band[];
}

type Status = "idle" | "running" | "loaded" | "error";

const compactUsd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);

function orders(firstLimitSide: "long" | "short") {
  const longLimitFirst = firstLimitSide === "long";
  return {
    entry: longLimitFirst ? "LIMIT / MARKET" : "MARKET / LIMIT",
    exit: longLimitFirst ? "MARKET / LIMIT" : "LIMIT / MARKET",
  };
}

const GRID = "grid-cols-[40px_100px_104px_minmax(120px,1fr)_minmax(120px,1fr)_118px_118px_104px_28px]";

function HedgeDropdown({
  options,
  value,
  onChange,
}: {
  options: { slug: string; name: string }[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const sel = options.find((o) => o.slug === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="pf-transition flex h-[50px] w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 text-left hover:border-text-muted/40"
      >
        {sel && <ProtocolMark slug={sel.slug} name={sel.name} size={26} radius={8} />}
        <span className="text-[15px] font-semibold text-text-primary">{sel?.name ?? tr(locale, "Select", "Выбрать")}</span>
        <span className="ml-auto text-[11px] text-text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface-1 p-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.slug}
              type="button"
              role="option"
              aria-selected={o.slug === value}
              onClick={() => {
                onChange(o.slug);
                setOpen(false);
              }}
              className={`pf-transition flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 ${o.slug === value ? "bg-surface-2" : ""}`}
            >
              <ProtocolMark slug={o.slug} name={o.name} size={22} radius={7} />
              <span className={`text-[14px] ${o.slug === value ? "text-accent" : "text-text-primary"}`}>{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProtocolCalculatorV2({ otherVenues }: { otherVenues: VenueSummary[] }) {
  const locale = useLocale();
  const hedgeOptions = [{ slug: "variational", name: "Variational" }, ...otherVenues.map((v) => ({ slug: v.slug, name: v.name }))];

  const [hedge, setHedge] = useState("variational");
  const [accountVolumeInput, setAccountVolumeInput] = useState("50000");
  const [tradfiOnly, setTradfiOnly] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [notionalUsd, setNotionalUsd] = useState<number | null>(null);
  const [ranHedge, setRanHedge] = useState("variational");
  const [appliedTradfiOnly, setAppliedTradfiOnly] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<RankingResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const requested = Number(accountVolumeInput);
  const validVolume = Number.isFinite(requested) && requested >= 1_000 && requested <= 200_000;
  const hedgeName = hedgeOptions.find((o) => o.slug === hedge)?.name ?? hedge;
  const sameVenue = hedge === "variational";

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // Same-venue run pulls the live pair-rankings; cross uses CrossPairRankings.
  useEffect(() => {
    if (status !== "loaded" || notionalUsd == null || ranHedge !== "variational") return;
    let active = true;
    fetch(`/api/venues/variational/pair-rankings?accountVolumeUsd=${notionalUsd}&tradfiOnly=${appliedTradfiOnly}`)
      .then((r) => (r.ok ? (r.json() as Promise<RankingResponse>) : Promise.reject(new Error("failed"))))
      .then((d) => active && setData(d))
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, [status, notionalUsd, appliedTradfiOnly, ranHedge]);

  function run() {
    if (!validVolume) {
      setErrorMessage(tr(locale, "Enter volume from $1,000 to $200,000 per account.", "Введите объём от $1 000 до $200 000 на аккаунт."));
      setStatus("error");
      return;
    }
    setErrorMessage(null);
    setStatus("running");
    setExpanded(null);
    setData(null);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setNotionalUsd(requested);
      setRanHedge(hedge);
      setAppliedTradfiOnly(tradfiOnly);
      setStatus("loaded");
    }, 900);
  }

  const runLabel = status === "running" ? tr(locale, "Running…", "Считаем…") : status === "loaded" ? tr(locale, "Run again", "Ещё раз") : tr(locale, "Run", "Рассчитать");
  const field = "flex flex-col gap-2.5";
  const flatPairs = data ? data.bands.flatMap((b) => b.pairs) : [];
  const top = [...flatPairs].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, 10);
  // Recommended = cheapest MEDIUM-OI pair (Priority 1 driver), NOT the global
  // cheapest: high-OI majors are cheap to trade but not the best points target.
  const byOi = [...flatPairs].sort((a, b) => b.openInterestUsd - a.openInterestUsd);
  const third = Math.max(1, Math.ceil(byOi.length / 3));
  const mediumByCost = byOi.slice(third, third * 2).sort((a, b) => a.cycleCostUsd - b.cycleCostUsd);
  // During an active competition, prefer the cheapest ELIGIBLE (TradFi) medium-OI
  // pair — its volume counts double toward the competition. Otherwise the
  // cheapest medium-OI pair (Priority 1), never the global cheapest.
  const compActive = data?.competition?.active ?? false;
  const best = (compActive ? mediumByCost.find((p) => p.competitionEligible) : undefined) ?? mediumByCost[0] ?? top[0];

  return (
    <div className="mt-10">
      {/* calculator bar */}
      <div className="rounded-[20px] border border-border bg-surface-1 px-7 py-6">
        <div className="grid items-end gap-5 lg:grid-cols-[1fr_1fr_1fr_132px]">
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{tr(locale, "Farm points on", "Фармим поинты на")}</div>
            <div className="flex h-[50px] items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3.5">
              <ProtocolMark slug="variational" name="Variational" size={26} radius={8} />
              <span className="text-[15px] font-semibold text-text-primary">Variational</span>
              <span className="ml-auto font-mono-num text-[10px] tracking-[0.08em] text-accent">SELECTED</span>
            </div>
          </div>
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{tr(locale, "Hedge with", "Хедж с")}</div>
            <HedgeDropdown options={hedgeOptions} value={hedge} onChange={setHedge} />
          </div>
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{tr(locale, "Volume per account", "Объём на аккаунт")}</div>
            <div className={`flex h-[50px] items-center gap-2 rounded-xl border bg-surface-2 px-3.5 ${validVolume ? "border-border" : "border-negative/50"}`}>
              <span className="font-mono-num text-[15px] text-text-dim">$</span>
              <input
                type="number"
                inputMode="numeric"
                min="1000"
                max="200000"
                step="1000"
                value={accountVolumeInput}
                onChange={(e) => setAccountVolumeInput(e.target.value)}
                style={{ outline: "none" }}
                className="pf-inline-number-input min-w-0 flex-1 bg-transparent font-mono-num text-[16px] text-text-primary"
              />
              <span className="font-mono-num text-[12px] text-text-dim">USDC</span>
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={status === "running"}
            className="pf-transition h-[50px] rounded-xl bg-accent text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(77,141,255,0.26)] hover:bg-accent-hover disabled:opacity-60"
          >
            {runLabel}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-4">
            <div className="text-[13px] text-text-muted">
              {tr(locale, "Full hedge cycle:", "Полный хедж-цикл:")}{" "}
              <span className="font-mono-num text-text-primary">{formatUsd((validVolume ? requested : 0) * 2, { decimals: 0 })}</span>{" "}
              {tr(locale, "across two accounts.", "на два аккаунта.")}
            </div>
            {sameVenue && (
              <button
                type="button"
                role="switch"
                aria-checked={tradfiOnly}
                onClick={() => setTradfiOnly((v) => !v)}
                className="flex items-center gap-2.5"
              >
                <span className={`pf-transition relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ${tradfiOnly ? "bg-accent" : "border border-border bg-surface-2"}`}>
                  <span className={`pf-transition inline-block h-4 w-4 rounded-full bg-white ${tradfiOnly ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </span>
                <span className="text-[13px] text-text-muted">{tr(locale, "Only TradFi", "Только TradFi")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* states */}
      {status === "idle" && (
        <div className="mt-5 flex flex-col items-center gap-2.5 rounded-[20px] border border-dashed border-border bg-bg px-8 py-13 text-center">
          <div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Your route appears here", "Ваш маршрут появится здесь")}</div>
          <div className="max-w-[460px] text-[14px] text-text-muted">
            {tr(locale, "Choose where to hedge, enter your volume and press Run. PerpFarm scans every eligible market and returns the cheapest route.", "Выберите, где хеджировать, введите объём и нажмите Run. PerpFarm просканирует все eligible-рынки и вернёт самый дешёвый маршрут.")}
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="mt-5 rounded-2xl border border-negative/40 bg-negative/10 p-4 text-[14px] text-negative">{errorMessage}</div>
      )}
      {status === "running" && (
        <div className="mt-5 flex flex-col items-center gap-4 rounded-[20px] border border-accent/25 bg-bg px-8 py-14">
          <div className="h-0.5 w-52 overflow-hidden rounded bg-white/10">
            <div className="pf-scan h-full w-1/3 bg-accent" />
          </div>
          <div className="font-mono-num text-[13px] text-accent">{tr(locale, "Scanning eligible markets…", "Сканируем eligible-рынки…")}</div>
        </div>
      )}

      {status === "loaded" && notionalUsd !== null && ranHedge === "variational" && (
        <SameVenueResult
          data={data}
          top={top}
          best={best}
          notionalUsd={notionalUsd}
          hedgeName="Variational"
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}

      {status === "loaded" && notionalUsd !== null && ranHedge !== "variational" && (
        <div className="pf-rise mt-5">
          <CrossPairRankings
            key={`${ranHedge}-${notionalUsd}`}
            venueSlug="variational"
            hedgeSlug={ranHedge}
            homeName="Variational"
            hedgeName={hedgeName}
            accountVolumeUsd={notionalUsd}
          />
        </div>
      )}
    </div>
  );
}

function SameVenueResult({
  data,
  top,
  best,
  notionalUsd,
  hedgeName,
  expanded,
  setExpanded,
}: {
  data: RankingResponse | null;
  top: PairRanking[];
  best: PairRanking | undefined;
  notionalUsd: number;
  hedgeName: string;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const locale = useLocale();
  if (!data || !best) {
    return <div className="pf-skeleton mt-5 h-80 rounded-[20px] border border-border bg-surface-1" />;
  }
  const bestOrders = orders(best.firstLimitSide);
  return (
    <>
      {/* recommended route */}
      <div className="pf-rise mt-5 overflow-hidden rounded-[20px] border border-accent/30" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--accent) 11%, transparent), var(--surface-1) 62%)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{tr(locale, "Recommended route", "Рекомендованный маршрут")}</div>
            {best.competitionEligible && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                {tr(locale, "Competition eligible", "Eligible для конкурса")}
              </span>
            )}
          </div>
        </div>
        <div className="grid lg:grid-cols-[1fr_400px]">
          <div className="px-6 py-6">
            <div className="flex items-baseline gap-3.5">
              <div className="font-mono-num text-[40px] font-medium tracking-[-0.01em] text-text-primary">{best.pair}</div>
              <div className="text-[14px] text-text-muted">{tr(locale, `medium OI, deep enough for ${formatUsd(notionalUsd, { decimals: 0 })} a side`, `средний OI, хватает глубины на ${formatUsd(notionalUsd, { decimals: 0 })} на сторону`)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-5">
              <div className="flex flex-col gap-2.5 rounded-[14px] border border-positive/25 p-4" style={{ background: "color-mix(in srgb, var(--positive) 6%, transparent)" }}>
                <div className="font-mono-num text-[10px] tracking-[0.14em] text-positive">LONG</div>
                <div className="flex items-center gap-2.5">
                  <ProtocolMark slug="variational" name="Variational" size={26} radius={8} />
                  <div className="text-[16px] font-semibold text-text-primary">Variational</div>
                </div>
                <div className="font-mono-num text-[12px] text-text-muted">{bestOrders.entry.split(" / ")[0]} {tr(locale, "in", "вход")} · {bestOrders.exit.split(" / ")[0]} {tr(locale, "out", "выход")}</div>
              </div>
              <div className="flex flex-col gap-2.5 rounded-[14px] border border-negative/25 p-4" style={{ background: "color-mix(in srgb, var(--negative) 6%, transparent)" }}>
                <div className="font-mono-num text-[10px] tracking-[0.14em] text-negative">SHORT</div>
                <div className="flex items-center gap-2.5">
                  <ProtocolMark slug="variational" name={hedgeName} size={26} radius={8} />
                  <div className="text-[16px] font-semibold text-text-primary">{hedgeName}</div>
                </div>
                <div className="font-mono-num text-[12px] text-text-muted">{bestOrders.entry.split(" / ")[1]} {tr(locale, "in", "вход")} · {bestOrders.exit.split(" / ")[1]} {tr(locale, "out", "выход")}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
              {[
                [tr(locale, "Volume per account", "Объём на аккаунт"), formatUsd(data.accountVolumeUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Full hedge cycle", "Полный цикл"), formatUsd(data.totalCycleVolumeUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Estimated cycle cost", "Оценка стоимости цикла"), formatUsd(best.cycleCostUsd), "text-positive"],
                [tr(locale, "Hold", "Удержание"), "12–24h", "text-text-primary"],
              ].map(([k, v, cls]) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className="text-[11px] text-text-muted">{k}</div>
                  <div className={`font-mono-num text-[17px] ${cls}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl px-3.5 py-3 text-[13px] leading-[1.6] text-text-muted" style={{ background: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}>
              {tr(
                locale,
                "Tip: when you close a leg by MARKET, set a take-profit one cent above/below the current price — the system reads you as an organic trader rather than a farmer and adds a point.",
                "Совет: закрывая ногу по MARKET, ставьте take-profit на один цент выше/ниже текущей цены — система засчитает вас как органического трейдера, а не фармера, и добавит балл.",
              )}
            </div>
          </div>
          <div className="border-t border-border lg:border-l lg:border-t-0" style={{ background: "linear-gradient(180deg, #10162a, #0a0e18)" }}>
            <RouteMap mode="result" pair={best.pair} longLabel="Variational" shortLabel={hedgeName} height={360} />
          </div>
        </div>
      </div>

      {/* 10 cheapest pairs */}
      <div className="pt-11">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
          <div>
            <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, `${top.length} cheapest eligible pairs`, `${top.length} самых дешёвых пар`)}</h2>
            <div className="text-[14px] text-text-muted">{tr(locale, `Sorted by full hedge-cycle cost for ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} per account. Click a row for the breakdown.`, `Отсортировано по стоимости полного цикла для ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} на аккаунт. Нажмите строку для деталей.`)}</div>
          </div>
          <div className="font-mono-num text-[12px] text-text-dim">{tr(locale, "snapshot", "снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</div>
        </div>

        <div className="overflow-x-auto rounded-[18px] border border-border bg-bg">
          <div className="min-w-[900px]">
            <div className={`grid ${GRID} items-center gap-3 border-b border-border bg-surface-1 px-[18px] py-3 text-[11px] text-text-dim`}>
              <div>#</div>
              <div>{tr(locale, "Pair", "Пара")}</div>
              <div>{tr(locale, "Open interest", "Открытый интерес")}</div>
              <div>{tr(locale, "LONG protocol", "LONG протокол")}</div>
              <div>{tr(locale, "SHORT protocol", "SHORT протокол")}</div>
              <div>{tr(locale, "Entry orders", "Вход")}</div>
              <div>{tr(locale, "Exit orders", "Выход")}</div>
              <div className="text-right">{tr(locale, "Cycle cost", "Стоимость")}</div>
              <div />
            </div>
            {top.map((p, i) => {
              const o = orders(p.firstLimitSide);
              const open = expanded === p.pair;
              const limitLongFirst = p.firstLimitSide === "long";
              return (
                <div key={p.pair} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : p.pair)}
                    aria-expanded={open}
                    className={`pf-transition grid ${GRID} w-full items-center gap-3 px-[18px] py-3.5 text-left hover:bg-surface-1 ${open ? "bg-surface-1" : ""}`}
                  >
                    <div className="font-mono-num text-[13px] text-text-dim">{String(i + 1).padStart(2, "0")}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-num text-[16px] font-medium text-text-primary">{p.pair}</span>
                      {p.competitionEligible && (
                        <span title="Competition eligible" className="rounded-[5px] border border-positive/30 px-1.5 py-0.5 font-mono-num text-[9px] text-positive">CE</span>
                      )}
                    </div>
                    <div className="font-mono-num text-[13px] text-text-muted">{compactUsd(p.openInterestUsd)}</div>
                    <div className="flex items-center gap-2">
                      <ProtocolMark slug="variational" name="Variational" size={22} radius={7} />
                      <span className="text-[13px] text-text-primary">Variational</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProtocolMark slug="variational" name={hedgeName} size={22} radius={7} />
                      <span className="text-[13px] text-text-primary">{hedgeName}</span>
                    </div>
                    <div className="font-mono-num text-[12px] text-text-muted">{o.entry}</div>
                    <div className="font-mono-num text-[12px] text-text-muted">{o.exit}</div>
                    <div className={`text-right font-mono-num text-[16px] ${i === 0 ? "text-positive" : "text-text-primary"}`}>{formatUsd(p.cycleCostUsd)}</div>
                    <div className="text-right text-[11px] text-text-dim">{open ? "▲" : "▼"}</div>
                  </button>
                  {open && (
                    <div className="border-t border-border px-[18px] py-4" style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
                      {p.competitionEligible && (
                        <div className="pb-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                            <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                            {tr(locale, "Competition eligible", "Eligible для конкурса")}
                          </span>
                        </div>
                      )}
                      <div className="pb-3 text-[11px] uppercase tracking-[0.1em] text-text-dim">{tr(locale, "Cost breakdown", "Разбор стоимости")} · {p.pair}</div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {(
                          [
                            [tr(locale, "LONG entry", "LONG вход"), limitLongFirst ? "LIMIT" : "MARKET", limitLongFirst ? 0 : p.cycleCostUsd / 2],
                            [tr(locale, "LONG exit", "LONG выход"), limitLongFirst ? "MARKET" : "LIMIT", limitLongFirst ? p.cycleCostUsd / 2 : 0],
                            [tr(locale, "SHORT entry", "SHORT вход"), limitLongFirst ? "MARKET" : "LIMIT", limitLongFirst ? p.cycleCostUsd / 2 : 0],
                            [tr(locale, "SHORT exit", "SHORT выход"), limitLongFirst ? "LIMIT" : "MARKET", limitLongFirst ? 0 : p.cycleCostUsd / 2],
                            [tr(locale, "Spread", "Спред"), "", p.spreadCostUsd],
                            [tr(locale, "Slippage", "Проскальзывание"), "", p.slippageCostUsd],
                            [tr(locale, "Funding 12–24h", "Фандинг 12–24ч"), "", 0],
                            [tr(locale, "Fees", "Комиссии"), "", 0],
                          ] as [string, string, number][]
                        ).map(([k, t, v]) => (
                          <div key={k} className="flex items-baseline justify-between gap-2.5 rounded-[10px] bg-surface-1 px-3 py-2.5">
                            <span className="flex items-baseline gap-1.5">
                              <span className="text-[12px] text-text-muted">{k}</span>
                              {t && <span className="font-mono-num text-[10px] text-text-dim">{t}</span>}
                            </span>
                            <span className="font-mono-num text-[13px] text-text-primary">{formatUsd(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3.5 text-[13px] text-text-muted">
                        <span>{tr(locale, "Full cost per account", "Полная стоимость на аккаунт")} <span className="font-mono-num text-text-primary">{formatUsd(p.cycleCostUsd / 2)}</span></span>
                        <span>{tr(locale, "Combined hedge-cycle cost", "Полная стоимость хедж-цикла")} <span className="font-mono-num text-positive">{formatUsd(p.cycleCostUsd)}</span></span>
                        <span>{tr(locale, "Two MARKET legs pay; two LIMIT legs are free.", "Платят две MARKET-ноги; две LIMIT-ноги бесплатны.")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
