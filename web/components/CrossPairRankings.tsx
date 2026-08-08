"use client";

import { useEffect, useMemo, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { RouteMap } from "@/components/v2/RouteMap";

type Pair = {
  pair: string; oiAUsd: number; oiBUsd: number; volume24hMinUsd: number;
  longVenue: string; shortVenue: string; execCostUsd: number; feeCostUsd: number;
  fundingUsd: number; cycleCostUsd: number;
};
type Data = {
  asOf: string; accountVolumeUsd: number; fillNotionalUsd: number; totalCycleVolumeUsd: number;
  holdHours: number; bands: { pairs: Pair[] }[];
};

const compact = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);

export function CrossPairRankings({
  venueSlug, hedgeSlug, homeName, hedgeName, accountVolumeUsd, tradfiOnly = false,
}: {
  venueSlug: string; hedgeSlug: string; homeName: string; hedgeName: string;
  accountVolumeUsd: number; tradfiOnly?: boolean;
}) {
  const locale = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(null); setExpanded(null);
    const url = "/api/venues/" + venueSlug + "/cross-rankings?hedge=" + encodeURIComponent(hedgeSlug) + "&accountVolumeUsd=" + accountVolumeUsd + "&tradfiOnly=" + tradfiOnly;
    fetch(url).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error ?? "request failed");
      return response.json() as Promise<Data>;
    }).then((result) => active && setData(result)).catch((reason) => active && setError(reason instanceof Error ? reason.message : "request failed"));
    return () => { active = false; };
  }, [venueSlug, hedgeSlug, accountVolumeUsd, tradfiOnly]);

  const pairs = useMemo(() => (data?.bands ?? []).flatMap((band) => band.pairs).sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, 10), [data]);
  const best = pairs[0];
  const name = (slug: string) => slug === venueSlug ? homeName : hedgeName;
  const slug = (value: string) => value === venueSlug ? venueSlug : hedgeSlug;

  if (!data && !error) return <div className="mt-5 flex flex-col items-center gap-4 rounded-[20px] border border-accent/25 bg-bg px-8 py-14"><div className="h-0.5 w-52 overflow-hidden rounded bg-white/10"><div className="pf-scan h-full w-1/3 bg-accent" /></div><div className="font-mono-num text-[13px] text-accent">{tr(locale, "Pricing cross-venue routes…", "Считаем кросс-площадочные маршруты…")}</div></div>;
  if (!data || !best) return <div className="mt-5 rounded-2xl border border-negative/40 bg-negative/10 p-4 text-[14px] text-negative">{error ?? tr(locale, "No liquid cross-venue pairs found.", "Ликвидных кросс-площадочных пар не найдено.")}</div>;

  const leg = (side: "LONG" | "SHORT", venue: string) => <div className={"flex flex-col gap-2.5 rounded-[14px] border p-4 " + (side === "LONG" ? "border-positive/25" : "border-negative/25")}><div className={"font-mono-num text-[10px] tracking-[0.14em] " + (side === "LONG" ? "text-positive" : "text-negative")}>{side}</div><div className="flex items-center gap-2.5"><ProtocolMark slug={slug(venue)} name={name(venue)} size={26} radius={8} /><div className="text-[16px] font-semibold text-text-primary">{name(venue)}</div></div><div className="font-mono-num text-[12px] text-text-muted">MARKET {tr(locale, "in", "вход")} · MARKET {tr(locale, "out", "выход")}</div></div>;

  return <div className="mt-5">
    <div className="pf-rise overflow-hidden rounded-[20px] border border-accent/30" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--accent) 11%, transparent), var(--surface-1) 62%)" }}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-6 py-4"><div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{tr(locale, "Recommended cross route", "Рекомендованный кросс-маршрут")}</div>{tradfiOnly && <span className="rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">TradFi</span>}<span className="text-[12px] text-text-muted">{tr(locale, "Funding = 7D average", "Funding = среднее за 7 дней")}</span></div>
      <div className="grid lg:grid-cols-[1fr_400px]"><div className="px-6 py-6"><div className="flex items-baseline gap-3.5"><div className="font-mono-num text-[40px] font-medium tracking-[-0.01em] text-text-primary">{best.pair}</div><div className="text-[14px] text-text-muted">{formatUsd(data.fillNotionalUsd, { decimals: 0 })} {tr(locale, "per leg", "на ногу")}</div></div><div className="grid grid-cols-2 gap-3 pt-5">{leg("LONG", best.longVenue)}{leg("SHORT", best.shortVenue)}</div><div className="grid grid-cols-2 gap-3 pt-4 lg:grid-cols-4"><Metric label={tr(locale, "Execution + fees", "Исполнение + комиссии")} value={formatUsd(best.execCostUsd)} /><Metric label={tr(locale, "Fees included", "Комиссии включены")} value={formatUsd(best.feeCostUsd)} tone="text-text-muted" /><Metric label={tr(locale, "7D avg funding", "Funding · среднее 7д")} value={formatUsd(best.fundingUsd)} tone={best.fundingUsd <= 0 ? "text-positive" : "text-negative"} /><Metric label={tr(locale, "Estimated net cost", "Оценка net cost")} value={formatUsd(best.cycleCostUsd)} tone="text-positive" /></div><div className="mt-5 rounded-xl px-3.5 py-3 text-[13px] leading-[1.6] text-text-muted" style={{ background: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}>{tr(locale, "Net cost includes taker fees on both protocols, spread, quote impact and the estimated 24h funding delta from a 7-day average.", "Net cost включает taker-комиссии обеих площадок, спред, impact и оценочную funding-дельту за 24ч по среднему за 7 дней.")}</div></div><div className="hidden border-t border-border lg:block lg:border-l lg:border-t-0" style={{ background: "linear-gradient(180deg, #10162a, #0a0e18)" }}><RouteMap mode="result" pair={best.pair} longLabel={name(best.longVenue)} shortLabel={name(best.shortVenue)} height={360} /></div></div>
    </div>
    <div className="pt-11"><div className="flex flex-wrap items-end justify-between gap-3 pb-4"><div><h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{pairs.length} {tr(locale, "cheapest cross pairs", "самых дешёвых кросс-пар")}</h2><p className="pt-1 text-[14px] text-text-muted">{tr(locale, "Sorted by estimated net cost. Click a row for the breakdown.", "Сортировка по оценочному net cost. Нажмите строку для деталей.")}</p></div><div className="font-mono-num text-[12px] text-text-dim">{tr(locale, "Snapshot", "Снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</div></div>
      <div className="rounded-[18px] border border-border bg-bg lg:overflow-x-auto"><div className="lg:min-w-[850px]"><div className="hidden lg:grid grid-cols-[40px_110px_1fr_1fr_110px_110px_110px] items-center gap-3 border-b border-border bg-surface-1 px-[18px] py-3 text-[11px] text-text-dim"><div>#</div><div>{tr(locale, "Pair", "Пара")}</div><div>LONG</div><div>SHORT</div><div>{tr(locale, "Execution", "Исполнение")}</div><div>Funding</div><div className="text-right">{tr(locale, "Net cost", "Net cost")}</div></div>{pairs.map((pair, index) => <PairRow key={pair.pair} pair={pair} index={index} open={expanded === pair.pair} onToggle={() => setExpanded(expanded === pair.pair ? null : pair.pair)} locale={locale} name={name} slug={slug} />)}</div></div>
    </div>
  </div>;
}

function Metric({ label, value, tone = "text-text-primary" }: { label: string; value: string; tone?: string }) {
  return <div className="flex flex-col gap-1.5"><div className="text-[11px] text-text-muted">{label}</div><div className={"font-mono-num text-[17px] " + tone}>{value}</div></div>;
}

function PairRow({ pair, index, open, onToggle, locale, name, slug }: { pair: Pair; index: number; open: boolean; onToggle: () => void; locale: "en" | "ru"; name: (venue: string) => string; slug: (venue: string) => string }) {
  return <div className="border-b border-border last:border-b-0"><button type="button" onClick={onToggle} className={"pf-transition w-full text-left hover:bg-surface-1 " + (open ? "bg-surface-1" : "")}><div className="hidden lg:grid grid-cols-[40px_110px_1fr_1fr_110px_110px_110px] items-center gap-3 px-[18px] py-3.5"><div className="font-mono-num text-[13px] text-text-dim">{String(index + 1).padStart(2, "0")}</div><div className="font-mono-num text-[16px] font-medium text-text-primary">{pair.pair}</div><div className="flex items-center gap-2"><ProtocolMark slug={slug(pair.longVenue)} name={name(pair.longVenue)} size={22} radius={7} /><span className="text-[13px]">{name(pair.longVenue)}</span></div><div className="flex items-center gap-2"><ProtocolMark slug={slug(pair.shortVenue)} name={name(pair.shortVenue)} size={22} radius={7} /><span className="text-[13px]">{name(pair.shortVenue)}</span></div><div className="font-mono-num text-[13px]">{formatUsd(pair.execCostUsd)}</div><div className={"font-mono-num text-[13px] " + (pair.fundingUsd <= 0 ? "text-positive" : "text-negative")}>{formatUsd(pair.fundingUsd)}</div><div className="text-right font-mono-num text-[16px] text-text-primary">{formatUsd(pair.cycleCostUsd)}</div></div><div className="flex items-center gap-2 px-4 py-3 lg:hidden"><span className="font-mono-num text-[12px] text-text-dim">{String(index + 1).padStart(2, "0")}</span><span className="font-mono-num text-[16px] text-text-primary">{pair.pair}</span><span className="ml-auto font-mono-num text-[16px]">{formatUsd(pair.cycleCostUsd)}</span></div></button>{open && <div className="grid gap-2 border-t border-border px-[18px] py-4 text-[13px] text-text-muted sm:grid-cols-2"><p>OI: <span className="font-mono-num text-text-primary">{compact(pair.oiAUsd)} / {compact(pair.oiBUsd)}</span></p><p>{tr(locale, "24h volume (min)", "Объём 24ч (min)")}: <span className="font-mono-num text-text-primary">{compact(pair.volume24hMinUsd)}</span></p><p>{tr(locale, "Execution + fees", "Исполнение + комиссии")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.execCostUsd)}</span></p><p>{tr(locale, "Fees on both protocols", "Комиссии обеих площадок")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.feeCostUsd)}</span></p><p>{tr(locale, "7D average funding · 24h hold", "Funding среднее 7д · холд 24ч")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.fundingUsd)}</span></p><p className="font-semibold text-text-primary">{tr(locale, "Estimated net cost", "Оценка net cost")}: <span className="font-mono-num">{formatUsd(pair.cycleCostUsd)}</span></p></div>}</div>;
}
