"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatUsd, formatUtcDateTime, pluralEn, pluralRu } from "@/lib/format";
import { tr, useLocale, type Locale } from "@/components/LocaleProvider";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { RouteMap } from "@/components/v2/RouteMap";
import { InfoTip } from "@/components/v2/InfoTip";
import { protocolName, type ReadyVenueSlug } from "@/lib/venue-status";
import { bandHasPairs, resolveBandFilter } from "@/lib/route-model";
import { CrossPairRankings } from "@/components/CrossPairRankings";
import type { VenueSummary } from "@/lib/types";
import type { InstrumentClass } from "@/lib/tradfi";

/** "all", or one market class. */
export type ClassFilter = InstrumentClass | "all";

/** The order classes are offered in: the two biggest sets a perp DEX lists,
 *  then the rest of the TradFi shelf. */
const CLASS_ORDER: InstrumentClass[] = ["crypto", "equity", "index", "commodity", "fx", "prelisting"];

export const ASSET_CLASS_LABEL: Record<InstrumentClass, { en: string; ru: string }> = {
  equity: { en: "Stock", ru: "Акция" },
  index: { en: "Index", ru: "Индекс" },
  commodity: { en: "Commodity", ru: "Сырьё" },
  fx: { en: "FX", ru: "Валюта" },
  prelisting: { en: "Pre-IPO", ru: "Pre-IPO" },
  crypto: { en: "Crypto", ru: "Крипта" },
};

const ASSET_CLASS_TITLE: Record<InstrumentClass, string> = {
  equity: "Single stock — a TradFi market, cheaper to execute and worth more points",
  index: "Index or sector ETF — a TradFi market, cheaper to execute and worth more points",
  commodity: "Commodity or metal — a TradFi market, cheaper to execute and worth more points",
  fx: "Currency pair — a TradFi market, cheaper to execute and worth more points",
  prelisting: "Pre-IPO company — a TradFi market, cheaper to execute and worth more points",
  crypto: "Crypto market — not part of the TradFi competition set",
};

/**
 * What the instrument is, in one word.
 *
 * The row used to carry a single "TradFi" tag, which answered a narrower
 * question than the reader was asking: gold, a currency pair, an index and a
 * single stock all got the same word, and the entire crypto side of the table
 * got no word at all, so absence had to be read as a class. Naming every row
 * lets the column be scanned for a KIND of market, which is how a farmer picks
 * what to trade when execution cost is close.
 *
 * One neutral treatment for every class: six hues would each have to mean
 * something, and none of them would.
 */
export function AssetClassBadge({ assetClass, locale }: { assetClass?: InstrumentClass; locale: Locale }) {
  // An older cached answer carries no class. Printing nothing is right: this
  // badge states what an instrument IS, and guessing is the one thing the page
  // never does with a figure it was not given.
  if (!assetClass) return null;
  const label = ASSET_CLASS_LABEL[assetClass];
  return (
    <span
      title={ASSET_CLASS_TITLE[assetClass]}
      className="whitespace-nowrap rounded-sm border border-border px-1.5 py-0.5 font-mono-num text-[10px] text-text-muted"
    >
      {tr(locale, label.en, label.ru)}
    </span>
  );
}

/**
 * How far the two venues' prices drift apart while the hedge is open.
 *
 * This replaced an execution-cost badge. That badge graded a number the user
 * was already reading in dollars two columns away, so it carried no
 * information. The gap between venues is the opposite: it is invisible on the
 * page, it is the risk the hedge actually carries, and it belongs to a
 * cross-protocol route only -- one book cannot drift from itself.
 */
export type SpreadRisk = "low" | "medium" | "high" | "unknown";

export interface PairRanking {
  pair: string;
  /** What the instrument is. Optional so an answer cached before the class
   *  shipped still renders -- such a row shows no class rather than being
   *  mislabelled crypto. */
  assetClass?: InstrumentClass;
  openInterestUsd: number;
  competitionEligible: boolean;
  firstLimitSide: "long" | "short";
  cycleCostUsd: number;
  costRangeLowUsd: number;
  costRangeHighUsd: number;
  spreadCostUsd: number;
  slippageCostUsd: number;
  /** Cross-protocol routes only; absent on a same-protocol route. */
  spreadRisk?: SpreadRisk;
  /** Share of the last week where the venues' price gap left its usual place. */
  spreadBreakoutShare?: number | null;
  fundingUsd?: number | null;
  feeCostUsd?: number;
  entryOrders?: string;
  exitOrders?: string;
  /** Which protocol holds each leg. Chosen per pair by the funding direction,
   *  so it is NOT simply the page you opened. */
  longVenue?: string;
  shortVenue?: string;
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
  /** What the headline cost IS, stated by the API. Every calculator prices the
   *  same way; they differ only in whether stored history exists yet. */
  costBasis?: "24h-median" | "live-book" | "latest-snapshot";
  grouped: boolean;
  bands: Band[];
  /** Every eligible pair, cheapest first. The OI tabs show a curated ten each;
   *  this is what the "All" tab pages through and the ticker search looks in. */
  pairs?: PairRanking[];
  /** Cross-protocol only: the hedge leg's own, lower OI floor. */
  hedgeMinOpenInterestUsd?: number;
  /** The fee schedule the API actually applied, per venue on the route. */
  feeSchedule?: Array<{ venue: string; makerBps: number; takerBps: number; assetClass?: string | null }>;
}

/**
 * Why the list is shorter than the protocol's market count.
 *
 * Deliberately two lines: the tooltip is a hover affordance, so anything long
 * enough to need scrolling cannot be read (it closes when the pointer leaves
 * the "?"). The floors are stated in the numbers the API actually applied; the
 * reasoning behind them lives on the methodology page, which can hold it.
 */
function eligibilityTip(locale: Locale, data: RankingResponse, homeName: string): string {
  const usd = (value: number) => compactUsd(value);
  return tr(
    locale,
    `Listed only if the market is tradable at this size: ${usd(data.minVolumeUsd)}+ of 24h volume and ${usd(data.minOpenInterestUsd)}+ open interest on ${homeName}. Full rules on the Methodology page.`,
    `В списке только рынки, исполнимые на этом размере: объём за 24ч от ${usd(data.minVolumeUsd)} и открытый интерес от ${usd(data.minOpenInterestUsd)} на ${homeName}. Полные правила — на странице «Методология».`,
  );
}

/** Names the protocols whose live feed is down, so the warning can be specific. */
function StaleDataNotice({ data }: { data: RankingResponse }) {
  const locale = useLocale();
  const down = (data.sources ?? []).filter((s) => !s.live).map((s) => s.venue);
  if (down.length === 0) return null;
  const names = down.join(", ");
  return (
    <div className="mt-5 flex gap-3.5 rounded-none border border-warning/40 bg-warning/[0.07] px-4 py-3.5">
      <span className="mt-0.5 flex-none font-mono-num text-[13px] text-warning">!</span>
      <div className="text-[13px] leading-[1.6] text-text-primary">
        <span className="font-semibold">
          {tr(locale, `${names}: numbers may be out of date`, `${names}: цифры могли устареть`)}
        </span>{" "}
        <span className="text-text-muted">
          {tr(
            locale,
            `The hourly collector has missed its last few runs, so this is priced from the newest saved snapshot (${formatUtcDateTime(data.asOf)}) and may no longer match the live book.`,
            `Почасовой сбор пропустил несколько запусков, поэтому расчёт сделан по последнему сохранённому снимку (${formatUtcDateTime(data.asOf)}) и может расходиться с текущим стаканом.`,
          )}
        </span>
      </div>
    </div>
  );
}

type Status = "idle" | "running" | "loaded" | "error";

const compactUsd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);

/**
 * Where this cost sits inside the route's own 24-hour range: 0 at the cheap
 * end of its day, 1 at the dear end.
 *
 * Deliberately the route's OWN range and not a comparison with other pairs --
 * $4 is cheap for one instrument and dear for another, and the question the
 * drawing answers is "is now a good time for THIS route", which only its own
 * day can answer. A flat range (one observation, or a market that did not move)
 * returns undefined, and the arc falls back to its neutral height rather than
 * claiming the route is at either extreme.
 */
function costFractionOf(pair: PairRanking): number | undefined {
  const span = pair.costRangeHighUsd - pair.costRangeLowUsd;
  if (!Number.isFinite(span) || span <= 0) return undefined;
  return (pair.cycleCostUsd - pair.costRangeLowUsd) / span;
}

function orders(firstLimitSide: "long" | "short") {
  const longLimitFirst = firstLimitSide === "long";
  return {
    entry: longLimitFirst ? "LIMIT / MARKET" : "MARKET / LIMIT",
    exit: longLimitFirst ? "MARKET / LIMIT" : "LIMIT / MARKET",
  };
}

const GRID = "grid-cols-[40px_130px_104px_minmax(110px,1fr)_minmax(110px,1fr)_110px_110px_104px_28px]";


const SPREAD_RISK_TONE: Record<Exclude<SpreadRisk, "unknown">, string> = {
  low: "border-positive/30 bg-positive/10 text-positive",
  medium: "border-warning/30 bg-warning/10 text-warning",
  high: "border-negative/30 bg-negative/10 text-negative",
};
const SPREAD_RISK_DOT: Record<Exclude<SpreadRisk, "unknown">, string> = {
  low: "bg-positive",
  medium: "bg-warning",
  high: "bg-negative",
};

function spreadRiskLabel(locale: Locale, risk: SpreadRisk): string {
  return risk === "low"
    ? tr(locale, "Low spread risk", "Низкий риск расхождения")
    : risk === "medium"
      ? tr(locale, "Medium spread risk", "Средний риск расхождения")
      : risk === "high"
        ? tr(locale, "High spread risk", "Высокий риск расхождения")
        : tr(locale, "Spread risk unknown", "Риск расхождения неизвестен");
}

function SpreadRiskBadge({ risk }: { risk: SpreadRisk }) {
  const locale = useLocale();
  if (risk === "unknown") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-none border px-2.5 py-1 text-[13px] font-semibold ${SPREAD_RISK_TONE[risk]}`}
    >
      <span className={`h-[5px] w-[5px] rounded-full ${SPREAD_RISK_DOT[risk]}`} />
      {spreadRiskLabel(locale, risk)}
    </span>
  );
}

/**
 * The one caveat that belongs on the headline number itself: it is measured
 * from hourly snapshots, and on a thin book the real spread at the moment of
 * trading can be wider than any of them. Stated where the claim is made, not
 * buried on the methodology page.
 */
function snapshotTip(locale: Locale): string {
  return tr(
    locale,
    "Median of 24h of hourly snapshots, not a live quote. On thin markets the real spread can be wider.",
    "Медиана почасовых снимков за 24ч, не живая котировка. На тонких рынках реальный спред может быть шире.",
  );
}

/**
 * Whose fee this is, built from the schedule the API applied.
 *
 * It used to name TxFlow in the text. That is fine while two protocols exist
 * and wrong the moment a third lists: per-protocol facts belong in data, not in
 * a sentence inside a shared component.
 */
function feeTip(locale: Locale, data: RankingResponse): string {
  const schedule = data.feeSchedule ?? [];
  const charging = schedule.filter((entry) => entry.makerBps > 0 || entry.takerBps > 0);
  const free = schedule.filter((entry) => entry.makerBps === 0 && entry.takerBps === 0);
  const bps = (value: number) => `${Number(value.toFixed(2))} bps`;
  // A protocol that prices by instrument class sends one entry per class it
  // charged in this table, so the note reads "QFEX stocks ... ; QFEX FX ..."
  // instead of quoting one rate most of the rows never paid. Which protocols
  // do that is a fact about their data, not a sentence in this component.
  const charged = charging
    .map((entry) => {
      const name = protocolName(entry.venue) ?? entry.venue;
      const label = entry.assetClass ? `${name} ${entry.assetClass}` : name;
      return `${label} ${bps(entry.makerBps)} maker / ${bps(entry.takerBps)} taker`;
    })
    .join("; ");
  const freeNames = free.map((entry) => protocolName(entry.venue) ?? entry.venue).join(", ");

  if (charging.length === 0) {
    return tr(
      locale,
      "No protocol on this route charges a trading fee, so the whole cost is the order book.",
      "Ни один протокол на этом маршруте не берёт торговую комиссию, поэтому вся стоимость — это стакан.",
    );
  }
  const base = tr(
    locale,
    `Trading fee on this route: ${charged}. Priced at what a new account pays after the referral discount; higher tiers pay less.`,
    `Торговая комиссия на этом маршруте: ${charged}. Считается по ставке нового аккаунта со скидкой за реферал; на старших тирах она ниже.`,
  );
  if (free.length === 0) return base;
  return `${base} ${tr(locale, `${freeNames} charges none.`, `${freeNames} комиссию не берёт.`)}`;
}

/**
 * The six headline tiles, identical in the recommended route and in an expanded
 * table row.
 *
 * They used to be written out twice and had drifted: the route said "Estimated
 * execution cost" with no range, while the row two panels below described the
 * very same number as "Estimated cost · 24h median" and showed one. One
 * definition, so the same number cannot be described two ways.
 */
function headlineTiles(
  locale: Locale,
  data: RankingResponse,
  pair: PairRanking,
  hold: string,
  hasCostHistory: boolean,
): Array<[string, string, string, string?]> {
  return [
    [tr(locale, "Position per leg", "Позиция на ногу"), formatUsd(data.fillNotionalUsd, { decimals: 0 }), "text-text-primary"],
    [tr(locale, "Volume per account", "Объём на аккаунт"), formatUsd(data.accountVolumeUsd, { decimals: 0 }), "text-text-primary"],
    [tr(locale, "Full hedge cycle", "Полный цикл"), formatUsd(data.totalCycleVolumeUsd, { decimals: 0 }), "text-text-primary"],
    [tr(locale, "Hold", "Удержание"), hold, "text-text-primary"],
    hasCostHistory
      ? [tr(locale, "Estimated cost · 24h median", "Оценка · медиана 24ч"), formatUsd(pair.cycleCostUsd), "text-positive", snapshotTip(locale)]
      : data.costBasis === "latest-snapshot"
        ? [tr(locale, "Estimated cost · latest snapshot", "Оценка · последний снимок"), formatUsd(pair.cycleCostUsd), "text-positive", snapshotTip(locale)]
        : [tr(locale, "Estimated cost · live book", "Оценка · текущий стакан"), formatUsd(pair.cycleCostUsd), "text-positive", snapshotTip(locale)],
    // Naming the basis beats promising a range that is not coming. Which basis
    // it is matters: a cross route reads the newest STORED snapshot of both
    // protocols, and calling that a live order book would be untrue.
    hasCostHistory
      ? [tr(locale, "24h range", "Диапазон за 24ч"), `${formatUsd(pair.costRangeLowUsd)}–${formatUsd(pair.costRangeHighUsd)}`, "text-text-muted"]
      : [
          tr(locale, "Priced from", "Источник оценки"),
          data.costBasis === "latest-snapshot"
            ? tr(locale, "latest hourly snapshot", "последний часовой снимок")
            : tr(locale, "live order book", "живой стакан"),
          "text-text-muted",
        ],
  ];
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
    <div className="flex min-w-0 flex-col gap-1.5 rounded-none border border-border/80 bg-surface-2 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
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
        {sel && <ProtocolMark slug={sel.slug} name={sel.name} size={26} radius={0} />}
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
              <ProtocolMark slug={o.slug} name={o.name} size={22} radius={0} />
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
  venueSlug?: ReadyVenueSlug;
}) {
  const locale = useLocale();
  // From the catalog, never a branch: a third protocol used to be silently
  // labelled "Variational" by the fallback side of that ternary.
  const homeName = protocolName(venueSlug) ?? venueSlug;
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
  /** Which kind of market the table shows. Client-side: see the note where the
   *  "Only TradFi" switch used to be. */
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");

  const [status, setStatus] = useState<Status>("idle");
  const [notionalUsd, setNotionalUsd] = useState<number | null>(null);
  const [ranHedge, setRanHedge] = useState<string>(venueSlug);
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
    // Always the whole answer: the market class is a property of each row, not
    // of the request, so one scan returns everything and the strip decides what
    // is shown.
    fetch(`/api/venues/${venueSlug}/pair-rankings?accountVolumeUsd=${notionalUsd}&tradfiOnly=false`)
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
  }, [status, notionalUsd, ranHedge, locale, venueSlug]);

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
      setStatus("loaded");
    }, 900);
  }

  const runLabel = status === "running" ? tr(locale, "Running…", "Считаем…") : status === "loaded" ? tr(locale, "Run again", "Ещё раз") : tr(locale, "Run", "Рассчитать");
  const field = "flex flex-col gap-2.5";
  const bands = data?.bands ?? [];
  const grouped = data?.grouped ?? false;
  const bandPairs = (key: BandKey) => bands.find((b) => b.key === key)?.pairs ?? [];
  const flatPairs = bands.flatMap((b) => b.pairs);
  // "All" means every eligible pair (paged ten at a time inside the table); an
  // OI tab keeps its curated ten. Older responses carry no `pairs`, so the
  // union of the bands stands in.
  // Resolved against the answer: a band the response does not carry falls back
  // to "All" rather than drawing an empty table under a highlighted tab.
  const activeFilter = resolveBandFilter(bands, oiFilter);
  const tablePairs = [...(activeFilter === "all" || !grouped ? data?.pairs ?? flatPairs : bandPairs(activeFilter))]
    .sort((a, b) => a.cycleCostUsd - b.cycleCostUsd);
  const [best, bestRule] = selectRecommendedPair(bands, venueSlug);

  return (
    <div className="mt-10">
      {/* calculator bar */}
      <div className="rounded-none border border-border bg-surface-1 px-7 py-6">
        <div className="grid items-end gap-5 lg:grid-cols-[1fr_1fr_1fr_132px]">
          <div className={field}>
            <div className="text-[12px] font-medium text-text-muted">{isTxFlow ? tr(locale, "Trade on", "Торгуем на") : tr(locale, "Farm points on", "Фармим поинты на")}</div>
            <div className="flex h-[50px] items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3.5">
              <ProtocolMark slug={venueSlug} name={homeName} size={26} radius={0} />
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
            {/* The "Only TradFi" switch stood here. It asked the reader to think
                in the boundary the data happened to be organised around rather
                than in the market they want to farm, and it was a QUERY
                PARAMETER, so changing your mind about it re-ran the whole scan.
                The market-class strip under the table replaced it: the class
                travels on every row, so filtering is instant and the answer the
                scan produced never changes underneath it. */}
          </div>
        </div>
      </div>

      {/* states */}
      {status === "idle" && (
        <div className="mt-5 flex flex-col items-center gap-2.5 rounded-none border border-dashed border-border bg-bg px-8 py-13 text-center">
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
        <div className="mt-5 flex flex-col items-center gap-4 rounded-none border border-accent/25 bg-bg px-8 py-14">
          <div className="h-0.5 w-52 overflow-hidden rounded-none bg-white/10">
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
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          oiFilter={activeFilter}
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
/** A protocol whose points mechanics we have not written up yet: recommend on
 *  cost alone, among the markets its own page treats as eligible. That is a
 *  statement about price, which we measure -- not about how it awards points,
 *  which we would be inventing. */
const DEFAULT_RECOMMENDATION_POLICY: RecommendationPolicy = { preferMediumOi: false, preferTradfi: true };

const RECOMMENDATION_POLICY: Record<string, RecommendationPolicy> = {
  variational: { preferMediumOi: true, preferTradfi: true },
  // TxFlow has not announced points mechanics. Its current guidance is
  // therefore eligible trading volume on the venue it focuses on (TradFi),
  // rather than importing Variational's Medium-OI points rule.
  txflow: { preferMediumOi: false, preferTradfi: true },
};

/** Recommended strategy duration, where one has been written. It is independent
 *  from Funding · 12h.
 *
 *  A protocol with no published guidance shows an em dash rather than borrowing
 *  another protocol's holding time: how long to hold is a points-mechanics
 *  claim, and we have not made one for it. */
const RECOMMENDED_HOLD: Record<string, { en: string; ru: string }> = {
  variational: { en: "12–24h", ru: "12–24 ч" },
  txflow: { en: "2–4h", ru: "2–4 ч" },
};

function recommendedHold(homeSlug: string, locale: Locale): string {
  const hold = RECOMMENDED_HOLD[homeSlug];
  return hold ? tr(locale, hold.en, hold.ru) : "—";
}

/**
 * The protocol being farmed owns the recommendation policy. `Hedge with`
 * changes available books and costs, never the points strategy of the home
 * page. Both same-venue and cross-venue views call this exact selector.
 */
export function selectRecommendedPair(
  bands: RankingResponse["bands"],
  homeSlug: string,
): [PairRanking | undefined, BestRule] {
  const all = bands.flatMap((band) => band.pairs);
  const medium = bands.find((band) => band.key === "medium")?.pairs ?? [];
  const cheapestOf = (pairs: PairRanking[]) => [...pairs].sort((a, b) => a.cycleCostUsd - b.cycleCostUsd)[0];
  const policy = RECOMMENDATION_POLICY[homeSlug] ?? DEFAULT_RECOMMENDATION_POLICY;

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
  classFilter = "all",
  setClassFilter,
}: {
  data: RankingResponse | null;
  top: PairRanking[];
  best: PairRanking | undefined;
  bestRule?: BestRule;
  hedgeName: string;
  homeSlug: string;
  /** Only ever used to label and mark the short leg. It was typed as the two
   *  protocols that existed when this was written, which forced every caller
   *  to cast a slug it already knew was valid. */
  hedgeSlug?: string;
  homeName: string;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  grouped: boolean;
  oiFilter: BandKey;
  setOiFilter: (v: BandKey) => void;
  classFilter?: ClassFilter;
  setClassFilter?: (v: ClassFilter) => void;
}) {
  const locale = useLocale();
  const shortSlug = hedgeSlug ?? homeSlug;
  /**
   * Legs per PAIR, not per page. The model picks which protocol is long from
   * the funding direction and returns it on every row; rendering `homeSlug` as
   * LONG for the whole table threw that away, so the same trade appeared
   * mirrored depending on which protocol's page you happened to be on.
   */
  const legsOf = (pair: PairRanking) => {
    const longVenue = pair.longVenue ?? homeSlug;
    const shortVenue = pair.shortVenue ?? shortSlug;
    const nameOf = (slug: string) => protocolName(slug) ?? (slug === homeSlug ? homeName : hedgeName);
    return { longSlug: longVenue, longName: nameOf(longVenue), shortSlug: shortVenue, shortName: nameOf(shortVenue) };
  };
  // Switching band changes the list length, which would otherwise slide the
  // page under the finger. Anchor the filter row: remember where it sat, then
  // scroll by the delta after the new list renders.
  const filterRowRef = useRef<HTMLDivElement>(null);
  const anchorTop = useRef<number | null>(null);
  const [showAllMobile, setShowAllMobile] = useState(false);
  /** Ticker search. Useful mainly on the All tab, where every eligible pair is
   *  reachable; on an OI tab it narrows that tab's curated ten. */
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const changeFilter = (k: BandKey) => {
    anchorTop.current = filterRowRef.current?.getBoundingClientRect().top ?? null;
    setExpanded(null); // a row expanded in another band must not stay open here
    setShowAllMobile(false);
    setPage(0);
    setOiFilter(k);
  };

  const PAGE_SIZE = 10;
  // Which classes this answer contains, and how many rows each holds. Counted
  // over the whole answer, never the current page: the strip has to say what
  // choosing a class would give you, not what is on screen now.
  const classCounts = new Map<InstrumentClass, number>();
  for (const pair of top) {
    if (!pair.assetClass) continue;
    classCounts.set(pair.assetClass, (classCounts.get(pair.assetClass) ?? 0) + 1);
  }
  const offeredClasses = CLASS_ORDER.filter((name) => (classCounts.get(name) ?? 0) > 0);
  const byClass = classFilter === "all" ? top : top.filter((pair) => pair.assetClass === classFilter);
  const needle = query.trim().toUpperCase();
  const matches = needle === "" ? byClass : byClass.filter((pair) => pair.pair.toUpperCase().includes(needle));
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  // A filter or a search can shorten the list under the current page.
  const safePage = Math.min(page, pageCount - 1);
  const visible = matches.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const goToPage = (next: number) => {
    setExpanded(null);
    setPage(Math.max(0, Math.min(next, pageCount - 1)));
  };
  const search = (value: string) => {
    setExpanded(null);
    setPage(0);
    setQuery(value);
  };

  /**
   * Keep the table's height once a full page has been seen.
   *
   * The last page is short (243 pairs leave three on page 25) and so is a search
   * result, and everything below the table used to slide up to meet it. Blank
   * filler rows were the obvious fix and the wrong one: rows are not all the
   * same height, so a fixed row height overshot by ~100px. Measuring a real full
   * page instead is exact in both layouts, whatever the row contents.
   *
   * Only measured with every row collapsed -- an open row adds its breakdown
   * panel, which is not the height we want to hold.
   */
  const rowsRef = useRef<HTMLDivElement>(null);
  const [fullPageHeight, setFullPageHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (expanded === null && visible.length === PAGE_SIZE && rowsRef.current) {
      setFullPageHeight(rowsRef.current.getBoundingClientRect().height);
    }
  }, [expanded, visible.length, oiFilter, showAllMobile, needle]);
  useLayoutEffect(() => {
    if (anchorTop.current === null) return;
    const next = filterRowRef.current?.getBoundingClientRect().top;
    if (next !== undefined) window.scrollBy(0, next - anchorTop.current);
    anchorTop.current = null;
  }, [oiFilter]);

  if (!data || !best) {
    return <div className="pf-skeleton mt-5 h-80 rounded-none border border-border bg-surface-1" />;
  }
  // Eligibility only means something while a competition is running — once it
  // ends the flag would claim a benefit that no longer exists.
  const showEligible = data.competition.active;
  const bestOrders = best.entryOrders && best.exitOrders ? { entry: best.entryOrders, exit: best.exitOrders } : orders(best.firstLimitSide);
  // A range is shown only when it came from more than one hourly observation.
  // A single value is a current hourly snapshot, not a fake "$x–$x 24h range".
  // This is deliberately data-driven: same-venue and cross-venue calculators
  // share the exact same presentation and differ only in available data.
  // The API states the basis; the range check only covers an older response
  // that predates the field. Either way this is decided by the DATA, never by
  // which protocol was opened -- one calculator, one presentation.
  const hasCostHistory = data.costBasis
    ? data.costBasis === "24h-median"
    : best.costRangeLowUsd !== best.costRangeHighUsd;
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
      <div className="pf-rise mt-5 overflow-hidden rounded-none border border-accent/30" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--accent) 11%, transparent), var(--surface-1) 62%)" }}>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-6 py-4">
            <div className="shrink-0 font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{tr(locale, "Recommended route", "Рекомендованный маршрут")}</div>
            {best.spreadRisk ? <SpreadRiskBadge risk={best.spreadRisk} /> : null}
            {/* The plated pair says what kind of market it is, so the reader
                need not find its row in the table below to learn whether the
                route they are handed is a stock or a token.

                There were two pills here: one shown only on phones that printed
                "TradFi" for EVERY pair regardless of eligibility, and one shown
                only from `sm` up that checked the flag. A phone was told gold
                and Dogecoin were both TradFi. One badge now, one answer, and it
                is the instrument's real class. */}
            <AssetClassBadge assetClass={best.assetClass} locale={locale} />
            {showEligible && best.competitionEligible && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-none border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                {tr(locale, "Competition eligible", "Eligible для конкурса")}
              </span>
            )}
        </div>
        <div className="grid lg:grid-cols-[1fr_400px]">
          <div className="px-6 py-6">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="font-mono-num text-[40px] font-medium tracking-[-0.01em] text-text-primary">{best.pair}</div>
              {/* Set like the spread-risk badge beside it: same size, same
                  weight, same face. It was the same 11px, but in the CONDENSED
                  cut at normal weight, which reads a size smaller than its
                  neighbour -- two badges on one row disagreeing about how big a
                  badge is. The condensed cut is for figures; this is a phrase. */}
              <span className="rounded-none border border-accent/35 bg-accent/[0.09] px-3 py-1.5 text-[13px] font-semibold text-accent">{bestRuleLabel}</span>
            </div>
            <div className="my-4 overflow-hidden rounded-none border border-border lg:hidden" style={{ background: "linear-gradient(180deg, #10162a, #0a0e18)" }}>
              <RecommendedRouteDiagram longName={legsOf(best).longName} shortName={legsOf(best).shortName} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-5">
              <div className="flex flex-col gap-2.5 rounded-none border border-positive/25 p-4" style={{ background: "color-mix(in srgb, var(--positive) 6%, transparent)" }}>
                <div className="font-mono-num text-[10px] tracking-[0.14em] text-positive">LONG</div>
                <div className="flex items-center gap-2.5">
                  <ProtocolMark slug={legsOf(best).longSlug} name={legsOf(best).longName} size={26} radius={0} />
                  <div className="text-[16px] font-semibold text-text-primary">{legsOf(best).longName}</div>
                </div>
                <div className="font-mono-num text-[12px] text-text-muted">{bestOrders.entry.split(" / ")[0]} {tr(locale, "in", "вход")} · {bestOrders.exit.split(" / ")[0]} {tr(locale, "out", "выход")}</div>
              </div>
              <div className="flex flex-col gap-2.5 rounded-none border border-negative/25 p-4" style={{ background: "color-mix(in srgb, var(--negative) 6%, transparent)" }}>
                <div className="font-mono-num text-[10px] tracking-[0.14em] text-negative">SHORT</div>
                <div className="flex items-center gap-2.5">
                  <ProtocolMark slug={legsOf(best).shortSlug} name={legsOf(best).shortName} size={26} radius={0} />
                  <div className="text-[16px] font-semibold text-text-primary">{legsOf(best).shortName}</div>
                </div>
                <div className="font-mono-num text-[12px] text-text-muted">{bestOrders.entry.split(" / ")[1]} {tr(locale, "in", "вход")} · {bestOrders.exit.split(" / ")[1]} {tr(locale, "out", "выход")}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4 lg:grid-cols-6">
              {headlineTiles(locale, data, best, hold, hasCostHistory).map(([k, v, cls, tip]) => (
                <div key={k} className="flex flex-col gap-1.5">
                  {/* No nowrap: at six columns "Estimated cost · 24h median"
                      overflowed its cell and printed on top of the next label. */}
                  <div className="flex items-center gap-1.5 text-[11px] leading-[1.35] text-text-muted">
                    {k}
                    {tip ? <InfoTip text={tip} /> : null}
                  </div>
                  <div className={`font-mono-num text-[17px] ${cls}`}>{v}</div>
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
                tip={(best.feeCostUsd ?? 0) > 0 ? feeTip(locale, data) : undefined}
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
          {/* The route drawing, carrying its own figures. This very comment used
              to call it decorative, and it was: a constant arc, a pair name, and
              nothing a reader could act on. It now prints the cycle cost at the
              altitude the track flies, the route's own 24-hour cost band, and
              what each leg opens with -- and the altitude itself is bound to
              where this cost sits inside that band, so the shape says "cheap for
              today" or "dear for today" before any number is read.

              Phones still skip it: the same figures are already stacked in the
              panel beside it, and a WebGL scene is a poor use of their battery
              to repeat them. */}
          <div className="hidden border-t border-border bg-surface-1 lg:block lg:border-l lg:border-t-0">
            <RouteMap
              mode="result"
              pair={best.pair}
              longLabel={legsOf(best).longName}
              shortLabel={legsOf(best).shortName}
              height={360}
              costLabel={formatUsd(best.cycleCostUsd)}
              rangeLabel={`24H ${formatUsd(best.costRangeLowUsd)}-${formatUsd(best.costRangeHighUsd)}`}
              longOrders={orders(best.firstLimitSide).entry.split(" / ")[0]}
              shortOrders={orders(best.firstLimitSide).entry.split(" / ")[1]}
              costFraction={costFractionOf(best)}
            />
          </div>
        </div>
      </div>

      {/* 10 cheapest pairs */}
      <div className="pt-11">
        <div className="flex flex-col items-start gap-2.5 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col items-start gap-2">
            <h2 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.018em] text-text-primary">
              {needle !== ""
                ? tr(
                    locale,
                    `${matches.length} ${pluralEn(matches.length, "match", "matches")}`,
                    `${matches.length} ${pluralRu(matches.length, "совпадение", "совпадения", "совпадений")}`,
                  )
                : classFilter !== "all"
                  ? /* "Eligible" is a claim about the whole answer -- these
                       markets cleared the volume and open-interest floors. The
                       same word over a filtered number would say only nine
                       markets qualified, when nine is how many of the
                       qualifying markets are commodities. */
                    `${matches.length} · ${tr(locale, ASSET_CLASS_LABEL[classFilter].en, ASSET_CLASS_LABEL[classFilter].ru)}`
                  : oiFilter === "all"
                    ? tr(
                        locale,
                        `${matches.length} eligible ${pluralEn(matches.length, "pair", "pairs")}`,
                        `${matches.length} ${pluralRu(matches.length, "подходящая пара", "подходящие пары", "подходящих пар")}`,
                      )
                    : tr(
                        locale,
                        `${matches.length} cheapest ${pluralEn(matches.length, "pair", "pairs")}`,
                        `${matches.length} ${pluralRu(matches.length, "самая дешёвая пара", "самые дешёвые пары", "самых дешёвых пар")}`,
                      )}
              <InfoTip text={eligibilityTip(locale, data, homeName)} />
            </h2>
            <div className="font-mono-num text-[12px] text-text-dim">{tr(locale, "Market data updated", "Данные обновлены")} {formatUtcDateTime(data.asOf)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Market class. Only classes this answer contains are offered: a
                venue that lists no crypto is never asked about crypto, and a
                segment that could only ever return nothing is not a choice.
                Each carries its count, so the reader knows the size of what
                they are switching to before switching. */}
            {setClassFilter && offeredClasses.length > 1 && (
              <div className="flex flex-wrap gap-0.5 rounded-lg border border-border p-[3px]">
                {(["all", ...offeredClasses] as ClassFilter[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setExpanded(null);
                      setShowAllMobile(false);
                      setPage(0);
                      setClassFilter(k);
                    }}
                    aria-pressed={classFilter === k}
                    className={`pf-transition rounded-none px-3 py-1.5 text-[13px] font-semibold ${classFilter === k ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                  >
                    {k === "all" ? tr(locale, "All", "Все") : tr(locale, ASSET_CLASS_LABEL[k].en, ASSET_CLASS_LABEL[k].ru)}
                    <span className="pl-1.5 font-mono-num opacity-60">
                      {k === "all" ? top.length : classCounts.get(k) ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {/* The shell shows the focus state, so the input suppresses its own
                inset ring (see .pf-inline-input in globals.css). */}
            <label className="pf-transition flex h-[34px] items-center gap-2 rounded-none border border-border bg-bg px-3 focus-within:border-accent/50">
              <span aria-hidden className="font-mono-num text-[12px] text-text-dim">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => search(event.target.value)}
                placeholder={tr(locale, "Find ticker", "Поиск тикера")}
                aria-label={tr(locale, "Find a pair by ticker", "Найти пару по тикеру")}
                className="pf-inline-input w-[104px] bg-transparent text-[12px] font-medium text-text-primary placeholder:text-text-dim focus:outline-none"
              />
            </label>
            {grouped && (
              <div ref={filterRowRef} className="flex gap-0.5 rounded-none border border-border bg-bg p-[3px]">
                {(["all", "high", "medium", "low"] as BandKey[]).map((k) => {
                  // A band the answer has no pairs in is DISABLED rather than
                  // dropped: the row keeps its width, so it cannot reflow
                  // between two scans, and the reader can see that the band
                  // exists and is empty. Clicking it used to blank the table --
                  // on the cross-protocol card, the whole block including these
                  // tabs, with no way back.
                  const available = bandHasPairs(data.bands, k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!available}
                      aria-disabled={!available}
                      title={available ? undefined : tr(locale, "No pairs in this open-interest band", "В этой полосе открытого интереса нет пар")}
                      onClick={() => changeFilter(k)}
                      className={`pf-transition rounded-none px-3 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${oiFilter === k ? "bg-text-primary/10 text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                    >
                      {k === "all" ? tr(locale, "All", "Все") : k === "high" ? "High OI" : k === "medium" ? "Medium OI" : "Low OI"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:overflow-x-auto">
          <div
            ref={rowsRef}
            className="space-y-2.5 lg:min-w-[900px]"
            // Holds the height of a full page so a short one does not pull the
            // rest of the page upward. Dropped while a row is expanded, which
            // legitimately makes the table taller.
            style={expanded === null && fullPageHeight !== null ? { minHeight: fullPageHeight } : undefined}
          >
            {/* Column headers belong to the wide table only. */}
            <div className={`hidden lg:grid ${GRID} items-center gap-3 rounded-xl border border-border bg-surface-1 px-[18px] py-3.5 text-[12px] font-medium text-text-muted`}>
              <div>#</div>
              <div>{tr(locale, "Pair", "Пара")}</div>
              <div>{tr(locale, "Open interest", "Открытый интерес")}</div>
              <div>{tr(locale, "Long", "Лонг")}</div>
              <div>{tr(locale, "Short", "Шорт")}</div>
              <div>{tr(locale, "Entry orders", "Вход")}</div>
              <div>{tr(locale, "Exit orders", "Выход")}</div>
              <div className="translate-x-2 text-right">{tr(locale, "Cycle cost", "Стоимость цикла")}</div>
              <div />
            </div>
            {visible.map((p, index) => {
              // Numbering continues across pages: page 2 starts at 11, not 1.
              const i = safePage * PAGE_SIZE + index;
              const o = p.entryOrders && p.exitOrders ? { entry: p.entryOrders, exit: p.exitOrders } : orders(p.firstLimitSide);
              const open = expanded === p.pair;
              return (
                <div key={p.pair} className={`overflow-hidden rounded-none border border-border bg-bg ${index >= 5 && !showAllMobile ? "hidden lg:block" : ""}`}>
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
                        {p.spreadRisk && p.spreadRisk !== "unknown" ? <span title={spreadRiskLabel(locale, p.spreadRisk)} className={`h-1.5 w-1.5 shrink-0 rounded-full ${SPREAD_RISK_DOT[p.spreadRisk]}`} /> : null}
                        <AssetClassBadge assetClass={p.assetClass} locale={locale} />
                        {showEligible && p.competitionEligible && (
                          <span title="Competition eligible" className="rounded-sm border border-accent/40 px-1.5 py-0.5 font-mono-num text-[10px] text-accent">CE</span>
                        )}
                      </div>
                      <div className="font-mono-num text-[13px] text-text-muted">{compactUsd(p.openInterestUsd)}</div>
                      <div className="flex items-center gap-2">
                        <ProtocolMark slug={legsOf(p).longSlug} name={legsOf(p).longName} size={22} radius={0} />
                        <span className="text-[13px] text-text-primary">{legsOf(p).longName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProtocolMark slug={legsOf(p).shortSlug} name={legsOf(p).shortName} size={22} radius={0} />
                        <span className="text-[13px] text-text-primary">{legsOf(p).shortName}</span>
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
                        {p.spreadRisk && p.spreadRisk !== "unknown" ? <span title={spreadRiskLabel(locale, p.spreadRisk)} className={`h-1.5 w-1.5 shrink-0 rounded-full ${SPREAD_RISK_DOT[p.spreadRisk]}`} /> : null}
                        <AssetClassBadge assetClass={p.assetClass} locale={locale} />
                        {showEligible && p.competitionEligible && (
                          <span className="rounded-sm border border-accent/40 px-1.5 py-0.5 font-mono-num text-[10px] text-accent">CE</span>
                        )}
                        <span className={`ml-auto font-mono-num text-[16px] ${i === 0 ? "text-positive" : "text-text-primary"}`}>{formatUsd(p.cycleCostUsd)}</span>
                        <span className="text-[11px] text-text-dim">{open ? "▲" : "▼"}</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5 pl-[26px] font-mono-num text-[10px] text-text-muted">
                        <span className="truncate">L {homeName}</span>
                        <span className="text-text-dim">·</span>
                        <span className="truncate">S {legsOf(p).shortName}</span>
                        <span className="ml-auto shrink-0">OI {compactUsd(p.openInterestUsd)}</span>
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-border px-[18px] py-4" style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
                      <div className="flex flex-wrap items-center gap-2 pb-3.5">
                        {p.spreadRisk ? <SpreadRiskBadge risk={p.spreadRisk} /> : null}
                        {showEligible && p.competitionEligible && (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-none border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                            <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                            {tr(locale, "Competition eligible", "Eligible для конкурса")}
                          </span>
                        )}
                      </div>
                      {/* LONG / SHORT legs (compact recommended-route view, no 3D) */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-2 rounded-none border border-positive/25 p-3.5" style={{ background: "color-mix(in srgb, var(--positive) 6%, transparent)" }}>
                          <div className="font-mono-num text-[10px] tracking-[0.14em] text-positive">LONG</div>
                          <div className="flex items-center gap-2">
                            <ProtocolMark slug={legsOf(p).longSlug} name={legsOf(p).longName} size={22} radius={0} />
                            <span className="text-[15px] font-semibold text-text-primary">{legsOf(p).longName}</span>
                          </div>
                          <div className="font-mono-num text-[11px] text-text-muted">{o.entry.split(" / ")[0]} {tr(locale, "in", "вход")} · {o.exit.split(" / ")[0]} {tr(locale, "out", "выход")}</div>
                        </div>
                        <div className="flex flex-col gap-2 rounded-none border border-negative/25 p-3.5" style={{ background: "color-mix(in srgb, var(--negative) 6%, transparent)" }}>
                          <div className="font-mono-num text-[10px] tracking-[0.14em] text-negative">SHORT</div>
                          <div className="flex items-center gap-2">
                            <ProtocolMark slug={legsOf(p).shortSlug} name={legsOf(p).shortName} size={22} radius={0} />
                            <span className="text-[15px] font-semibold text-text-primary">{legsOf(p).shortName}</span>
                          </div>
                          <div className="font-mono-num text-[11px] text-text-muted">{o.entry.split(" / ")[1]} {tr(locale, "in", "вход")} · {o.exit.split(" / ")[1]} {tr(locale, "out", "выход")}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 py-4 lg:grid-cols-6">
                        {headlineTiles(locale, data, p, hold, hasCostHistory).map(([k, v, cls, tip]) => (
                          <div key={k} className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                              {k}
                              {tip ? <InfoTip text={tip} /> : null}
                            </div>
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
                            [tr(locale, "Fees", "Комиссии"), p.feeCostUsd ?? 0, (p.feeCostUsd ?? 0) > 0 ? feeTip(locale, data) : undefined],
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
            {visible.length > 5 && (
              <button
                type="button"
                onClick={() => {
                  if (showAllMobile) setExpanded(null);
                  setShowAllMobile((value) => !value);
                }}
                className="pf-transition flex h-12 w-full items-center justify-center rounded-xl border border-border text-[14px] font-semibold text-text-primary hover:border-accent/50 hover:bg-surface-1 lg:hidden"
              >
                {showAllMobile ? tr(locale, "Show fewer", "Показать меньше") : tr(locale, `Show all ${visible.length}`, `Показать все ${visible.length}`)}
              </button>
            )}


            {matches.length === 0 && (
              <div className="rounded-none border border-dashed border-border bg-surface-1 px-5 py-8 text-center text-[14px] text-text-muted">
                {tr(
                  locale,
                  `No eligible pair matches "${query.trim()}". It may be listed but below the liquidity floor for this size.`,
                  `Ни одна подходящая пара не совпала с «${query.trim()}». Возможно, она есть на площадке, но не проходит порог ликвидности для этого размера.`,
                )}
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between gap-3 pt-1.5">
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage === 0}
                  className="pf-transition flex items-center gap-2.5 rounded-none border border-border px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:border-accent/50 hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {/* The glyph sits on the text baseline by default, which reads
                      as slightly low; leading-none centres it against the word. */}
                  <span aria-hidden className="text-[14px] leading-none">←</span>
                  {tr(locale, "Previous", "Назад")}
                </button>
                <div className="font-mono-num text-[12px] text-text-muted">
                  {tr(
                    locale,
                    `Page ${safePage + 1} of ${pageCount} · ${matches.length} ${pluralEn(matches.length, "pair", "pairs")}`,
                    `Страница ${safePage + 1} из ${pageCount} · ${matches.length} ${pluralRu(matches.length, "пара", "пары", "пар")}`,
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= pageCount - 1}
                  className="pf-transition flex items-center gap-2.5 rounded-none border border-border px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:border-accent/50 hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tr(locale, "Next", "Вперёд")}
                  <span aria-hidden className="text-[14px] leading-none">→</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
