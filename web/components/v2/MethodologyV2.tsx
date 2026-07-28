"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { RouteMap } from "@/components/v2/RouteMap";

function H2({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 className="mb-1.5 text-[26px] font-bold tracking-[-0.02em] text-text-primary">{title}</h2>
      <div className="pb-5 text-[15px] text-text-muted">{sub}</div>
    </>
  );
}

function Disclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-[18px] border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="pf-transition flex w-full items-center justify-between gap-5 px-6 py-5 text-left hover:bg-surface-2"
      >
        <span className="flex flex-col gap-1.5">
          <span className="text-[17px] font-semibold text-text-primary">{title}</span>
          <span className="text-[14px] leading-[1.55] text-text-muted">{summary}</span>
        </span>
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border font-mono-num text-[18px] text-accent" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="border-t border-border px-6 py-6">{children}</div>}
    </section>
  );
}

function Hero() {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-[26px] pb-13 pt-[72px]">
      <div className="flex max-w-[720px] flex-col items-start gap-5">
        <div className="font-mono-num text-[11px] tracking-[0.16em] text-accent">
          {tr(locale, "CALCULATION FRAMEWORK", "МОДЕЛЬ РАСЧЁТА")}
        </div>
        <h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.032em] text-text-primary sm:text-[56px]">
          {tr(locale, "How PerpFarm estimates route cost", "Как PerpFarm считает стоимость маршрута")}
        </h1>
        <p className="text-[17px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "PerpFarm ranks eligible hedge routes by their estimated full-cycle cost at the volume you enter. It does not predict how many points a protocol will emit.",
            "PerpFarm ранжирует доступные хедж-маршруты по расчётной полной стоимости цикла для указанного объёма. Сайт не пытается предсказать, сколько поинтов выдаст протокол.",
          )}
        </p>
      </div>
      <div
        className="overflow-hidden rounded-[20px] border"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(180deg, #10162a, #0a0e18)" }}
      >
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono-num text-[11px] uppercase tracking-[0.1em]" style={{ color: "#8b96ad" }}>
            {tr(locale, "Hedge route", "Хедж-маршрут")}
          </div>
          <div className="flex items-center gap-5 text-[12px]" style={{ color: "#8b96ad" }}>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4d8dff" }} />
              {tr(locale, "Long leg", "LONG-ножка")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#f2746e" }} />
              {tr(locale, "Short leg", "SHORT-ножка")}
            </span>
          </div>
        </div>
        <RouteMap mode="checkpoints" height={320} />
      </div>
    </div>
  );
}

function CostModel() {
  const locale = useLocale();
  const step = (label: string, tone: "long" | "short") => (
    <span
      className={`rounded-[11px] border px-3.5 py-2.5 font-mono-num text-[13px] ${
        tone === "long"
          ? "border-positive/25 bg-positive/[0.06] text-positive"
          : "border-negative/25 bg-negative/[0.06] text-negative"
      }`}
    >
      {label}
    </span>
  );

  return (
    <section>
      <H2
        title={tr(locale, "How a route cost is built", "Из чего складывается стоимость маршрута")}
        sub={tr(
          locale,
          "Routes are ranked by their complete hedge-cycle cost, not by the published trading fee alone.",
          "Маршруты ранжируются по полной стоимости хедж-цикла, а не только по опубликованной торговой комиссии.",
        )}
      />
      <Disclosure
        title={tr(locale, "Calculation details", "Детали расчёта")}
        summary={tr(
          locale,
          "Order execution is measured at your size; net funding is added for the holding period.",
          "Исполнение ордеров измеряется для вашего размера позиции; чистый фандинг добавляется за период удержания.",
        )}
      >
        <div className="flex flex-col gap-6">
          <div>
            <div className="pb-3 font-mono-num text-[11px] uppercase tracking-[0.1em] text-accent">
              {tr(locale, "Full hedge cycle", "Полный хедж-цикл")}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {step(tr(locale, "LONG entry", "Вход LONG"), "long")}
              <span className="font-mono-num text-[16px] text-text-dim">+</span>
              {step(tr(locale, "LONG exit", "Выход LONG"), "long")}
              <span className="font-mono-num text-[16px] text-text-dim">+</span>
              {step(tr(locale, "SHORT entry", "Вход SHORT"), "short")}
              <span className="font-mono-num text-[16px] text-text-dim">+</span>
              {step(tr(locale, "SHORT exit", "Выход SHORT"), "short")}
            </div>
          </div>

          <div className="rounded-[14px] border border-warning/20 bg-warning/[0.05] px-4 py-4">
            <div className="font-mono-num text-[11px] uppercase tracking-[0.1em] text-warning">
              {tr(locale, "During the hold: net funding", "Во время удержания: чистый фандинг")}
            </div>
            <p className="pt-2 text-[14px] leading-[1.65] text-text-muted">
              {tr(
                locale,
                "The four order actions happen when a hedge is opened or closed. Funding is separate because it accumulates while positions remain open and can be either a cost or a credit.",
                "Четыре ордерных действия происходят при открытии и закрытии хеджа. Фандинг показан отдельно, потому что он накапливается, пока позиции открыты, и может быть как расходом, так и доходом.",
              )}
            </p>
          </div>

          <div className="grid gap-3.5 md:grid-cols-3">
            <div className="rounded-[14px] bg-surface-2 p-4">
              <div className="text-[15px] font-semibold text-text-primary">{tr(locale, "Your volume", "Ваш объём")}</div>
              <p className="pt-2 text-[14px] leading-[1.65] text-text-muted">
                {tr(
                  locale,
                  "The entered volume is turnover per account, not one order. $20,000 per account means a $10,000 entry and a $10,000 exit on each account — a $40,000 two-account cycle.",
                  "Указанный объём — это оборот на одном аккаунте, а не размер одного ордера. $20,000 на аккаунт означает вход на $10,000 и выход на $10,000 на каждом аккаунте — полный цикл двух аккаунтов на $40,000.",
                )}
              </p>
            </div>
            <div className="rounded-[14px] bg-surface-2 p-4">
              <div className="text-[15px] font-semibold text-text-primary">{tr(locale, "Execution cost", "Стоимость исполнения")}</div>
              <p className="pt-2 text-[14px] leading-[1.65] text-text-muted">
                {tr(
                  locale,
                  "The estimate uses the spread and quote impact observed at your order size. This is why a zero published fee can still have a real execution cost.",
                  "Оценка использует спред и влияние ордера на котировку, наблюдаемое для вашего размера. Поэтому даже при нулевой опубликованной комиссии у исполнения может быть реальная стоимость.",
                )}
              </p>
            </div>
            <div className="rounded-[14px] bg-surface-2 p-4">
              <div className="text-[15px] font-semibold text-text-primary">{tr(locale, "Typical 24h range", "Типичный диапазон за 24ч")}</div>
              <p className="pt-2 text-[14px] leading-[1.65] text-text-muted">
                {tr(
                  locale,
                  "The range shows the middle half of observed estimates from the last 24 hours, so brief unusually cheap or expensive quotes do not dominate the result.",
                  "Диапазон показывает среднюю половину наблюдаемых оценок за последние 24 часа, чтобы кратковременные необычно дешёвые или дорогие котировки не искажали результат.",
                )}
              </p>
            </div>
          </div>
        </div>
      </Disclosure>
    </section>
  );
}

function DataStatus() {
  const locale = useLocale();
  const row = (label: string, state: string, tone: "positive" | "warning" | "dim") => (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-[14px] text-text-primary">{label}</span>
      <span className={`font-mono-num text-[11px] ${tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : "text-text-dim"}`}>
        {state}
      </span>
    </div>
  );

  return (
    <section className="pt-13">
      <H2
        title={tr(locale, "What is measured and what is estimated", "Что измерено, а что оценено")}
        sub={tr(
          locale,
          "The route is a planning estimate: current market data is observed, while the future hold cannot be known in advance.",
          "Маршрут — это оценка для планирования: текущие рыночные данные наблюдаются, а будущее во время удержания заранее неизвестно.",
        )}
      />
      <Disclosure
        title={tr(locale, "Show data status", "Показать статус данных")}
        summary={tr(
          locale,
          "See which inputs come from current data and which parts of a future route remain estimates.",
          "Посмотрите, какие входные данные берутся из текущего рынка, а какие части будущего маршрута остаются оценкой.",
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[14px] border border-positive/20 bg-positive/[0.035] p-5">
            <div className="flex items-center gap-2.5 pb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              <div className="text-[16px] font-semibold text-text-primary">{tr(locale, "Observed now or over the last 24h", "Наблюдается сейчас или за последние 24ч")}</div>
            </div>
            {row(tr(locale, "Current quotes", "Текущие котировки"), tr(locale, "live", "в реальном времени"), "positive")}
            {row(tr(locale, "Spread and quote impact at your size", "Спред и влияние ордера для вашего размера"), tr(locale, "observed", "наблюдаемо"), "positive")}
            {row(tr(locale, "Open interest and 24h volume", "Открытый интерес и объём за 24ч"), tr(locale, "observed", "наблюдаемо"), "positive")}
            {row(tr(locale, "Typical 24h cost range", "Типичный диапазон стоимости за 24ч"), tr(locale, "observed", "наблюдаемо"), "positive")}
          </div>
          <div className="rounded-[14px] border border-warning/20 bg-warning/[0.035] p-5">
            <div className="flex items-center gap-2.5 pb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              <div className="text-[16px] font-semibold text-text-primary">{tr(locale, "Estimated or not predicted", "Оценивается или не прогнозируется")}</div>
            </div>
            {row(tr(locale, "Exit quote and funding during the hold", "Котировка выхода и фандинг во время удержания"), tr(locale, "estimated", "оценка"), "warning")}
            {row(tr(locale, "Limit-order fill", "Исполнение LIMIT-ордера"), tr(locale, "not predicted", "не прогнозируется"), "dim")}
            {row(tr(locale, "Future point emissions", "Будущая эмиссия поинтов"), tr(locale, "not predicted", "не прогнозируется"), "dim")}
            {row(tr(locale, "Future competition rules", "Будущие правила турниров"), tr(locale, "not predicted", "не прогнозируется"), "dim")}
          </div>
        </div>
      </Disclosure>
    </section>
  );
}

function ProtocolRulesNote() {
  const locale = useLocale();
  return (
    <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-[18px] border border-border bg-surface-1 px-6 py-5 sm:flex-row sm:items-center">
      <p className="max-w-[760px] text-[14px] leading-[1.65] text-text-muted">
        {tr(
          locale,
          "Protocol-specific point rules, eligible markets and current activities are listed on each protocol page.",
          "Правила начисления поинтов, доступные рынки и текущие активности указаны на странице каждого протокола.",
        )}
      </p>
      <Link href="/#protocols" className="pf-transition whitespace-nowrap text-[14px] font-medium text-accent hover:text-accent-hover">
        {tr(locale, "Explore protocols", "К протоколам")} <span className="font-mono-num">→</span>
      </Link>
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
        <CostModel />
        <DataStatus />
        <ProtocolRulesNote />

        <div className="mt-14 flex flex-col items-start justify-between gap-5 rounded-[20px] border border-accent/20 px-8 py-8 sm:flex-row sm:items-center" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}>
          <div className="flex flex-col gap-2">
            <div className="text-[24px] font-bold tracking-[-0.02em] text-text-primary">{tr(locale, "See the model applied", "Смотрите модель в действии")}</div>
            <div className="text-[15px] text-text-muted">{tr(locale, "Every protocol page applies this calculation to current market data.", "Каждая страница протокола применяет этот расчёт к текущим рыночным данным.")}</div>
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
