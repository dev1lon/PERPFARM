"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import { tr, useLocale, type Locale } from "@/components/LocaleProvider";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { RouteMap } from "@/components/v2/RouteMap";
import { InfoTip } from "@/components/v2/InfoTip";
import { CrossPairRankings } from "@/components/CrossPairRankings";
import type { VenueSummary } from "@/lib/types";

type CostTier = "low" | "medium" | "high";
export interface PairRanking {
  pair: string;
  openInterestUsd: number;
  volume24hUsd: number;
  competitionEligible: boolean;
  firstLimitSide: "long" | "short";
  cycleCostUsd: number;
  latestCycleCostUsd: number;
  costRangeLowUsd: number;
  costRangeHighUsd: number;
  spreadCostUsd: number;
  slippageCostUsd: number;
  costTier: CostTier;
  fundingUsd?: number | null;
  feeCostUsd?: number;
  entryOrders?: string;
  exitOrders?: string;
}
type BandKey = "high" | "medium" | "low" | "all";
interface Band {
  key: BandKey;
  pairs: PairRanking[];
}
export interface RankingResponse {
  asOf: string;
  fillNotionalUsd: number;
  accountVolumeUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  minVolumeUsd: number;
  minOpenInterestUsd: number;
  competition: { active: boolean; name: string };
  /** Per-protocol live-feed status; a false `live` means the ranking fell back
   *  to saved snapshots for that protocol. */
  sources?: { venue: string; live: boolean }[];
  grouped: boolean;
  bands: Band[];
}

/** Names the protocols whose live feed is down, so the warning can be specific. */
function StaleDataNotice({ data }: { data: RankingResponse }) {
  const locale = useLocale();
  const down = (data.sources ?? []).filter((s) => !s.live).map((s) => s.venue);
  if (down.length === 0) return null;
  const names = down.join(", ");
  return (
    <div className="mt-5 flex gap-3.5 rounded-[14px] border border-warning/40 bg-warning/[0.07] px-4 py-3.5">
      <span className="mt-0.5 flex-none font-mono-num text-[13px] text-warning">!</span>
      <div className="text-[13px] leading-[1.6] text-text-primary">
        <span className="font-semibold">
          {tr(locale, `${names}: live quotes unavailable`, `${names}: живые котировки недоступны`)}
        </span>{" "}
        <span className="text-text-muted">
          {tr(
            locale,
            `The protocol's public API did not respond, so these numbers come from the last saved snapshots (${new Date(data.asOf).toLocaleString("en-US")}) — not live prices.`,
            `Публичный API протокола не ответил, поэтому цифры взяты из последних сохранённых снимков (${new Date(data.asOf).toLocaleString("ru-RU")}) — это не живые котировки.`,
          )}
        </span>
      </div>
    </div>
  );
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

const GRID = "grid-cols-[40px_130px_104px_minmax(110px,1fr)_minmax(110px,1fr)_110px_110px_104px_28px]";

const COST_TIER_TONE: Record<CostTier, string> = {
  low: "border-positive/30 bg-positive/10 text-positive",
  medium: "border-warning/30 bg-warning/10 text-warning",
  high: "border-negative/30 bg-negative/10 text-negative",
};
const COST_TIER_DOT: Record<CostTier, string> = { low: "bg-positive", medium: "bg-warning", high: "bg-negative" };
function costTierLabel(locale: Locale, tier: CostTier): string {
  return tier === "low"
    ? tr(locale, "Low execution cost", "Низкая стоимость исполнения")
    : tier === "medium"
      ? tr(locale, "Medium execution cost", "Средняя стоимость исполнения")
      : tr(locale, "High execution cost", "Высокая стоимость исполнения");
}
function CostTierBadge({ costTier }: { costTier: CostTier }) {
  const locale = useLocale();
  return (
    <span title={tr(locale, "Based on 24h spread and quote-impact data; this is not a liquidation-risk score.", "На основе 24ч спреда и quote impact; это не оценка риска ликвидации.")} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${COST_TIER_TONE[costTier]}`}>
      <span className={`h-[5px] w-[5px] rounded-full ${COST_TIER_DOT[costTier]}`} />
      {costTierLabel(locale, costTier)}
    </span>
  );
}

/** One text per concept, shared by the recommended route and the table row. */
function fundingTip(locale: Locale): string {
  return tr(
    locale,
    "What a 12-hour hold pays or earns, from the difference between the two protocols' funding rates, averaged over the last 24h. It can be a charge or a credit, it drifts while the position is open, and it is not part of the cycle cost.",
    "Сколько принесёт или будет стоить удержание 12 часов — из разницы ставок фандинга двух площадок, усреднённой за последние 24ч. Может быть как расходом, так и доходом, меняется в течение удержания и не входит в стоимость цикла.",
  );
}
function feeTip(locale: Locale): string {
  return tr(
    locale,
    "Priced at the fee a new account pays after the 5% referral discount. Above VIP 0 the fees are lower.",
    "Считается по комиссии нового аккаунта со скидкой 5% за регистрацию по рефералу. Выше VIP 0 комиссии ниже.",
  );
}

/**
 * One line of the cost breakdown. The same tile is used in the recommended
 * route and in an expanded table row, so the headline route is itemised
 * exactly like the row a user opens to check it.
 *
 * `signed` marks a value that can legitimately go either way (funding): it
 * gets an explicit "+" so a credit is not misread as a cost.
 */
function CostTile({ label, value, tip, signed = false }: { label: string; value: number | null; tip?: string; signed?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 rounded-[10px] bg-surface-1 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </span>
      <span className={`font-mono-num text-[13px] ${value !== null && value < 0 ? "text-positive" : "text-text-primary"}`}>
        {signed && value !== null && value > 0 ? "+" : ""}
        {formatUsd(value)}
      </span>
    </div>
  );
}

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

export function ProtocolCalculatorV2({
  otherVenues,
  venueSlug = "variational",
}: {
  otherVenues: VenueSummary[];
  venueSlug?: "variational" | "txflow";
}) {
  const locale = useLocale();
  const homeName = venueSlug === "txflow" ? "TxFlow" : "Variational";
  const allHedgeOptions = [
    { slug: "variational", name: "Variational" },
    { slug: "txflow", name: "TxFlow" },
    ...otherVenues.map((v) => ({ slug: v.slug, name: v.name })),
  ].filter((option, index, items) => items.findIndex((item) => item.slug === option.slug) === index);
  // Always expose Variational and TxFlow to each other. The main venue stays
  // first, then the cross-venue hedge, then any later supported venues.
  const hedgeOptions = [...allHedgeOptions].sort((a, b) => (a.slug === venueSlug ? -1 : b.slug === venueSlug ? 1 : 0));

  const [hedge, setHedge] = useState<string>(venueSlug);
  const [accountVolumeInput, setAccountVolumeInput] = useState("20000");
  const [tradfiOnly, setTradfiOnly] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [notionalUsd, setNotionalUsd] = useState<number | null>(null);
  const [ranHedge, setRanHedge] = useState<string>(venueSlug);
  const [appliedTradfiOnly, setAppliedTradfiOnly] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<RankingResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [oiFilter, setOiFilter] = useState<BandKey>("all");
  const timer = useRef<number | null>(null);

  const requested = Number(accountVolumeInput);
  const validVolume = Number.isFinite(requested) && requested >= 1_000 && requested <= 200_000;
  const hedgeName = hedgeOptions.find((o) => o.slug === hedge)?.name ?? hedge;
  const isTxFlow = venueSlug === "txflow";

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // Same-venue run pulls the live pair-rankings; cross uses CrossPairRankings.
  useEffect(() => {
    if (status !== "loaded" || notionalUsd == null || ranHedge !== venueSlug) return;
    let active = true;
    fetch(`/api/venues/${venueSlug}/pair-rankings?accountVolumeUsd=${notionalUsd}&tradfiOnly=${appliedTradfiOnly}`)
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<RankingResponse>;
        const payload = await r.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "failed");
      })
      .then((d) => active && setData(d))
      .catch((error: unknown) => {
        if (!active) return;
        setData(null);
        setErrorMessage(
          error instanceof Error && error.message !== "failed"
            ? error.message
            : tr(locale, "Couldn’t calculate the route right now. Try again.", "Сейчас не удалось рассчитать маршрут. Попробуйте ещё раз."),
        );
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [status, notionalUsd, appliedTradfiOnly, ranHedge, locale, venueSlug]);

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
  const bands = data?.bands ?? [];
  const grouped = data?.grouped ?? false;
  const bandPairs = (key: BandKey) => bands.find((b) => b.key === key)?.pairs ?? [];
  const flatPairs = bands.flatMap((b) => b.pairs);
  // Table: the selected OI band (or all), cheapest-first, top 10.
  const tablePairs = [...(oiFilter === "all" || !grouped ? flatPairs : bandPairs(oiFilter))]
    .sort((a, b) => a.cycleCostUsd - b.cycleCostUsd)
    .slice(0, 10);
  // `Hedge with` defines the route; this picks the pair inside it.
  //
  // NOT simply the global cheapest. The site's own guidance is Medium OI (fewer
  // farmers splitting the same emission) on a TradFi market, so the headline
  // recommendation has to follow that advice rather than contradict it one
  // panel below. Cost decides only WITHIN that preference, and each fallback
  // is announced in `bestRule` so the card never silently drops a criterion.
  const cheapestOf = (pairs: PairRanking[]) => [...pairs].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd)[0];
  const mediumPairs = grouped ? bandPairs("medium") : [];
  const bestPick: [PairRanking | undefined, "medium-tradfi" | "medium" | "tradfi" | "cheapest"] =
    cheapestOf(mediumPairs.filter((p) => p.competitionEligible)) !== undefined
      ? [cheapestOf(mediumPairs.filter((p) => p.competitionEligible)), "medium-tradfi"]
      : cheapestOf(mediumPairs) !== undefined
        ? [cheapestOf(mediumPairs), "medium"]
        : cheapestOf(flatPairs.filter((p) => p.competitionEligible)) !== undefined
          ? [cheapestOf(flatPairs.filter((p) => p.competitionEligible)), "tradfi"]
          : [cheapestOf(flatPairs), "cheapest"];
  const [best, bestRule] = bestPick;

  return (
    <div className="mt-10">
      {/* calculator bar */}
      <div className="rounded-[20px] border border-border bg-surface-1 px-7 py-6">
        <div className="grid items-end gap-5 lg:grid-cols-[1fr_1fr_1fr_132px]">
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{isTxFlow ? tr(locale, "Trade on", "Торгуем на") : tr(locale, "Farm points on", "Фармим поинты на")}</div>
            <div className="flex h-[50px] items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3.5">
              <ProtocolMark slug={venueSlug} name={homeName} size={26} radius={8} />
              <span className="text-[15px] font-semibold text-text-primary">{homeName}</span>
              <span className="ml-auto font-mono-num text-[10px] tracking-[0.08em] text-accent">SELECTED</span>
            </div>
          </div>
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{tr(locale, "Hedge with", "Хедж с")}</div>
            <HedgeDropdown options={hedgeOptions} value={hedge} onChange={setHedge} />
          </div>
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{tr(locale, "Volume per account", "Объём на аккаунт")}</div>
            <div className={`pf-transition flex h-[50px] items-center gap-2 rounded-xl border bg-surface-2 px-3.5 focus-within:border-accent/50 ${validVolume ? "border-border" : "border-negative/50"}`}>
              <span className="font-mono-num text-[15px] text-text-dim">$</span>
              <input
                type="number"
                inputMode="numeric"
                min="1000"
                max="200000"
                step="1000"
                aria-label={tr(locale, "Volume per account in USDC", "Объём на аккаунт в USDC")}
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
              <span className="mr-1.5">{tr(locale, `2 fills of ${formatUsd((validVolume ? requested : 0) / 2, { decimals: 0 })} per account · Full hedge cycle:`, `2 филла по ${formatUsd((validVolume ? requested : 0) / 2, { decimals: 0 })} на аккаунт · Полный хедж-цикл:`)}</span>
              <span className="font-mono-num text-text-primary">{formatUsd((validVolume ? requested : 0) * 2, { decimals: 0 })}</span>{" "}
              {tr(locale, "across two accounts.", "на два аккаунта.")}
            </div>
            {(
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
      {/* The scan bar stays up until the pairs are actually on screen — the
          fetch continues after the scan animation, and a gap here reads as an
          empty result. */}
      {(status === "running" || (status === "loaded" && ranHedge === venueSlug && !data)) && (
        <div className="mt-5 flex flex-col items-center gap-4 rounded-[20px] border border-accent/25 bg-bg px-8 py-14">
          <div className="h-0.5 w-52 overflow-hidden rounded bg-white/10">
            <div className="pf-scan h-full w-1/3 bg-accent" />
          </div>
          <div className="font-mono-num text-[13px] text-accent">
            {status === "running"
              ? tr(locale, "Scanning eligible markets…", "Сканируем eligible-рынки…")
              : tr(locale, "Pricing the cheapest routes…", "Считаем самые дешёвые маршруты…")}
          </div>
        </div>
      )}

      {status === "loaded" && notionalUsd !== null && ranHedge === venueSlug && data && (
        <RouteResults
          data={data}
          top={tablePairs}
          best={best}
          bestRule={bestRule}
          notionalUsd={notionalUsd}
          hedgeName={homeName}
          homeSlug={venueSlug}
          homeName={homeName}
          isTxFlow={isTxFlow}
          expanded={expanded}
          setExpanded={setExpanded}
          grouped={grouped}
          oiFilter={oiFilter}
          setOiFilter={setOiFilter}
        />
      )}

      {status === "loaded" && notionalUsd !== null && ranHedge !== venueSlug && (
        <div className="pf-rise mt-5">
          <CrossPairRankings
            key={`${ranHedge}-${notionalUsd}`}
            venueSlug={venueSlug}
            hedgeSlug={ranHedge}
            homeName={homeName}
            hedgeName={hedgeName}
            accountVolumeUsd={notionalUsd}
            tradfiOnly={appliedTradfiOnly}
          />
        </div>
      )}
    </div>
  );
}

/** Which criteria actually selected the recommended pair. */
export type BestRule = "medium-tradfi" | "medium" | "tradfi" | "cheapest";

export function RouteResults({
  data,
  top,
  best,
  bestRule = "cheapest",
  notionalUsd,
  hedgeName,
  homeSlug,
  hedgeSlug,
  homeName,
  isTxFlow,
  expanded,
  setExpanded,
  grouped,
  oiFilter,
  setOiFilter,
}: {
  data: RankingResponse | null;
  top: PairRanking[];
  best: PairRanking | undefined;
  bestRule?: BestRule;
  notionalUsd: number;
  hedgeName: string;
  homeSlug: "variational" | "txflow";
  hedgeSlug?: "variational" | "txflow";
  homeName: string;
  isTxFlow: boolean;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  grouped: boolean;
  oiFilter: BandKey;
  setOiFilter: (v: BandKey) => void;
}) {
  const locale = useLocale();
  const shortSlug = hedgeSlug ?? homeSlug;
  // Switching band changes the list length, which would otherwise slide the
  // page under the finger. Anchor the filter row: remember where it sat, then
  // scroll by the delta after the new list renders.
  const filterRowRef = useRef<HTMLDivElement>(null);
  const anchorTop = useRef<number | null>(null);
  const changeFilter = (k: BandKey) => {
    anchorTop.current = filterRowRef.current?.getBoundingClientRect().top ?? null;
    setExpanded(null); // a row expanded in another band must not stay open here
    setOiFilter(k);
  };
  useLayoutEffect(() => {
    if (anchorTop.current === null) return;
    const next = filterRowRef.current?.getBoundingClientRect().top;
    if (next !== undefined) window.scrollBy(0, next - anchorTop.current);
    anchorTop.current = null;
  }, [oiFilter]);

  if (!data || !best) {
    return <div className="pf-skeleton mt-5 h-80 rounded-[20px] border border-border bg-surface-1" />;
  }
  // Eligibility only means something while a competition is running — once it
  // ends the flag would claim a benefit that no longer exists.
  const showEligible = data.competition.active;
  const bestOrders = best.entryOrders && best.exitOrders ? { entry: best.entryOrders, exit: best.exitOrders } : orders(best.firstLimitSide);
  const isCross = best.fundingUsd !== undefined;
  // Only the Variational same-protocol path stores 24h of snapshots and can
  // quote a median and a percentile range. The other two price one live book,
  // so any label promising history has to change with them.
  const hasCostHistory = !isTxFlow && !isCross;
  return (
    <>
      <StaleDataNotice data={data} />

      {/* recommended route */}
      <div className="pf-rise mt-5 overflow-hidden rounded-[20px] border border-accent/30" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--accent) 11%, transparent), var(--surface-1) 62%)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-full font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent sm:w-auto">{tr(locale, "Recommended route", "Рекомендованный маршрут")}</div>
            <CostTierBadge costTier={best.costTier} />
            {best.competitionEligible && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                TradFi
              </span>
            )}
            {showEligible && best.competitionEligible && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
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
              {/* State the rule that picked this pair. It used to claim
                  "medium OI" regardless of which band the pair came from. */}
              <div className="text-[14px] text-text-muted">
                {bestRule === "medium-tradfi"
                  ? tr(locale, `cheapest Medium-OI TradFi pair · ${formatUsd(notionalUsd, { decimals: 0 })} a side`, `самая дешёвая TradFi-пара со средним OI · ${formatUsd(notionalUsd, { decimals: 0 })} на сторону`)
                  : bestRule === "medium"
                    ? tr(locale, `cheapest Medium-OI pair — no TradFi market in that band · ${formatUsd(notionalUsd, { decimals: 0 })} a side`, `самая дешёвая пара со средним OI — TradFi в этом бэнде нет · ${formatUsd(notionalUsd, { decimals: 0 })} на сторону`)
                    : bestRule === "tradfi"
                      ? tr(locale, `cheapest TradFi pair — no Medium-OI market available · ${formatUsd(notionalUsd, { decimals: 0 })} a side`, `самая дешёвая TradFi-пара — среднего OI сейчас нет · ${formatUsd(notionalUsd, { decimals: 0 })} на сторону`)
                      : tr(locale, `cheapest available pair · ${formatUsd(notionalUsd, { decimals: 0 })} a side`, `самая дешёвая доступная пара · ${formatUsd(notionalUsd, { decimals: 0 })} на сторону`)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-5">
              <div className="flex flex-col gap-2.5 rounded-[14px] border border-positive/25 p-4" style={{ background: "color-mix(in srgb, var(--positive) 6%, transparent)" }}>
                <div className="font-mono-num text-[10px] tracking-[0.14em] text-positive">LONG</div>
                <div className="flex items-center gap-2.5">
                  <ProtocolMark slug={homeSlug} name={homeName} size={26} radius={8} />
                  <div className="text-[16px] font-semibold text-text-primary">{homeName}</div>
                </div>
                <div className="font-mono-num text-[12px] text-text-muted">{bestOrders.entry.split(" / ")[0]} {tr(locale, "in", "вход")} · {bestOrders.exit.split(" / ")[0]} {tr(locale, "out", "выход")}</div>
              </div>
              <div className="flex flex-col gap-2.5 rounded-[14px] border border-negative/25 p-4" style={{ background: "color-mix(in srgb, var(--negative) 6%, transparent)" }}>
                <div className="font-mono-num text-[10px] tracking-[0.14em] text-negative">SHORT</div>
                <div className="flex items-center gap-2.5">
                  <ProtocolMark slug={shortSlug} name={hedgeName} size={26} radius={8} />
                  <div className="text-[16px] font-semibold text-text-primary">{hedgeName}</div>
                </div>
                <div className="font-mono-num text-[12px] text-text-muted">{bestOrders.entry.split(" / ")[1]} {tr(locale, "in", "вход")} · {bestOrders.exit.split(" / ")[1]} {tr(locale, "out", "выход")}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4 lg:grid-cols-4">
              {([
                [tr(locale, "Position per leg", "Позиция на ногу"), formatUsd(data.fillNotionalUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Volume per account", "Объём на аккаунт"), formatUsd(data.accountVolumeUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Full hedge cycle", "Полный цикл"), formatUsd(data.totalCycleVolumeUsd, { decimals: 0 }), "text-text-primary"],
                [
                  tr(locale, isCross ? "Estimated execution cost" : isTxFlow ? "Estimated live cost" : "Estimated cost · 24h median", isCross ? "Оценка стоимости исполнения" : isTxFlow ? "Оценка live-стоимости" : "Оценка · медиана 24ч"),
                  formatUsd(best.cycleCostUsd),
                  "text-positive",
                  isCross ? tr(locale, "Fees + spread + impact; funding shown separately", "Комиссии + спред + impact; funding отдельно") : isTxFlow ? tr(locale, "Current L2 book snapshot", "Текущий снимок L2-стакана") : tr(locale, `24h range ${formatUsd(best.costRangeLowUsd)}–${formatUsd(best.costRangeHighUsd)}`, `Диапазон за 24ч ${formatUsd(best.costRangeLowUsd)}–${formatUsd(best.costRangeHighUsd)}`),
                ],
              ] as Array<[string, string, string, string?]>).map(([k, v, cls, detail]) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className="whitespace-nowrap text-[11px] text-text-muted">{k}</div>
                  <div className={`font-mono-num text-[17px] ${cls}`}>{v}</div>
                  {detail && <div className="font-mono-num text-[11px] text-text-muted">{detail}</div>}
                </div>
              ))}
            </div>
            {/* Itemised exactly like an expanded table row, so checking the
                headline recommendation never requires opening another panel. */}
            <div className="grid grid-cols-2 gap-2.5 pt-4 sm:grid-cols-4">
              <CostTile label={tr(locale, "Spread", "Спред")} value={best.spreadCostUsd} />
              <CostTile label={tr(locale, "Slippage", "Проскальзывание")} value={best.slippageCostUsd} />
              <CostTile
                label={tr(locale, "Funding · 12h", "Фандинг · 12ч")}
                value={isCross ? best.fundingUsd ?? null : 0}
                signed
                tip={fundingTip(locale)}
              />
              <CostTile
                label={tr(locale, "Fees", "Комиссии")}
                value={best.feeCostUsd ?? 0}
                tip={(best.feeCostUsd ?? 0) > 0 ? feeTip(locale) : undefined}
              />
            </div>
            <div className="mt-5 rounded-xl px-3.5 py-3 text-[13px] leading-[1.6] text-text-muted" style={{ background: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}>
              {tr(
                locale,
                isCross ? "Execution cost includes fees on both protocols, spread and quote impact. Funding is shown separately for a 12-hour hold and does not change the route ranking." : "Tip: when you close a leg by MARKET, set a take-profit one cent above/below the current price — the system is more likely to treat you as an organic trader, which can lead to more points.",
                isCross ? "Стоимость исполнения включает комиссии обеих площадок, спред и impact. Funding показан отдельно за 12 часов и не влияет на ранжирование маршрута." : "Совет: закрывая ногу по MARKET, ставьте take-profit на один цент выше/ниже текущей цены — система с большей вероятностью отнесётся к вам как к органичному трейдеру, что может дать больше поинтов.",
              )}
            </div>
          </div>
          {/* The 3D route is decorative; phones skip it to save space + battery. */}
          <div className="hidden border-t border-border lg:block lg:border-l lg:border-t-0" style={{ background: "linear-gradient(180deg, #10162a, #0a0e18)" }}>
            <RouteMap mode="result" pair={best.pair} longLabel={homeName} shortLabel={hedgeName} height={360} />
          </div>
        </div>
      </div>

      {/* 10 cheapest pairs */}
      <div className="pt-11">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
          <div>
            <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, `${top.length} cheapest pairs`, `${top.length} самых дешёвых пар`)}</h2>
            <div className="text-[14px] text-text-muted">{hasCostHistory ? tr(locale, `Sorted by 24h median full-cycle cost for ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} per account. Click a row for the breakdown.`, `Отсортировано по медианной за 24ч стоимости полного цикла для ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} на аккаунт. Нажмите строку для деталей.`) : tr(locale, `Sorted by current full-cycle cost for ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} per account. Click a row for the breakdown.`, `Отсортировано по текущей стоимости полного цикла для ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} на аккаунт. Нажмите строку для деталей.`)}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {grouped && (
              <div ref={filterRowRef} className="flex gap-0.5 rounded-[10px] border border-border bg-bg p-[3px]">
                {(["all", "high", "medium", "low"] as BandKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => changeFilter(k)}
                    className={`pf-transition rounded-[7px] px-3 py-1.5 text-[12px] font-semibold ${oiFilter === k ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                  >
                    {k === "all" ? tr(locale, "All", "Все") : k === "high" ? "High OI" : k === "medium" ? "Medium OI" : "Low OI"}
                  </button>
                ))}
              </div>
            )}
            <div className="font-mono-num text-[12px] text-text-dim">{tr(locale, "Market data updated", "Данные обновлены")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</div>
          </div>
        </div>

        <div className="rounded-[18px] border border-border bg-bg lg:overflow-x-auto">
          <div className="lg:min-w-[900px]">
            {/* Column headers belong to the wide table only. */}
            <div className={`hidden lg:grid ${GRID} items-center gap-3 border-b border-border bg-surface-1 px-[18px] py-3 text-[11px] text-text-dim`}>
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
              const o = p.entryOrders && p.exitOrders ? { entry: p.entryOrders, exit: p.exitOrders } : orders(p.firstLimitSide);
              const open = expanded === p.pair;
              return (
                <div key={p.pair} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : p.pair)}
                    aria-expanded={open}
                    className={`pf-transition w-full text-left hover:bg-surface-1 ${open ? "bg-surface-1" : ""}`}
                  >
                    {/* Wide layout: one row per pair. */}
                    <div className={`hidden lg:grid ${GRID} items-center gap-3 px-[18px] py-3.5`}>
                      <div className="font-mono-num text-[13px] text-text-dim">{String(i + 1).padStart(2, "0")}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-num text-[16px] font-medium text-text-primary">{p.pair}</span>
                        <span title={costTierLabel(locale, p.costTier)} className={`h-1.5 w-1.5 shrink-0 rounded-full ${COST_TIER_DOT[p.costTier]}`} />
                        {p.competitionEligible && (
                          <span
                            title={tr(locale, "TradFi market — cheaper to execute and pays more points", "TradFi рынок — дешевле в исполнении и даёт больше поинтов")}
                            className="rounded-[5px] border border-positive/30 px-1.5 py-0.5 font-mono-num text-[9px] text-positive"
                          >
                            TradFi
                          </span>
                        )}
                        {showEligible && p.competitionEligible && (
                          <span title="Competition eligible" className="rounded-[5px] border border-accent/40 px-1.5 py-0.5 font-mono-num text-[9px] text-accent">CE</span>
                        )}
                      </div>
                      <div className="font-mono-num text-[13px] text-text-muted">{compactUsd(p.openInterestUsd)}</div>
                      <div className="flex items-center gap-2">
                        <ProtocolMark slug={homeSlug} name={homeName} size={22} radius={7} />
                        <span className="text-[13px] text-text-primary">{homeName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProtocolMark slug={shortSlug} name={hedgeName} size={22} radius={7} />
                        <span className="text-[13px] text-text-primary">{hedgeName}</span>
                      </div>
                      <div className="font-mono-num text-[12px] text-text-muted">{o.entry}</div>
                      <div className="font-mono-num text-[12px] text-text-muted">{o.exit}</div>
                      <div className={`text-right font-mono-num text-[16px] ${i === 0 ? "text-positive" : "text-text-primary"}`}>{formatUsd(p.cycleCostUsd)}</div>
                      <div className="text-right text-[11px] text-text-dim">{open ? "▲" : "▼"}</div>
                    </div>

                    {/* Phone layout: a two-line card, no sideways scrolling. */}
                    <div className="flex flex-col gap-1 px-4 py-3 lg:hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-[12px] text-text-dim">{String(i + 1).padStart(2, "0")}</span>
                        <span className="font-mono-num text-[16px] font-medium text-text-primary">{p.pair}</span>
                        <span title={costTierLabel(locale, p.costTier)} className={`h-1.5 w-1.5 shrink-0 rounded-full ${COST_TIER_DOT[p.costTier]}`} />
                        {showEligible && p.competitionEligible && (
                          <span className="rounded-[5px] border border-positive/30 px-1.5 py-0.5 font-mono-num text-[9px] text-positive">CE</span>
                        )}
                        <span className={`ml-auto font-mono-num text-[16px] ${i === 0 ? "text-positive" : "text-text-primary"}`}>{formatUsd(p.cycleCostUsd)}</span>
                        <span className="text-[11px] text-text-dim">{open ? "▲" : "▼"}</span>
                      </div>
                      {/* One line, never wrapping: a long OI ($403.5M) used to
                          break the order labels mid-word and give rows uneven
                          heights. Slashes lose their padding to fit. */}
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap pl-[26px] font-mono-num text-[10px] text-text-muted">
                        OI {compactUsd(p.openInterestUsd)}
                        <span className="text-text-dim"> · </span>
                        {o.entry.replace(/ \/ /g, "/")}
                        <span className="text-text-dim"> → </span>
                        {o.exit.replace(/ \/ /g, "/")}
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-border px-[18px] py-4" style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
                      <div className="flex flex-wrap items-center gap-2 pb-3.5">
                        <CostTierBadge costTier={p.costTier} />
                        {showEligible && p.competitionEligible && (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                            <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                            {tr(locale, "Competition eligible", "Eligible для конкурса")}
                          </span>
                        )}
                      </div>
                      {/* LONG / SHORT legs (compact recommended-route view, no 3D) */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-2 rounded-[12px] border border-positive/25 p-3.5" style={{ background: "color-mix(in srgb, var(--positive) 6%, transparent)" }}>
                          <div className="font-mono-num text-[10px] tracking-[0.14em] text-positive">LONG</div>
                          <div className="flex items-center gap-2">
                            <ProtocolMark slug={homeSlug} name={homeName} size={22} radius={7} />
                            <span className="text-[15px] font-semibold text-text-primary">{homeName}</span>
                          </div>
                          <div className="font-mono-num text-[11px] text-text-muted">{o.entry.split(" / ")[0]} {tr(locale, "in", "вход")} · {o.exit.split(" / ")[0]} {tr(locale, "out", "выход")}</div>
                        </div>
                        <div className="flex flex-col gap-2 rounded-[12px] border border-negative/25 p-3.5" style={{ background: "color-mix(in srgb, var(--negative) 6%, transparent)" }}>
                          <div className="font-mono-num text-[10px] tracking-[0.14em] text-negative">SHORT</div>
                          <div className="flex items-center gap-2">
                            <ProtocolMark slug={shortSlug} name={hedgeName} size={22} radius={7} />
                            <span className="text-[15px] font-semibold text-text-primary">{hedgeName}</span>
                          </div>
                          <div className="font-mono-num text-[11px] text-text-muted">{o.entry.split(" / ")[1]} {tr(locale, "in", "вход")} · {o.exit.split(" / ")[1]} {tr(locale, "out", "выход")}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 py-4 lg:grid-cols-6">
                        {(
                          [
                            [tr(locale, "Position per leg", "Позиция на ногу"), formatUsd(data.fillNotionalUsd, { decimals: 0 }), "text-text-primary"],
                            [tr(locale, "Volume per account", "Объём на аккаунт"), formatUsd(data.accountVolumeUsd, { decimals: 0 }), "text-text-primary"],
                            [tr(locale, "Full hedge cycle", "Полный цикл"), formatUsd(data.totalCycleVolumeUsd, { decimals: 0 }), "text-text-primary"],
                            // Only the Variational path has 24h history behind
                            // it. TxFlow and cross routes are priced from one
                            // live book, and assign the same number to all
                            // three fields -- labelling that a "24h median"
                            // with a "$11.43–$11.43 range" invents a history
                            // that was never measured.
                            hasCostHistory
                              ? [tr(locale, "Estimated cost · 24h median", "Оценка · медиана 24ч"), formatUsd(p.cycleCostUsd), "text-positive"]
                              : [tr(locale, "Estimated cost · live book", "Оценка · текущий стакан"), formatUsd(p.cycleCostUsd), "text-positive"],
                            hasCostHistory
                              ? [tr(locale, "24h range", "Диапазон за 24ч"), `${formatUsd(p.costRangeLowUsd)}–${formatUsd(p.costRangeHighUsd)}`, "text-text-muted"]
                              : [tr(locale, "24h range", "Диапазон за 24ч"), tr(locale, "not measured", "не измерялся"), "text-text-dim"],
                            // No "Quoted at" tile: the snapshot time already sits
                            // above the table, and repeating it here read as a
                            // second, different timestamp.
                            ...(hasCostHistory
                              ? [[tr(locale, "Latest sampled cost", "Последняя стоимость по снапшоту"), formatUsd(p.latestCycleCostUsd), "text-text-primary"]]
                              : []),
                          ] as [string, string, string][]
                        ).map(([k, v, cls]) => (
                          <div key={k} className="flex flex-col gap-1">
                            <div className="text-[11px] text-text-muted">{k}</div>
                            <div className={`font-mono-num text-[15px] ${cls}`}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div className="pb-3 text-[11px] uppercase tracking-[0.1em] text-text-dim">{tr(locale, "Cost breakdown", "Разбор стоимости")} · {p.pair}</div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {(
                          [
                            // Real values, not placeholders: on a same-venue
                            // Variational route funding nets to zero and fees
                            // are 0%, but on TxFlow and on cross routes both
                            // are a large part of the total.
                            [tr(locale, "Spread", "Спред"), p.spreadCostUsd, undefined],
                            [tr(locale, "Slippage", "Проскальзывание"), p.slippageCostUsd, undefined],
                            [
                              tr(locale, "Funding · 12h", "Фандинг · 12ч"),
                              // Same-protocol routes hold an equal long and
                              // short on one book, so funding cancels exactly.
                              // That is a measured zero, not missing data.
                              isCross ? p.fundingUsd : 0,
                              fundingTip(locale),
                            ],
                            [tr(locale, "Fees", "Комиссии"), p.feeCostUsd ?? 0, (p.feeCostUsd ?? 0) > 0 ? feeTip(locale) : undefined],
                          ] as [string, number | null, string | undefined][]
                        ).map(([k, v, tip]) => (
                          <CostTile key={k} label={k} value={v} tip={tip} signed={k.startsWith(tr(locale, "Funding", "Фандинг"))} />
                        ))}
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
