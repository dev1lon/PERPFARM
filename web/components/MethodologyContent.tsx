"use client";

import { tr, useLocale } from "@/components/LocaleProvider";

export function MethodologyContent() {
  const locale = useLocale();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-20 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-text-primary">{tr(locale, "Methodology", "Методология")}</h1>
        <p className="font-mono-num text-sm text-text-muted">{tr(locale, "Updated 2026-07-16", "Обновлено 16.07.2026")}</p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "What “cost per point” means", "Что означает «цена поинта»")}</h2>
        <p className="leading-relaxed text-text-muted">
          {tr(locale, "We combine trading fees, crossed spread, price impact at the selected size, and funding. The total is compared with points earned by the same volume. When a venue does not publish points per volume, PerpFarm marks the result as a planning estimate.", "Мы объединяем торговые комиссии, пересечённый спред, влияние на цену при выбранном размере и funding. Итог сравнивается с поинтами за тот же объём. Если площадка не публикует поинты за объём, PerpFarm помечает результат как плановую оценку.")}
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "Where data comes from", "Откуда берутся данные")}</h2>
        <p className="leading-relaxed text-text-muted">
          {tr(locale, "Prices, quotes, open interest and funding come from public perp-dex APIs. Fee schedules are verified from public venue documentation. Reward tiers, referral multipliers and competition terms remain separate assumptions when the protocol has not published a complete emissions formula.", "Цены, котировки, open interest и funding берутся из публичных API perp-dex. Комиссии проверяются по публичной документации площадок. Reward tiers, referral-множители и условия конкурсов остаются отдельными допущениями, если протокол не опубликовал полную формулу эмиссии.")}
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "Limits of the model", "Ограничения модели")}</h2>
        <p className="leading-relaxed text-text-muted">
          {tr(locale, "Point weights, eligibility and market liquidity can change without notice. Real execution may differ from displayed quotes. Treat every value as an estimate and check the current venue rules before relying on it.", "Веса поинтов, eligibility и ликвидность могут меняться без предупреждения. Реальное исполнение может отличаться от показанных котировок. Считайте каждое значение оценкой и проверяйте актуальные правила площадки перед использованием.")}
        </p>
      </section>
      <div className="border-t border-border pt-6 text-sm text-text-muted">
        {tr(locale, "Estimates from public data · not financial advice", "Оценки на основе публичных данных · не финансовый совет")}
      </div>
    </div>
  );
}
