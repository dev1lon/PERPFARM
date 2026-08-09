"use client";

import Link from "next/link";
import Image from "next/image";
import { tr, useLocale } from "@/components/LocaleProvider";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { RouteMap } from "@/components/v2/RouteMap";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";

type StepProps = {
  number: string;
  title: string;
  body: string;
  children: React.ReactNode;
};

function Step({ number, title, body, children }: StepProps) {
  return (
    <section className="grid items-center gap-7 rounded-[20px] border border-border bg-surface-1 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-10">
      <div className="flex flex-col gap-3.5">
        <div className="font-mono-num text-[12px] tracking-[0.12em] text-accent">{number}</div>
        <h2 className="text-[26px] font-bold tracking-[-0.02em] text-text-primary sm:text-[28px]">{title}</h2>
        <p className="max-w-[540px] text-[15px] leading-[1.66] text-text-muted">{body}</p>
      </div>
      {children}
    </section>
  );
}

function ProtocolChoice({ slug, name, selected }: { slug: string; name: string; selected?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-[14px] border px-4 py-3.5 ${selected ? "border-accent/45 bg-accent/[0.09]" : "border-border bg-surface-2"}`}>
      <ProtocolMark slug={slug} name={name} size={32} radius={10} />
      <div className="min-w-0 flex-1 text-[15px] font-semibold text-text-primary">{name}</div>
      {selected ? <span className="font-mono-num text-[10px] tracking-[0.1em] text-accent">SELECTED</span> : null}
    </div>
  );
}

function HedgeDiagram() {
  return (
    <div className="rounded-[16px] border border-border bg-surface-2 p-4 sm:p-5">
      <svg viewBox="24 0 392 132" className="h-[142px] w-full" aria-hidden>
        <path d="M64 84 C 150 84, 150 34, 220 34 S 290 84, 376 84" fill="none" stroke="#4d8dff" strokeWidth="2" />
        <circle cx="220" cy="34" r="4.5" fill="#bcd6ff" /><rect x="196" y="8" width="48" height="19" rx="6" fill="rgba(10,16,30,0.9)" stroke="rgba(255,255,255,0.12)" />
        <text x="220" y="21" textAnchor="middle" fill="#e8ecf5" fontFamily="JetBrains Mono" fontSize="11">XAU</text>
        <circle cx="64" cy="84" r="12" fill="none" stroke="rgba(53,211,153,0.4)" strokeWidth="1" /><circle cx="64" cy="84" r="7" fill="#35d399" />
        <circle cx="376" cy="84" r="12" fill="none" stroke="rgba(229,100,95,0.4)" strokeWidth="1" /><circle cx="376" cy="84" r="7" fill="#e5645f" />
        <text x="64" y="112" textAnchor="middle" fill="#e8ecf5" fontFamily="Plus Jakarta Sans" fontSize="13" fontWeight="600">Variational</text><text x="64" y="128" textAnchor="middle" fill="#6fe0b6" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1.4">LONG</text>
        <text x="376" y="112" textAnchor="middle" fill="#e8ecf5" fontFamily="Plus Jakarta Sans" fontSize="13" fontWeight="600">TxFlow</text><text x="376" y="128" textAnchor="middle" fill="#f0908c" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1.4">SHORT</text>
        <circle cx="150" cy="112" r="3" fill="#39445c" /><circle cx="292" cy="114" r="3" fill="#39445c" /><circle cx="330" cy="26" r="3" fill="#39445c" /><circle cx="108" cy="28" r="3" fill="#39445c" />
      </svg>
    </div>
  );
}

/** Desktop-only neutral route visual for the intro: blue route geometry only,
 * without position-side labels that belong to the calculator itself. */
function BlueRouteModel() {
  return <div className="hidden overflow-hidden rounded-[20px] border border-border bg-[linear-gradient(180deg,#10162a,#0a0e18)] lg:block"><RouteMap mode="result" pair="XAU" longLabel="Variational" shortLabel="TxFlow" height={360} blue showSideLabels={false} /></div>;
}

function VolumePreview() {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-white/[0.09] bg-[#161d2d] p-5 sm:p-6">
      <div className="text-[12px] font-medium text-text-muted">{tr(locale, "Volume per account", "Объём на аккаунт")}</div>
      <div className="flex h-[54px] items-center gap-2 rounded-xl border border-accent bg-[#111827] px-4 shadow-[0_0_0_3px_rgba(77,141,255,0.16)]"><span className="font-mono-num text-[16px] text-text-dim">$</span><span className="flex-1 font-mono-num text-[20px] text-text-primary">10,000</span><span className="font-mono-num text-[12px] text-text-dim">USDC</span></div>
      <div className="flex items-center justify-between rounded-xl bg-white/[0.045] px-4 py-3.5"><span className="text-[13px] text-text-muted">{tr(locale, "Full hedge cycle", "Полный хедж-цикл")}</span><span className="font-mono-num text-[18px] text-text-primary">$40,000</span></div>
      <div className="text-[12px] text-text-dim">{tr(locale, "Two accounts · $10,000 long, $10,000 short", "Два аккаунта · $10,000 в лонг, $10,000 в шорт")}</div>
    </div>
  );
}

function CalculationPreview() {
  const locale = useLocale();
  return (
    <div className="overflow-hidden rounded-[16px] border border-accent/30 bg-[linear-gradient(150deg,rgba(77,141,255,0.11),rgba(11,16,25,0.9)_60%)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><span className="font-mono-num text-[10px] uppercase tracking-[0.12em] text-accent">{tr(locale, "Recommended route", "Рекомендуемый маршрут")}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2 py-1 text-[10px] font-semibold text-positive"><span className="h-1 w-1 rounded-full bg-positive" />{tr(locale, "Competition eligible", "Подходит для конкурса")}</span></div>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 pb-3.5"><span className="font-mono-num text-[30px] text-text-primary">XAU</span><span className="rounded-full border border-accent/35 bg-accent/[0.09] px-2.5 py-1 font-mono-num text-[10px] tracking-[0.04em] text-accent">{tr(locale, "Medium OI", "Средний OI")}</span></div>
        <div className="grid grid-cols-2 gap-2.5"><div className="rounded-xl border border-positive/25 bg-positive/[0.06] p-3"><div className="font-mono-num text-[10px] tracking-[0.14em] text-positive">LONG</div><div className="mt-1.5 text-[14px] font-semibold text-text-primary">Variational</div></div><div className="rounded-xl border border-negative/25 bg-negative/[0.06] p-3"><div className="font-mono-num text-[10px] tracking-[0.14em] text-negative">SHORT</div><div className="mt-1.5 text-[14px] font-semibold text-text-primary">TxFlow</div></div></div>
        <div className="grid grid-cols-2 gap-3 pt-3.5"><div><div className="text-[11px] text-text-muted">{tr(locale, "Holding window", "Период удержания")}</div><div className="mt-1 font-mono-num text-[16px] text-text-primary">12–24h</div></div><div><div className="text-[11px] text-text-muted">{tr(locale, "Execution cost", "Стоимость исполнения")}</div><div className="mt-1 font-mono-num text-[16px] text-positive">$18.40</div></div></div>
      </div>
    </div>
  );
}

function Limits() {
  const locale = useLocale();
  const items = [
    ["Does not place trades", "You open each position yourself. PerpFarm never connects to or controls your account.", "Не совершает сделки", "Вы сами открываете каждую позицию. PerpFarm не подключается к аккаунту и не управляет им."],
    ["Does not guarantee points", "Protocols decide what counts and can change their rules. A route is a plan, not a promise.", "Не гарантирует поинты", "Протоколы сами решают, что учитывается, и могут менять правила. Маршрут — это план, а не обещание."],
    ["Does not guarantee fills", "Funding, resting-order fills and exit quotes are estimates and can move while a position is open.", "Не гарантирует исполнение", "Фандинг, исполнение лимитных ордеров и цены выхода являются оценкой и могут измениться."],
    ["Does not give advice", "This is public data turned into a cost comparison. What you do with it is your decision.", "Не даёт советов", "Это сравнение затрат по публичным данным. Решение о сделке остаётся за вами."],
  ];
  return (
    <section className="pt-14 sm:pt-16">
      <h2 className="text-[24px] font-bold tracking-[-0.018em] text-text-primary">{tr(locale, "What PerpFarm does not do", "Чего PerpFarm не делает")}</h2>
      <p className="mt-1.5 pb-5 text-[14px] text-text-muted">{tr(locale, "Worth knowing before you rely on a number.", "Это важно знать до того, как опираться на расчёт.")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([title, body, titleRu, bodyRu]) => <div key={title} className="flex flex-col gap-2 rounded-2xl border border-warning/20 bg-surface-2 p-[18px]"><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-warning" /><span className="text-[14px] font-semibold text-text-primary">{tr(locale, title, titleRu)}</span></div><p className="text-[13px] leading-[1.6] text-text-muted">{tr(locale, body, bodyRu)}</p></div>)}
      </div>
    </section>
  );
}

function InlineFooter() {
  const locale = useLocale();
  return <footer className="mt-12 flex items-center gap-2.5 border-t border-border pb-16 pt-7"><Image src="/icon.svg" alt="" aria-hidden width={22} height={22} className="h-[22px] w-[22px] rounded-[7px]" /><span className="text-[13px] text-text-muted">{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span></footer>;
}

export function HowItWorksV2() {
  const locale = useLocale();
  return (
    <div style={{ backgroundImage: "radial-gradient(1100px 520px at 78% -6%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)" }}>
      <SiteHeaderV2 />
      <main className="mx-auto max-w-[1240px] px-5 pb-2 sm:px-10">
        <section className="py-14 sm:py-[72px] lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-[60px]">
          <div className="flex flex-col items-start gap-5.5"><div className="font-mono-num text-[11px] tracking-[0.16em] text-accent">{tr(locale, "START HERE", "НАЧНИТЕ ЗДЕСЬ")}</div><h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.032em] text-text-primary sm:text-[56px]">{tr(locale, "How PerpFarm works", "Как работает PerpFarm")}</h1><p className="max-w-[470px] text-[17px] leading-[1.62] text-text-muted">{tr(locale, "PerpFarm helps you plan a lower-cost route for farming perp points before you trade.", "PerpFarm помогает спланировать менее затратный путь к perp-поинтам до сделки.")}</p><div className="flex max-w-[500px] gap-3.5 rounded-2xl border border-border bg-surface-1 px-5 py-[18px]"><span className="w-[3px] shrink-0 rounded-full bg-accent" /><p className="text-[14px] leading-[1.62] text-text-muted">{tr(locale, "A hedge uses equal notional exposure on both sides of one market. This reduces directional price exposure while we measure execution costs.", "Хедж использует равный номинальный объём с обеих сторон одного рынка. Так снижается направленный ценовой риск, а PerpFarm измеряет затраты исполнения.")}</p></div></div>
          <BlueRouteModel />
        </section>
        <div className="flex flex-col gap-4">
          <Step number={tr(locale, "STEP 01", "ШАГ 01")} title={tr(locale, "Choose the points you want", "Выберите нужные поинты")} body={tr(locale, "Start with the perp protocol whose points you want to farm. Each protocol values activity differently: volume, open interest, holding time, liquidity, tiers or competitions.", "Начните с perp-протокола, чьи поинты хотите фармить. Каждый протокол по-своему оценивает активность: объём, открытый интерес, время удержания, ликвидность, тиры или соревнования.")}><div className="flex flex-col gap-2.5"><ProtocolChoice slug="variational" name="Variational" selected /><ProtocolChoice slug="txflow" name="TxFlow" /></div></Step>
          <Step number={tr(locale, "STEP 02", "ШАГ 02")} title={tr(locale, "Choose the protocol", "Выберите протокол")} body={tr(locale, "Choose the venue for the opposite position. It can be the same protocol with a second account, or another compatible perp venue.", "Выберите площадку для противоположной позиции. Это может быть тот же протокол на втором аккаунте или другая совместимая perp-площадка.")}><HedgeDiagram /></Step>
          <Step number={tr(locale, "STEP 03", "ШАГ 03")} title={tr(locale, "Set volume per account", "Укажите объём на аккаунт")} body={tr(locale, "Enter the turnover you plan to create on one account. PerpFarm shows the combined full hedge-cycle volume across both accounts.", "Введите оборот, который планируете создать на одном аккаунте. PerpFarm покажет общий объём полного хедж-цикла на двух аккаунтах.")}><VolumePreview /></Step>
          <Step number={tr(locale, "STEP 04", "ШАГ 04")} title={tr(locale, "Run the route", "Запустите расчёт")} body={tr(locale, "PerpFarm compares eligible markets and shows lower-cost routes with LONG, SHORT, entry, exit, funding and estimated execution cost.", "PerpFarm сравнивает подходящие рынки и показывает маршруты с меньшей стоимостью: LONG, SHORT, вход, выход, фандинг и оценку исполнения.")}><CalculationPreview /></Step>
        </div>
        <Limits />
        <section className="mt-14 flex flex-col items-start justify-between gap-6 rounded-[20px] border border-accent/25 bg-[linear-gradient(120deg,rgba(77,141,255,0.10),rgba(11,16,25,0.6)_60%)] p-6 sm:flex-row sm:items-center sm:p-8"><div><h2 className="text-[24px] font-bold tracking-[-0.02em] text-text-primary">{tr(locale, "Ready to plan a route?", "Готовы спланировать маршрут?")}</h2><p className="mt-1.5 text-[15px] text-text-muted">{tr(locale, "Start with the protocol whose points you want.", "Начните с протокола, чьи поинты вам нужны.")}</p></div><Link href="/#protocols" className="pf-transition inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_26px_rgba(77,141,255,0.28)] hover:bg-accent-hover">{tr(locale, "Choose a protocol", "Выбрать протокол")}<span className="font-mono-num text-[13px]">→</span></Link></section>
        <InlineFooter />
      </main>
    </div>
  );
}
