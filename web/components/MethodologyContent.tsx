"use client";

import { tr, useLocale } from "@/components/LocaleProvider";

export function MethodologyContent() {
  const locale = useLocale();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-20 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-text-primary">{tr(locale, "Methodology", "Методология")}</h1>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "What “cost per point” means", "Что означает «цена поинта»")}</h2>
        <p className="leading-relaxed text-text-muted">
          {tr(locale, "We combine trading fees, crossed spread, price impact at the selected size, and funding into one execution cost. Points per unit of volume aren’t published and their weighting differs from protocol to protocol, so pairs are ranked by that execution cost rather than a computed points ratio. Pairs with less than $1k of 24h volume are treated as dead and left out of the rankings.", "Мы объединяем торговые комиссии, пересечённый спред, влияние на цену при выбранном размере и funding в единую стоимость исполнения. Сколько поинтов даётся за объём — протоколы не публикуют, и веса различаются от протокола к протоколу, поэтому пары ранжируются по этой стоимости исполнения, а не по расчётному отношению к поинтам. Пары с объёмом меньше $1k за 24 часа считаются мёртвыми и исключаются из ранжирования.")}
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "Where data comes from", "Откуда берутся данные")}</h2>
        <p className="leading-relaxed text-text-muted">
          {tr(locale, "Prices, quotes, open interest and funding come from public perp-dex APIs. Fee schedules, reward tiers, referral multipliers and competition terms are verified from the protocol’s public documentation and vary from protocol to protocol. Point prices come from open sources and the perpfarm team’s own experience obtaining them.", "Цены, котировки, open interest и funding берутся из публичных API perp-dex. Комиссии, reward tiers, referral-множители и условия конкурсов проверяются по публичной документации протокола и различаются от протокола к протоколу. Цены за поинт — из открытых источников и опыта их получения командой perpfarm.")}
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "Limits of the model", "Ограничения модели")}</h2>
        <p className="leading-relaxed text-text-muted">
          {tr(locale, "Point weights, eligibility and market liquidity can change without notice. Real execution may differ from displayed quotes. Treat every value as an estimate and check the current protocol rules before relying on it.", "Веса поинтов, eligibility и ликвидность могут меняться без предупреждения. Реальное исполнение может отличаться от показанных котировок. Считайте каждое значение оценкой и проверяйте актуальные правила протокола перед использованием.")}
        </p>
      </section>
      <div className="border-t border-border pt-6 text-sm text-text-muted">
        {tr(locale, "Estimates from public data · not financial advice", "Оценки на основе публичных данных · не финансовый совет")}
      </div>
    </div>
  );
}
