"use client";

import Link from "next/link";
import { useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { RouteMap } from "@/components/v2/RouteMap";

function H2({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.02em] text-text-primary">{title}</h2>
      <div className="pb-5 text-[15px] text-text-muted">{sub}</div>
    </>
  );
}

function Hero() {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-[26px] pb-13 pt-[72px]">
      <div className="flex max-w-[720px] flex-col items-start gap-5">
        <div className="font-mono-num text-[11px] tracking-[0.16em] text-accent">{tr(locale, "CALCULATION FRAMEWORK", "МОДЕЛЬ РАСЧЁТА")}</div>
        <h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.032em] text-text-primary sm:text-[56px]">{tr(locale, "Methodology", "Методология")}</h1>
        <p className="text-[17px] leading-[1.62] text-text-muted">
          {tr(locale, "PerpFarm compares full hedge-cycle execution cost, not just published trading fees.", "PerpFarm сравнивает полную стоимость исполнения хедж-цикла, а не только опубликованные торговые комиссии.")}
        </p>
      </div>
      <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(180deg, #10162a, #0a0e18)" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono-num text-[11px] uppercase tracking-[0.1em]" style={{ color: "#8b96ad" }}>{tr(locale, "Execution checkpoints", "Точки исполнения")}</div>
          <div className="flex items-center gap-5 text-[12px]" style={{ color: "#8b96ad" }}>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4d8dff" }} />{tr(locale, "Route cost", "Стоимость маршрута")}</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#f0b45a" }} />{tr(locale, "Funding layer", "Слой фандинга")}</span>
          </div>
        </div>
        <RouteMap mode="checkpoints" height={320} />
      </div>
    </div>
  );
}

function InputCards() {
  const locale = useLocale();
  const card = "flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-6";
  const num = (n: string) => <div className="font-mono-num text-[11px] text-accent">{n}</div>;
  const chip = (t: string) => <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-mono-num text-[11px] text-text-primary">{t}</span>;
  return (
    <div>
      <H2 title={tr(locale, "What is included in a route calculation", "Что входит в расчёт маршрута")} sub={tr(locale, "Five inputs, in the order the model applies them.", "Пять входов — в порядке, в котором их применяет модель.")} />
      <div className="grid gap-3.5 md:grid-cols-3">
        <div className={card}>
          <div className="flex items-center gap-3">{num("01")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Market eligibility", "Пригодность рынка")}</div></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Only tradable markets are considered: availability, a live open-interest floor (gross OI ≥ $50k), enough 24h volume, and protocol competition eligibility.", "Учитываются только торгуемые рынки: доступность, живой флор по OI (gross OI ≥ $50k), достаточный объём за 24ч и eligibility для конкурса протокола.")}</div>
          <div className="mt-auto flex flex-wrap gap-1.5">{chip("availability")}{chip("OI ≥ $50k")}{chip("eligibility")}</div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">{num("02")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Entry and exit", "Вход и выход")}</div></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Every route opens and closes both hedge legs. The model prices the complete cycle, not a single trade — two LIMIT legs are free, the two MARKET legs carry the cost.", "Каждый маршрут открывает и закрывает обе ноги хеджа. Модель считает полный цикл, а не одну сделку — две LIMIT-ноги бесплатны, две MARKET-ноги несут стоимость.")}</div>
          <div className="mt-auto grid grid-cols-2 gap-1.5">
            <div className="rounded-[9px] border border-positive/20 bg-positive/[0.06] px-3 py-2 font-mono-num text-[11px] text-positive">LONG entry</div>
            <div className="rounded-[9px] border border-positive/20 bg-positive/[0.06] px-3 py-2 font-mono-num text-[11px] text-positive">LONG exit</div>
            <div className="rounded-[9px] border border-negative/20 bg-negative/[0.06] px-3 py-2 font-mono-num text-[11px] text-negative">SHORT entry</div>
            <div className="rounded-[9px] border border-negative/20 bg-negative/[0.06] px-3 py-2 font-mono-num text-[11px] text-negative">SHORT exit</div>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">{num("03")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Spread and quote impact", "Спред и quote impact")}</div></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Published fees can be zero while execution still costs. PerpFarm adds half-spread and quote impact at your size, using the 24h median with a p25–p75 range.", "Опубликованные комиссии могут быть нулевыми, а исполнение всё равно стоит. PerpFarm добавляет полспреда и quote impact на ваш размер — по медиане за 24ч с диапазоном p25–p75.")}</div>
          <div className="mt-auto flex items-center justify-between rounded-[10px] bg-surface-2 px-3.5 py-3">
            <span className="text-[12px] text-text-muted">{tr(locale, "Published fee", "Комиссия")}</span>
            <span className="font-mono-num text-[13px] text-text-dim">$0.00</span>
            <span className="text-[12px] text-text-muted">{tr(locale, "Real cost", "Реальная")}</span>
            <span className="font-mono-num text-[13px] text-text-primary">$6.20</span>
          </div>
        </div>
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-warning/20 bg-surface-1 p-6">
          <div className="flex items-center gap-3">{num("04")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Funding", "Фандинг")}</div><span className="ml-auto rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono-num text-[10px] text-warning">{tr(locale, "ESTIMATE", "ОЦЕНКА")}</span></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Funding is counted as a net hedge-cycle cost: it nets to zero on an equal-size same-protocol hedge, while a cross-protocol route counts the funding delta. Future funding stays an estimate.", "Фандинг учитывается как чистая стоимость цикла: при равном размере на одном протоколе он нетится в ноль, а в кросс-маршруте считается дельта фандинга. Будущий фандинг остаётся оценкой.")}</div>
        </div>
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-6 md:col-span-2">
          <div className="flex items-center gap-3">{num("05")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Protocol reward mechanics", "Механики наград протокола")}</div></div>
          <div className="max-w-[640px] text-[14px] leading-[1.65] text-text-muted">{tr(locale, "PerpFarm surfaces the protocol rules that affect farming efficiency — but never computes point value, which stays manual.", "PerpFarm показывает правила протокола, влияющие на эффективность фарма, но никогда не считает цену поинта — она всегда ручная.")}</div>
          <div className="flex flex-wrap gap-1.5">
            {["holding time", "open interest", "eligible volume", "maker liquidity", "tiers", "referrals", "active competitions"].map((m) => (
              <span key={m} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-text-primary">{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RankingFormula() {
  const locale = useLocale();
  const term = (t: string, tone: "g" | "r" | "a") => (
    <span
      className={`rounded-[11px] border px-3.5 py-2.5 font-mono-num text-[14px] ${
        tone === "g" ? "border-positive/25 bg-positive/[0.06] text-positive" : tone === "r" ? "border-negative/25 bg-negative/[0.06] text-negative" : "border-warning/25 bg-warning/[0.06] text-warning"
      }`}
    >
      {t}
    </span>
  );
  const plus = <span className="font-mono-num text-[17px] text-text-dim">+</span>;
  return (
    <div className="pt-13">
      <H2 title={tr(locale, "How routes are ranked", "Как ранжируются маршруты")} sub={tr(locale, "One formula, one ordering.", "Одна формула, один порядок.")} />
      <div className="rounded-[20px] border border-accent/20 p-[30px]" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, transparent), var(--surface-1) 55%)" }}>
        <div className="pb-4 font-mono-num text-[12px] uppercase tracking-[0.1em] text-accent">{tr(locale, "Full hedge-cycle cost =", "Полная стоимость хедж-цикла =")}</div>
        <div className="flex flex-wrap items-center gap-2.5">
          {term("LONG entry", "g")}
          {plus}
          {term("LONG exit", "g")}
          {plus}
          {term("SHORT entry", "r")}
          {plus}
          {term("SHORT exit", "r")}
          {plus}
          {term(tr(locale, "net funding", "net funding"), "a")}
        </div>
        <div className="max-w-[760px] pt-5 text-[15px] leading-[1.66] text-text-muted">
          {tr(locale, "Routes are ordered from the lowest estimated full-cycle cost to the highest. There is no separate “max points” or “balanced” mode — cost is the only ranking.", "Маршруты сортируются от наименьшей оценочной стоимости цикла к наибольшей. Нет отдельного режима «max points» или «balanced» — единственное ранжирование по стоимости.")}
        </div>
        <div className="mt-5 rounded-[12px] bg-surface-2 px-4 py-3.5 font-mono-num text-[13px] leading-[1.8] text-text-muted">
          <div><span className="text-text-primary">cost</span> = 2 · fill · (spread / 2 + impact) / 10,000</div>
          <div className="text-text-dim">{tr(locale, "fill = volume ÷ 2 · spread & impact = 24h median · range = p25–p75 · funding, fees = 0 for an equal same-protocol hedge", "fill = объём ÷ 2 · spread и impact = медиана 24ч · диапазон = p25–p75 · funding, fees = 0 для равного same-protocol хеджа")}</div>
        </div>
      </div>
    </div>
  );
}

function DataStatus() {
  const locale = useLocale();
  const live: [string, string][] = [
    [tr(locale, "Current quotes", "Текущие котировки"), "live"],
    [tr(locale, "Open interest", "Открытый интерес"), "live"],
    [tr(locale, "24h volume", "Объём 24ч"), "live"],
    [tr(locale, "24h spread / impact (p25–p75)", "24ч спред / impact (p25–p75)"), tr(locale, "observed", "наблюдаемо")],
    [tr(locale, "Protocol activity", "Активность протокола"), tr(locale, "observed", "наблюдаемо")],
  ];
  const estimated: [string, string][] = [
    [tr(locale, "Future exit quote", "Будущая котировка выхода"), tr(locale, "modelled", "модель")],
    [tr(locale, "Future funding", "Будущий фандинг"), tr(locale, "modelled", "модель")],
    [tr(locale, "Limit-order fill probability", "Вероятность исполнения LIMIT"), tr(locale, "modelled", "модель")],
    [tr(locale, "Future point emission", "Будущая эмиссия поинтов"), tr(locale, "unknown", "неизвестно")],
    [tr(locale, "Future competition rules", "Будущие правила конкурса"), tr(locale, "unknown", "неизвестно")],
  ];
  const list = (rows: [string, string][], valueClass: string) => (
    <div className="flex flex-col">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
          <span className="text-[14px] text-text-primary">{k}</span>
          <span className={`font-mono-num text-[12px] ${valueClass}`}>{v}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="pt-13">
      <H2 title={tr(locale, "Data status", "Статус данных")} sub={tr(locale, "What is observed, and what is inferred.", "Что наблюдается, а что выводится.")} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-positive/20 bg-surface-1 p-6">
          <div className="flex items-center gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-positive" /><div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Live or observed", "Живое или наблюдаемое")}</div></div>
          {list(live, "text-positive")}
        </div>
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-warning/20 bg-surface-1 p-6">
          <div className="flex items-center gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" /><div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Estimated or uncertain", "Оценка или неопределённость")}</div></div>
          {list(estimated, "text-warning")}
        </div>
      </div>
    </div>
  );
}

const PROTOCOLS: { slug: string; name: string; tag: "confirmed" | "assumption"; rules: { en: string; ru: string }[] }[] = [
  {
    slug: "variational",
    name: "Variational",
    tag: "confirmed",
    rules: [
      { en: "Medium-OI markets and holding time are the primary farming focus.", ru: "Основной фокус фарма — рынки среднего OI и время удержания." },
      { en: "Eligible volume is secondary.", ru: "Eligible-объём вторичен." },
      { en: "Passive LIMIT liquidity is more point-efficient than MARKET execution.", ru: "Пассивная LIMIT-ликвидность эффективнее по поинтам, чем MARKET-исполнение." },
      { en: "Reward tiers, referral boost and active competitions can increase points.", ru: "Reward-тиры, реферальный буст и активные конкурсы повышают поинты." },
      { en: "During an active TradFi competition, eligible TradFi/RWA markets are prioritized.", ru: "Во время активного TradFi-конкурса приоритет у eligible TradFi/RWA-рынков." },
    ],
  },
  {
    slug: "txflow",
    name: "TxFlow",
    tag: "assumption",
    rules: [
      { en: "No points programme has been published — rules here are planning assumptions only.", ru: "Программа поинтов не опубликована — правила здесь только предположения для планирования." },
      { en: "Modelled as a hedge venue: execution cost is counted, reward value is not.", ru: "Моделируется как площадка для хеджа: считается стоимость исполнения, ценность награды — нет." },
      { en: "Treated as a potential retroactive-points farm, which PerpFarm does not price in.", ru: "Рассматривается как потенциальный фарм ретро-поинтов, который PerpFarm не оценивает в стоимости." },
    ],
  },
];

function ProtocolLogic() {
  const locale = useLocale();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="pt-13">
      <H2 title={tr(locale, "Protocol-specific logic", "Логика по протоколам")} sub={tr(locale, "Each protocol adds its own rules on top of the shared model.", "Каждый протокол добавляет свои правила поверх общей модели.")} />
      <div className="overflow-hidden rounded-[18px] border border-border bg-surface-1">
        {PROTOCOLS.map((p, i) => {
          const isOpen = open === i;
          return (
            <div key={p.slug} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="pf-transition flex w-full items-center justify-between gap-4 px-[22px] py-[18px] text-left hover:bg-surface-2"
              >
                <div className="flex items-center gap-3.5">
                  <ProtocolMark slug={p.slug} name={p.name} size={30} radius={9} />
                  <div className="text-[16px] font-semibold text-text-primary">{p.name}</div>
                  <span className={`rounded-md px-2 py-0.5 font-mono-num text-[10px] ${p.tag === "confirmed" ? "border border-positive/30 bg-positive/10 text-positive" : "border border-warning/30 bg-warning/10 text-warning"}`}>
                    {p.tag === "confirmed" ? tr(locale, "CONFIRMED", "ПОДТВЕРЖДЕНО") : tr(locale, "ASSUMPTION", "ПРЕДПОЛОЖЕНИЕ")}
                  </span>
                </div>
                <span className="text-[12px] text-text-dim">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-[22px] pb-5 pl-[65px]">
                  <div className="flex max-w-[820px] flex-col gap-2.5">
                    {p.rules.map((r, k) => (
                      <div key={k} className="flex items-start gap-3">
                        <span className="mt-2 h-[5px] w-[5px] flex-none rounded-full bg-accent" />
                        <span className="text-[14px] leading-[1.62] text-text-muted">{tr(locale, r.en, r.ru)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3.5 flex gap-3.5 rounded-2xl border border-warning/20 bg-surface-1 px-5 py-4">
        <div className="w-[3px] flex-none rounded bg-warning" />
        <div className="text-[14px] leading-[1.62] text-text-muted">
          {tr(locale, "Protocol rules can change. PerpFarm separates publicly confirmed rules from planning assumptions.", "Правила протоколов могут меняться. PerpFarm отделяет публично подтверждённые правила от предположений для планирования.")}
        </div>
      </div>
    </div>
  );
}

export function MethodologyV2() {
  const locale = useLocale();
  return (
    <div>
      <SiteHeaderV2 />
      <div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10">
        <Hero />
        <InputCards />
        <RankingFormula />
        <DataStatus />
        <ProtocolLogic />

        <div className="mt-14 flex flex-col items-start justify-between gap-5 rounded-[20px] border border-accent/20 px-8 py-8 sm:flex-row sm:items-center" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}>
          <div className="flex flex-col gap-2">
            <div className="text-[24px] font-bold tracking-[-0.02em] text-text-primary">{tr(locale, "See the model applied", "Смотрите модель в действии")}</div>
            <div className="text-[15px] text-text-muted">{tr(locale, "Every protocol page runs the same calculation on live data.", "Каждая страница протокола запускает тот же расчёт на живых данных.")}</div>
          </div>
          <Link href="/#protocols" className="pf-transition inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_26px_rgba(77,141,255,0.28)] hover:bg-accent-hover">
            {tr(locale, "Explore protocols", "К протоколам")}
            <span className="font-mono-num text-[13px]">→</span>
          </Link>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted">
          <span>{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span>
        </div>
      </div>
    </div>
  );
}
