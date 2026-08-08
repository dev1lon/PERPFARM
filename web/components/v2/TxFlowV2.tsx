"use client";

import Link from "next/link";
import { tr, useLocale } from "@/components/LocaleProvider";
import { ProtocolCalculatorV2 } from "@/components/v2/ProtocolCalculatorV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { TxFlowActivityV2 } from "@/components/v2/TxFlowActivityV2";
import type { VenueSummary } from "@/lib/types";

const TRADE_URL = "https://app.txflow.com/trade/BTC-USDC";
const DOCS_URL = "https://docs.txflow.com";
const FEES_URL = "https://docs.txflow.com/perp/trading-fees";
const REFERRAL_URL = "https://docs.txflow.com/referral/referral";
const X_URL = "https://x.com/txflow_chain";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{children}</h2>;
}

function Hero() {
  const locale = useLocale();
  const metric = (label: string, value: string, valueClass = "text-text-primary") => (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface-1 px-4 py-3.5">
      <div className="text-[11px] font-medium text-text-muted">{label}</div>
      <div className={`font-mono-num text-[18px] ${valueClass}`}>{value}</div>
    </div>
  );
  return (
    <>
      <div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim">
        <Link href="/#protocols" className="pf-transition text-text-muted hover:text-text-primary">{tr(locale, "Protocols", "Протоколы")}</Link>
        <span>/</span><span className="text-text-primary">TxFlow</span>
      </div>
      <div className="flex flex-col items-start justify-between gap-6 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div className="flex items-center gap-4">
          <ProtocolMark slug="txflow" name="TxFlow" size={52} radius={14} />
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] font-bold tracking-[-0.022em] text-text-primary">TxFlow</h1>
            <div className="flex items-center gap-3.5">
              <a href={TRADE_URL} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Trade ↗</a>
              <a href={X_URL} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">X ↗</a>
              <a href={DOCS_URL} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Docs ↗</a>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {metric(tr(locale, "Status", "Статус"), "Live", "text-positive")}
          {metric(tr(locale, "VIP 0 maker", "VIP 0 maker"), "1.5 bps")}
          {metric(tr(locale, "VIP 0 taker", "VIP 0 taker"), "4.5 bps")}
        </div>
      </div>
    </>
  );
}

function MechanicsPanel() {
  const locale = useLocale();
  const priorities = [
    {
      label: "Priority 1", kicker: tr(locale, "execution first", "сначала исполнение"),
      title: tr(locale, "Choose a deep TradFi market", "Выбирайте ликвидный TradFi-рынок"),
      body: tr(locale, "Use the calculator to compare live L2 depth. A tight spread is not enough: the book must absorb the size you plan to trade.", "Сравнивайте живую L2-глубину в калькуляторе: узкого спреда недостаточно, стакан должен выдерживать ваш объём."), primary: true,
    },
    {
      label: "Priority 2", kicker: tr(locale, "then fees", "затем комиссии"),
      title: tr(locale, "Let volume lower the fee tier", "Снижайте tier объёмом"),
      body: tr(locale, "TxFlow fees depend on your rolling 14-day volume. The route includes VIP-0 maker and taker fees until a lower tier is verified for your account.", "Комиссии TxFlow зависят от rolling 14-day объёма. Пока ваш tier не подтверждён, маршрут считает VIP-0 maker и taker комиссии."), primary: false,
    },
  ];
  const tips = [
    ["01", tr(locale, "Use resting LIMIT orders", "Используйте пассивные LIMIT-ордера"), tr(locale, "A resting order supplies liquidity and uses the maker fee instead of the taker fee.", "Пассивный ордер даёт ликвидность и исполняется по maker fee вместо taker fee.")],
    ["02", tr(locale, "Check stock-market sessions", "Проверяйте сессии фондового рынка"), tr(locale, "TradFi perps can become reduce-only outside the relevant market session. Plan exits before the session closes.", "Вне сессии TradFi-perps могут перейти в reduce-only. Планируйте выход до закрытия рынка.")],
    ["03", tr(locale, "Hedge two accounts evenly", "Хеджируйте два аккаунта симметрично"), tr(locale, "Keep the long and short legs matched so the route remains delta-neutral rather than directional.", "Сопоставляйте long и short ноги, чтобы маршрут оставался дельта-нейтральным, а не направленной ставкой.")],
    ["04", tr(locale, "Use the referral discount", "Используйте реферальную скидку"), tr(locale, "A TxFlow referral gives a 5% fee discount for the trader's first $25M of volume.", "Реферал TxFlow даёт трейдеру 5% скидки на комиссии для первых $25M объёма.")],
  ];
  return (
    <section className="mt-11 rounded-[20px] border border-[#8fce43]/30 bg-surface-1 p-6 sm:p-[30px]" style={{ background: "linear-gradient(135deg, rgba(155,229,87,0.08), var(--surface-1) 60%)" }}>
      <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-[#9be557]">{tr(locale, "How TxFlow execution works", "Как работает исполнение TxFlow")}</div>
      <p className="pt-2 text-[15px] leading-[1.6] text-text-muted">{tr(locale, "Depth determines the real route cost; your fee tier comes next.", "Глубина определяет реальную стоимость маршрута, а fee tier идёт следующим фактором.")}</p>
      <div className="grid gap-3 pt-5 sm:grid-cols-2">
        {priorities.map((priority) => <div key={priority.label} className={`rounded-[18px] border p-5 ${priority.primary ? "border-[#8fce43]/40 bg-surface-2" : "border-border bg-bg/45"}`}>
          <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 font-mono-num text-[11px] font-semibold uppercase ${priority.primary ? "bg-[#8fce43] text-[#111606]" : "bg-surface-2 text-text-primary"}`}>{priority.label}</span><span className="text-[13px] text-text-muted">{priority.kicker}</span></div>
          <h3 className="pt-4 text-[19px] font-semibold tracking-[-0.018em] text-text-primary">{priority.title}</h3><p className="pt-2.5 text-[14px] leading-[1.6] text-text-muted">{priority.body}</p>
        </div>)}
      </div>
      <div className="mt-8 border-t border-border/80 pt-6"><h3 className="text-[15px] font-semibold text-text-primary">{tr(locale, "Practical tips", "Практические советы")}</h3>
        <ol className="grid gap-3 pt-4 sm:grid-cols-2">{tips.map(([number, title, body]) => <li key={number} className="flex gap-3.5 rounded-2xl border border-border bg-bg/45 p-[18px]"><span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#8fce43] font-mono-num text-[11px] font-medium text-[#111606]">{number}</span><span className="flex flex-col gap-1.5"><span className="text-[15px] font-semibold text-text-primary">{title}</span><span className="text-[13px] leading-[1.6] text-text-muted">{body}</span></span></li>)}</ol>
      </div>
      <a href={FEES_URL} target="_blank" rel="noreferrer" className="mt-5 inline-block text-[13px] font-semibold text-[#9be557] hover:text-[#b7ef7e]">{tr(locale, "Full fee schedule in the docs ↗", "Полный график комиссий в документации ↗")}</a>
    </section>
  );
}

function HedgeRecommendations() {
  const locale = useLocale();
  const card = (title: React.ReactNode, body: string, tags: string[]) => <div className="flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]"><div className="flex items-center gap-2.5"><ProtocolMark slug="txflow" name="TxFlow" size={30} radius={9} /><div className="text-[16px] font-semibold text-text-primary">{title}</div></div><div className="text-[14px] leading-[1.62] text-text-muted">{body}</div><div className="mt-auto flex gap-2">{tags.map((tag) => <span key={tag} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-muted">{tag}</span>)}</div></div>;
  return <div className="mt-11"><H2>{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</H2><div className="pb-4 pt-1.5 text-[14px] text-text-muted">{tr(locale, "Choose the counterparty after comparing its current L2 depth and fees.", "Выбирайте контрагента после сравнения его актуальной L2-глубины и комиссий.")}</div><div className="grid gap-4 sm:grid-cols-2">
    {card("TxFlow × TxFlow", tr(locale, "Two matched accounts keep the position delta-neutral while the live calculator prices the active CLOB side.", "Два симметричных аккаунта сохраняют дельта-нейтральность, а калькулятор оценивает активную сторону CLOB."), [tr(locale, "Same venue", "Одна площадка"), tr(locale, "Live L2 pricing", "Живая L2-цена")])}
    {card(<><span>TxFlow × </span><Link href="/variational" className="underline decoration-accent/70 underline-offset-4 hover:text-accent">Variational ↗</Link></>, tr(locale, "Compare the two execution venues before crossing them. Cross-venue routing will appear once both sides have a matching live model.", "Сравните исполнение двух площадок перед кросс-маршрутом. Кросс-роутинг появится, когда для обеих сторон будет единая live-модель."), [tr(locale, "Compare first", "Сначала сравнить"), tr(locale, "TradFi perps", "TradFi perps")])}
  </div></div>;
}

export function TxFlowV2({ otherVenues }: { otherVenues: VenueSummary[] }) {
  const locale = useLocale();
  return <div><SiteHeaderV2 /><div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10"><Hero /><MechanicsPanel /><HedgeRecommendations /><ProtocolCalculatorV2 otherVenues={otherVenues} venueSlug="txflow" /><TxFlowActivityV2 /><div className="mt-14 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted"><span>{tr(locale, "Live market data from TxFlow · Not financial advice", "Рыночные данные TxFlow в реальном времени · Не финансовый совет")}</span><a href={REFERRAL_URL} target="_blank" rel="noreferrer" className="text-[#9be557] hover:text-[#b7ef7e]">{tr(locale, "Referral terms ↗", "Условия рефералов ↗")}</a></div></div></div>;
}
