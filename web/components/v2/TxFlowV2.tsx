"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { MarketActivityV2 } from "@/components/v2/MarketActivityV2";
import { ProtocolCalculatorV2 } from "@/components/v2/ProtocolCalculatorV2";
import { InfoTip } from "@/components/v2/InfoTip";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { protocolName } from "@/lib/venue-status";
import type { VenueSummary } from "@/lib/types";

const TRADE_URL = "https://app.txflow.com/trade/BTC-USDC";
const DOCS_URL = "https://docs.txflow.com";
const FEES_URL = "https://docs.txflow.com/perp/trading-fees";
const X_URL = "https://x.com/txflow_chain";

function Hero() {
  const locale = useLocale();
  const metric = (label: string, value: string, tone = "text-text-primary", tip?: string) => <div className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-border bg-surface-1 px-3 py-2.5 sm:rounded-[14px] sm:px-4 sm:py-3.5"><div className="flex min-h-[26px] items-start gap-1.5 text-[10px] font-medium leading-[1.3] text-text-muted sm:min-h-0 sm:items-center sm:text-[11px]">{label}{tip ? <InfoTip text={tip} /> : null}</div><div className={`whitespace-nowrap font-mono-num text-[16px] leading-none sm:text-[18px] ${tone}`}>{value}</div></div>;
  const retroTip = tr(locale, "TxFlow has not announced a points or retroactive program. PerpFarm considers one likely; this is our view, not an official claim.", "TxFlow не анонсировал программу поинтов или ретродроп. PerpFarm считает её вероятной; это наше мнение, а не заявление протокола.");
  return <><div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim"><Link href="/#protocols" className="pf-transition text-text-muted hover:text-text-primary">{tr(locale, "Protocols", "Протоколы")}</Link><span>/</span><span className="text-text-primary">TxFlow</span></div><div className="flex flex-col items-start justify-between gap-6 border-b border-border pb-6 sm:flex-row sm:items-end"><div className="flex items-center gap-4"><ProtocolMark slug="txflow" name="TxFlow" size={52} radius={14} /><div className="flex flex-col gap-2"><h1 className="text-[32px] font-bold tracking-[-0.022em] text-text-primary">TxFlow</h1><div className="flex items-center gap-3.5"><a href={TRADE_URL} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Trade ↗</a><a href={X_URL} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">X ↗</a><a href={DOCS_URL} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Docs ↗</a></div></div></div><div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-2.5">{metric(tr(locale, "Season", "Сезон"), "0")}{metric(tr(locale, "Retro points", "Ретро-поинты"), tr(locale, "Likely", "Вероятно"), "text-warning", retroTip)}{metric(tr(locale, "OTC point price", "OTC цена поинта"), "TBA")}</div></div></>;
}

function MechanicsPanel() {
  const locale = useLocale();
  const priorities = [
    ["Priority 1", tr(locale, "eligible volume", "eligible объём"), tr(locale, "Build organic volume on liquid TradFi pairs", "Набирайте органичный объём в ликвидных TradFi-парах"), tr(locale, "TxFlow has not announced points. PerpFarm's view is to favour TradFi, where the protocol is focused, while building natural volume on the top markets.", "TxFlow не анонсировал поинты. По мнению PerpFarm, стоит делать упор на TradFi — это фокус протокола — и набирать естественный объём в топовых рынках."), true],
    ["Priority 2", tr(locale, "perps + spot", "перпы + спот"), tr(locale, "Keep activity organic", "Торгуйте органично"), tr(locale, "With no public points criteria, spot activity may also be worth considering. The pair calculator prices Perps only; it does not estimate spot execution.", "Пока нет публичных критериев поинтов, можно также рассмотреть активность на споте. Калькулятор пар считает только Perps и не оценивает исполнение на споте."), false],
  ] as const;
  const tips = [
    ["01", tr(locale, "Use resting LIMIT orders", "Используйте пассивные LIMIT-ордера"), tr(locale, "Resting orders provide liquidity and pay maker fees.", "Пассивные ордера дают ликвидность и исполняются по maker fee.")],
    ["02", tr(locale, "Check stock-market sessions", "Проверяйте сессии фондового рынка"), tr(locale, "TradFi perps can become reduce-only outside the relevant market session.", "Вне нужной рыночной сессии TradFi-perps могут перейти в reduce-only.")],
    ["03", tr(locale, "Hedge two accounts evenly", "Хеджируйте два аккаунта симметрично"), tr(locale, "Match long and short legs to keep the route delta-neutral.", "Сопоставляйте long и short ноги, чтобы маршрут оставался дельта-нейтральным.")],
    ["04", tr(locale, "Use the referral discount", "Используйте реферальную скидку"), tr(locale, "A referral gives a 5% fee discount for the trader's first $25M of volume.", "Реферал даёт трейдеру 5% скидки на комиссии для первых $25M объёма.")],
  ] as const;
  return <section className="mt-11 rounded-[20px] border border-accent/20 bg-surface-1 p-6 sm:p-[30px]" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}><div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{tr(locale, "How TxFlow execution works", "Как работает исполнение TxFlow")}</div><p className="pt-2 text-[15px] leading-[1.6] text-text-muted">{tr(locale, "Depth determines the real route cost; your fee tier comes next.", "Глубина определяет реальную стоимость маршрута, а fee tier идёт следующим фактором.")}</p><div className="grid gap-3 pt-5 sm:grid-cols-2">{priorities.map(([label, kicker, title, body, primary]) => <div key={label} className={`rounded-[18px] border p-5 ${primary ? "border-accent/45 bg-surface-2" : "border-border bg-bg/45"}`}><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 font-mono-num text-[11px] font-semibold uppercase ${primary ? "bg-accent text-white" : "bg-surface-2 text-text-primary"}`}>{label}</span><span className="text-[13px] text-text-muted">{kicker}</span></div><h3 className="pt-4 text-[19px] font-semibold tracking-[-0.018em] text-text-primary">{title}</h3><p className="pt-2.5 text-[14px] leading-[1.6] text-text-muted">{body}</p></div>)}</div><div className="mt-8 border-t border-border/80 pt-6"><h3 className="text-[15px] font-semibold text-text-primary">{tr(locale, "Practical tips", "Практические советы")}</h3><ol className="grid gap-3 pt-4 sm:grid-cols-2">{tips.map(([number, title, body]) => <li key={number} className="flex gap-3.5 rounded-2xl border border-border bg-bg/45 p-[18px]"><span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent font-mono-num text-[11px] font-medium text-white">{number}</span><span className="flex flex-col gap-1.5"><span className="text-[15px] font-semibold text-text-primary">{title}</span><span className="text-[13px] leading-[1.6] text-text-muted">{body}</span></span></li>)}</ol></div><a href={FEES_URL} target="_blank" rel="noreferrer" className="mt-5 inline-block text-[13px] font-semibold text-accent hover:text-accent-hover">{tr(locale, "Full fee schedule in the docs ↗", "Полный график комиссий в документации ↗")}</a></section>;
}

function HedgeRecommendations() {
  const locale = useLocale();
  const [partner, setPartner] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/venues/txflow/cheapest-route")
      .then((response) => (response.ok ? response.json() : null))
      // Only a slug that resolves to a listed protocol is accepted; an unknown
      // one leaves the card on self-match rather than naming a database row.
      .then((data) => { if (active && protocolName(data?.partnerSlug)) setPartner(data.partnerSlug); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const routePartner = partner ?? "txflow";
  const routeName = protocolName(routePartner) ?? "TxFlow";
  return (
    <div className="mt-11">
      <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</h2>
      <div className="pb-4 pt-1.5 text-[14px] text-text-muted">{tr(locale, "General guidance for TxFlow, independent of the calculation below.", "Общие рекомендации по TxFlow, независимо от расчёта ниже.")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="relative flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]">
          <div className="absolute right-4 top-4"><InfoTip text={tr(locale, "This recommendation is generated by the hourly snapshot job and refreshes once an hour.", "Эта рекомендация формируется часовой задачей по снимкам рынка и обновляется раз в час.")} /></div>
          <div className="flex items-center gap-1.5 text-[16px] font-semibold text-text-primary"><ProtocolMark slug="txflow" name="TxFlow" size={22} radius={7} /><span>TxFlow ×</span><ProtocolMark slug={routePartner} name={routeName} size={22} radius={7} /><span>{routeName}</span></div>
          <div className="text-[14px] leading-[1.62] text-text-muted">{tr(locale, "Approved delta-neutral setup with two accounts — the lowest-cost route.", "Одобренный дельта-нейтральный сетап с двумя аккаунтами — маршрут с минимальной стоимостью.")}</div>
          <div className="mt-auto flex items-center gap-2"><span className="whitespace-nowrap rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">{tr(locale, "Lowest cost", "Дешевле всего")}</span><span className="whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-muted">{tr(locale, "Two accounts needed", "Нужно 2 аккаунта")}</span></div>
        </div>
        <div className="flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]">
          <div className="flex items-center gap-1.5 text-[16px] font-semibold text-text-primary"><ProtocolMark slug="txflow" name="TxFlow" size={22} radius={7} /><span>TxFlow ×</span><ProtocolMark slug="variational" name="Variational" size={22} radius={7} /><Link href="/variational" className="pf-transition hover:text-accent"><span className="underline decoration-accent/70 underline-offset-4">Variational</span> ↗</Link></div>
          <div className="text-[14px] leading-[1.62] text-text-muted">{tr(locale, "A TradFi-perps counterparty to compare before crossing venues.", "Контрагент по TradFi-perps для сравнения перед кросс-площадочным маршрутом.")}</div>
          <div className="mt-auto flex gap-2"><span className="whitespace-nowrap rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">{tr(locale, "Compare first", "Сначала сравнить")}</span><span className="whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-muted">TradFi perps</span></div>
        </div>
      </div>
    </div>
  );
}

function LegacyHedgeRecommendations() {
  const locale = useLocale();
  const card = (title: React.ReactNode, body: string, tags: [string, "ok" | "warn" | "neutral"][]) => <div className="flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]"><div className="flex items-center gap-2.5"><ProtocolMark slug="txflow" name="TxFlow" size={30} radius={9} /><div className="text-[16px] font-semibold text-text-primary">{title}</div></div><div className="text-[14px] leading-[1.62] text-text-muted">{body}</div><div className="mt-auto flex gap-2">{tags.map(([tag, tone]) => <span key={tag} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone === "ok" ? "border-positive/30 bg-positive/10 text-positive" : tone === "warn" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface-2 text-text-muted"}`}>{tag}</span>)}</div></div>;
  return <div className="mt-11"><h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</h2><div className="pb-4 pt-1.5 text-[14px] text-text-muted">{tr(locale, "General guidance for TxFlow, independent of the calculation above.", "Общие рекомендации по TxFlow, независимо от расчёта выше.")}</div><div className="grid gap-4 sm:grid-cols-2">{card("TxFlow × TxFlow", tr(locale, "Two accounts on the same CLOB: calculate the live active-side execution cost before placing the hedge.", "Два аккаунта в одном CLOB: посчитайте live-стоимость активной стороны перед постановкой хеджа."), [[tr(locale, "Live L2", "Живая L2"), "ok"], [tr(locale, "Two accounts needed", "Нужно 2 аккаунта"), "neutral"]])}{card(<><span>TxFlow × </span><Link href="/variational" className="pf-transition hover:text-accent"><span className="underline decoration-accent/70 underline-offset-4">Variational</span> ↗</Link></>, tr(locale, "A TradFi-perps counterparty to compare before crossing venues. The live calculator currently prices the same-venue TxFlow route.", "Контрагент по TradFi-perps для сравнения перед кросс-площадочным маршрутом. Live-калькулятор пока считает маршрут внутри TxFlow."), [[tr(locale, "Compare first", "Сначала сравнить"), "warn"], ["TradFi perps", "neutral"]])}</div></div>;
}

function MarketImpliedFdvCard() {
  const locale = useLocale();
  return <section className="mt-11"><div className="flex flex-wrap items-end justify-between gap-3 pb-4"><div><h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "Market-implied FDV", "Рыночные ожидания FDV")}</h2><p className="pt-1.5 text-[14px] text-text-muted">{tr(locale, "Probability markets for TxFlow's post-launch FDV.", "Вероятностные рынки для FDV TxFlow после запуска.")}</p></div></div><div className="rounded-[18px] border border-border bg-surface-1 p-4 sm:p-5"><p className="flex min-h-[148px] items-center justify-center px-6 text-center text-[14px] text-text-muted">{tr(locale, "No public TxFlow FDV prediction market is available yet.", "Публичного prediction market по FDV TxFlow пока нет.")}</p></div></section>;
}

/** Shared baseline slots; TxFlow has no announced activity or points programme. */
function LegacyActivityAndDistribution() {
  const locale = useLocale();
  return <section className="mt-11"><h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "Protocol activity", "Активность протокола")}</h2><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="flex min-h-[220px] items-center justify-center rounded-[18px] border border-border bg-surface-1 p-[22px] text-center"><div className="font-mono-num text-[18px] font-semibold uppercase tracking-[0.12em] text-text-dim">{tr(locale, "No activity running", "Нет активных активностей")}</div></div><div className="flex min-h-[220px] flex-col rounded-[18px] border border-border bg-surface-1 p-[22px]"><div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Points distribution", "Раздача поинтов")}</div><div className="flex flex-1 items-center justify-center text-center"><div className="font-mono-num text-[22px] font-semibold uppercase tracking-[0.12em] text-text-dim">{tr(locale, "No points yet", "Поинтов пока нет")}</div></div></div></div></section>;
}

function ActivityAndDistribution() {
  const locale = useLocale();
  return (
    <section className="mt-11">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[220px] flex-col justify-center gap-4 rounded-[18px] border border-border bg-surface-1 p-[22px]">
          <div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Protocol activity", "Активность протокола")}</div>
          <div className="font-mono-num text-[18px] font-semibold uppercase tracking-[0.12em] text-text-dim">{tr(locale, "No activity running", "Нет активных активностей")}</div>
        </div>
        <div className="flex min-h-[220px] flex-col rounded-[18px] border border-border bg-surface-1 p-[22px]">
          <div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Points distribution", "Раздача поинтов")}</div>
          <div className="flex flex-1 items-center justify-center text-center">
            <div className="font-mono-num text-[22px] font-semibold uppercase tracking-[0.12em] text-text-dim">{tr(locale, "No points yet", "Поинтов пока нет")}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketImpliedFdv() {
  return <><ActivityAndDistribution /><MarketImpliedFdvCard /></>;
}

export function TxFlowV2({ otherVenues }: { otherVenues: VenueSummary[] }) {
  const locale = useLocale();
  return <div><SiteHeaderV2 /><div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10"><Hero /><MechanicsPanel /><HedgeRecommendations /><ProtocolCalculatorV2 otherVenues={otherVenues} venueSlug="txflow" /><MarketImpliedFdv /><MarketActivityV2 venueSlug="txflow" /><div className="mt-14 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted"><span>{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span></div></div></div>;
}
