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
 * `signed` marks funding. Its stored convention is cost-positive: a positive
 * value is a payment, while a negative value is a credit. The UI reverses
 * that into the familiar −cost / +credit presentation.
 */
function CostTile({ label, value, tip, signed = false }: { label: string; value: number | null; tip?: string; signed?: boolean }) {
  const fundingState = signed && value !== null
    ? value < 0
      ? { amount: `+${formatUsd(Math.abs(value))}`, tone: "text-positive" }
      : value > 0
        ? { amount: `−${formatUsd(value)}`, tone: "text-negative" }
        : { amount: formatUsd(0), tone: "text-text-primary" }
    : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-border/80 bg-surface-2 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-muted">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </span>
      <span className={`shrink-0 whitespace-nowrap font-mono-num text-[13px] ${fundingState?.tone ?? (value !== null && value < 0 ? "text-positive" : "text-text-primary")}`}>
        {fundingState?.amount ?? formatUsd(value)}
      </span>
    </div>
  );
}

/** Compact mobile route diagram. The ticker is already printed immediately
 * above it, so this intentionally contains just the two legs and route. */
function RecommendedRouteDiagram({ longName, shortName }: { longName: string; shortName: string }) {
  return (
    <svg viewBox="0 0 336 120" className="block h-auto w-full" aria-hidden>
      <path d="M56 62 C 112 62, 118 18, 168 18 S 224 62, 280 62" fill="none" stroke="#4d8dff" strokeWidth="2" />
      <circle cx="168" cy="18" r="4" fill="#bcd6ff" />
      <text x="42" y="42" fill="#7ff0c6" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1.4">LONG</text>
      <text x="258" y="42" fill="#f5a3a0" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1.4">SHORT</text>
      <circle cx="56" cy="62" r="11" fill="none" stroke="rgba(53,211,153,0.46)" strokeWidth="1.5" />
      <circle cx="56" cy="62" r="6.5" fill="#35d399" />
      <circle cx="280" cy="62" r="11" fill="none" stroke="rgba(229,100,95,0.46)" strokeWidth="1.5" />
      <circle cx="280" cy="62" r="6.5" fill="#e5645f" />
      <text x="56" y="91" textAnchor="middle" fill="#e8ecf5" fontFamily="Plus Jakarta Sans" fontSize="12" fontWeight="600">{longName}</text>
      <text x="280" y="91" textAnchor="middle" fill="#e8ecf5" fontFamily="Plus Jakarta Sans" fontSize="12" fontWeight="600">{shortName}</text>
    </svg>
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
        <div className="absolute z-30 mt-1.5 flex max-h-64 w-full flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-surface-1 p-1.5 shadow-lg">
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
              className={`pf-transition flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left hover:border-text-muted/35 hover:bg-surface-2 ${o.slug === value ? "border-accent/40 bg-accent/[0.09]" : "border-transparent"}`}
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
  const [crossLoading, setCrossLoading] = useState(false);
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
    setCrossLoading(hedge !== venueSlug);
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
  const [best, bestRule] = selectRecommendedPair(bands, venueSlug);

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
      {(status === "running" || (status === "loaded" && ranHedge === venueSlug && !data) || (status === "loaded" && ranHedge !== venueSlug && crossLoading)) && (
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
          hedgeName={homeName}
          homeSlug={venueSlug}
          homeName={homeName}
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
            suppressLoading
            onLoadingChange={setCrossLoading}
          />
        </div>
      )}
    </div>
  );
}

/** Which criteria actually selected the recommended pair. */
export type BestRule = "medium-tradfi" | "medium" | "tradfi" | "cheapest";

type RecommendationPolicy = { preferMediumOi: boolean; preferTradfi: boolean };

// This is intentionally a protocol-owned policy, not a hedge-venue setting.
// It is kept in code while the requested CMS remains only a future plan.
const RECOMMENDATION_POLICY: Record<"variational" | "txflow", RecommendationPolicy> = {
  variational: { preferMediumOi: true, preferTradfi: true },
  // TxFlow has not announced points mechanics. Its current guidance is
  // therefore eligible trading volume on the venue it focuses on (TradFi),
  // rather than importing Variational's Medium-OI points rule.
  txflow: { preferMediumOi: false, preferTradfi: true },
};

/** Recommended strategy duration. It is independent from Funding · 12h. */
function recommendedHold(homeSlug: "variational" | "txflow", locale: Locale): string {
  return homeSlug === "variational"
    ? tr(locale, "12–24h", "12–24 ч")
    : tr(locale, "2–4h", "2–4 ч");
}

/**
 * The protocol being farmed owns the recommendation policy. `Hedge with`
 * changes available books and costs, never the points strategy of the home
 * page. Both same-venue and cross-venue views call this exact selector.
 */
export function selectRecommendedPair(
  bands: RankingResponse["bands"],
  homeSlug: "variational" | "txflow",
): [PairRanking | undefined, BestRule] {
  const all = bands.flatMap((band) => band.pairs);
  const medium = bands.find((band) => band.key === "medium")?.pairs ?? [];
  const cheapestOf = (pairs: PairRanking[]) => [...pairs].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd)[0];
  const policy = RECOMMENDATION_POLICY[homeSlug];

  // The primary venue, never the hedge, decides this set. Execution cost is a
  // tie-breaker only within that home-venue strategy.
  const preferred = policy.preferMediumOi ? medium : all;
  const preferredTradfi = cheapestOf(preferred.filter((pair) => pair.competitionEligible));
  if (preferredTradfi) return [preferredTradfi, policy.preferMediumOi ? "medium-tradfi" : "tradfi"];
  const preferredAny = cheapestOf(preferred);
  if (preferredAny) return [preferredAny, policy.preferMediumOi ? "medium" : "cheapest"];
  const tradfi = cheapestOf(all.filter((pair) => pair.competitionEligible));
  if (tradfi) return [tradfi, "tradfi"];
  return [cheapestOf(all), "cheapest"];
}

export function RouteResults({
  data,
  top,
  best,
  bestRule = "cheapest",
  hedgeName,
  homeSlug,
  hedgeSlug,
  homeName,
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
  hedgeName: string;
  homeSlug: "variational" | "txflow";
  hedgeSlug?: "variational" | "txflow";
  homeName: string;
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
  const [showAllMobile, setShowAllMobile] = useState(false);
  const changeFilter = (k: BandKey) => {
    anchorTop.current = filterRowRef.current?.getBoundingClientRect().top ?? null;
    setExpanded(null); // a row expanded in another band must not stay open here
    setShowAllMobile(false);
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
  // A range is shown only when it came from more than one hourly observation.
  // A single value is a current hourly snapshot, not a fake "$x–$x 24h range".
  // This is deliberately data-driven: same-venue and cross-venue calculators
  // share the exact same presentation and differ only in available data.
  const hasCostHistory = best.costRangeLowUsd !== best.costRangeHighUsd;
  const hold = recommendedHold(homeSlug, locale);
  const bestRuleLabel = bestRule === "medium-tradfi"
    ? tr(locale, "Cheapest medium-OI TradFi pair", "Самая дешёвая TradFi-пара со средним OI")
    : bestRule === "medium"
      ? tr(locale, "Cheapest medium-OI pair", "Самая дешёвая пара со средним OI")
      : bestRule === "tradfi"
        ? tr(locale, "Cheapest TradFi pair", "Самая дешёвая TradFi-пара")
        : tr(locale, "Cheapest eligible pair", "Самая дешёвая подходящая пара");
  return (
    <>
      <StaleDataNotice data={data} />

      {/* recommended route */}
      <div className="pf-rise mt-5 overflow-hidden rounded-[20px] border border-accent/30" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--accent) 11%, transparent), var(--surface-1) 62%)" }}>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-6 py-4">
            <div className="shrink-0 font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{tr(locale, "Recommended route", "Рекомендованный маршрут")}</div>
            <CostTierBadge costTier={best.costTier} />
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive sm:hidden">
              <span className="h-[5px] w-[5px] rounded-full bg-positive" />
              TradFi
            </span>
            {best.competitionEligible && (
              <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive sm:inline-flex">
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
        <div className="grid lg:grid-cols-[1fr_400px]">
          <div className="px-6 py-6">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="font-mono-num text-[40px] font-medium tracking-[-0.01em] text-text-primary">{best.pair}</div>
              <span className="rounded-full border border-accent/35 bg-accent/[0.09] px-3 py-1.5 font-mono-num text-[11px] tracking-[0.04em] text-accent">{bestRuleLabel}</span>
            </div>
            <div className="my-4 overflow-hidden rounded-[14px] border border-border lg:hidden" style={{ background: "linear-gradient(180deg, #10162a, #0a0e18)" }}>
              <RecommendedRouteDiagram longName={homeName} shortName={hedgeName} />
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
            <div className="grid grid-cols-2 gap-3 pt-4 lg:grid-cols-5">
              {([
                [tr(locale, "Position per leg", "Позиция на ногу"), formatUsd(data.fillNotionalUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Volume per account", "Объём на аккаунт"), formatUsd(data.accountVolumeUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Full hedge cycle", "Полный цикл"), formatUsd(data.totalCycleVolumeUsd, { decimals: 0 }), "text-text-primary"],
                [tr(locale, "Hold", "Удержание"), hold, "text-text-primary"],
                [
                  tr(locale, "Estimated execution cost", "Оценка стоимости исполнения"),
                  formatUsd(best.cycleCostUsd),
                  "text-positive",
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
                value={best.fundingUsd ?? 0}
                signed
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
                "Execution cost includes fees, spread and quote impact. Funding is shown separately for a 12-hour hold and does not change the route ranking.",
                "Стоимость исполнения включает комиссии, спред и impact. Funding показан отдельно за 12 часов и не влияет на ранжирование маршрута.",
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
          <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, `${top.length} cheapest pairs`, `${top.length} самых дешёвых пар`)}</h2>
          <div className="flex flex-col items-end gap-2">
            <div className="font-mono-num text-[12px] text-text-dim">{tr(locale, "Market data updated", "Данные обновлены")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</div>
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
          </div>
        </div>

        <div className="lg:overflow-x-auto">
          <div className="space-y-2.5 lg:min-w-[900px]">
            {/* Column headers belong to the wide table only. */}
            <div className={`hidden lg:grid ${GRID} items-center gap-3 border-b border-border bg-surface-1 px-[18px] py-3 text-[11px] text-text-dim`}>
              <div>#</div>
              <div>{tr(locale, "Pair", "Пара")}</div>
              <div>{tr(locale, "Open interest", "Открытый интерес")}</div>
              <div>{tr(locale, "LONG protocol", "LONG протокол")}</div>
              <div>{tr(locale, "SHORT protocol", "SHORT протокол")}</div>
              <div>{tr(locale, "Entry orders", "Вход")}</div>
              <div>{tr(locale, "Exit orders", "Выход")}</div>
              <div className="text-right">{tr(locale, "by cycle cost", "по стоимости цикла")}</div>
              <div />
            </div>
            {top.map((p, i) => {
              const o = p.entryOrders && p.exitOrders ? { entry: p.entryOrders, exit: p.exitOrders } : orders(p.firstLimitSide);
              const open = expanded === p.pair;
              return (
                <div key={p.pair} className={`overflow-hidden rounded-[14px] border border-border bg-bg ${i >= 5 && !showAllMobile ? "hidden lg:block" : ""}`}>
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
                      <div className="flex min-w-0 items-center gap-1.5 pl-[26px] font-mono-num text-[10px] text-text-muted">
                        <span className="truncate">L {homeName}</span>
                        <span className="text-text-dim">·</span>
                        <span className="truncate">S {hedgeName}</span>
                        <span className="ml-auto shrink-0">OI {compactUsd(p.openInterestUsd)}</span>
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
                            [tr(locale, "Hold", "Удержание"), hold, "text-text-primary"],
                            hasCostHistory
                              ? [tr(locale, "Estimated cost · 24h median", "Оценка · медиана 24ч"), formatUsd(p.cycleCostUsd), "text-positive"]
                              : [tr(locale, "Estimated execution cost", "Оценка стоимости исполнения"), formatUsd(p.cycleCostUsd), "text-positive"],
                            hasCostHistory
                              ? [tr(locale, "24h range", "Диапазон за 24ч"), `${formatUsd(p.costRangeLowUsd)}–${formatUsd(p.costRangeHighUsd)}`, "text-text-muted"]
                              : [tr(locale, "24h range", "Диапазон за 24ч"), tr(locale, "history collecting", "история собирается"), "text-text-dim"],
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
                              // short on one book, so funding is a measured
                              // zero; cross routes retain their signed value.
                              p.fundingUsd ?? 0,
                              undefined,
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
            {top.length > 5 && (
              <button
                type="button"
                onClick={() => {
                  if (showAllMobile) setExpanded(null);
                  setShowAllMobile((value) => !value);
                }}
                className="pf-transition flex h-12 w-full items-center justify-center rounded-xl border border-border text-[14px] font-semibold text-text-primary hover:border-accent/50 hover:bg-surface-1 lg:hidden"
              >
                {showAllMobile ? tr(locale, "Show fewer", "Показать меньше") : tr(locale, `Show all ${top.length}`, `Показать все ${top.length}`)}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
