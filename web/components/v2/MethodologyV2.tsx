"use client";

import Link from "next/link";
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
      <div className="rounded-[20px] border border-accent/20 p-6 sm:p-8" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), var(--surface-1) 55%)" }}>
        <div className="font-mono-num text-[11px] uppercase tracking-[0.1em] text-accent">
          {tr(locale, "Full hedge cycle", "Полный хедж-цикл")}
        </div>
        <div className="pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {step(tr(locale, "LONG entry", "Вход LONG"), "long")}
            <span className="font-mono-num text-[16px] text-text-dim">+</span>
            {step(tr(locale, "LONG exit", "Выход LONG"), "long")}
            <span className="font-mono-num text-[16px] text-text-dim">+</span>
            {step(tr(locale, "SHORT entry", "Вход SHORT"), "short")}
            <span className="font-mono-num text-[16px] text-text-dim">+</span>
            {step(tr(locale, "SHORT exit", "Выход SHORT"), "short")}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="font-mono-num text-[16px] text-text-dim">+</span>
            <span className="rounded-[11px] border border-warning/25 bg-warning/[0.06] px-3.5 py-2.5 font-mono-num text-[13px] text-warning">
              {tr(locale, "net funding during the hold", "чистый фандинг во время удержания")}
            </span>
          </div>
        </div>

        <div className="mt-6 max-w-[900px] border-t border-border pt-5 text-[15px] leading-[1.68] text-text-muted">
          {tr(
            locale,
            "In plain words: route cost = your position size × the observed spread and quote impact on the MARKET orders + net funding while the hedge is held.",
            "Простыми словами: стоимость маршрута = размер позиции × наблюдаемые спред и влияние MARKET-ордеров на котировку + чистый фандинг за время удержания хеджа.",
          )}
        </div>

        <div className="mt-5 grid gap-3.5 md:grid-cols-3">
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
    </section>
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
