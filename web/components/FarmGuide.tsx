"use client";

import Link from "next/link";
import { tr, useLocale } from "@/components/LocaleProvider";

export function FarmGuide() {
  const locale = useLocale();

  return (
    <section className="flex w-full max-w-xl flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{tr(locale, "How to farm perp points", "Как фармить perp-поинты")}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {tr(locale, "PerpFarm is a guide to point farming: it identifies the activity a protocol rewards, then compares routes after fees, spread, quote impact, funding and the holding period.", "PerpFarm — гайд по фарму поинтов: он определяет, какую активность вознаграждает протокол, и сравнивает маршруты с учётом комиссий, спреда, impact котировки, funding и срока удержания.")}
        </p>
      </div>

      <div className="rounded-md border border-accent/30 bg-accent/10 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">{tr(locale, "Current recommendation", "Текущая рекомендация")}</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-semibold text-text-primary">Variational · Cheapest</p>
          <span className="font-mono-num text-sm text-text-primary">$5–7 / pt</span>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          {tr(locale, "The current farming setup favours medium-OI markets with a 12–24h hold. Variational is the only venue with a confirmed points program and live execution inputs in PerpFarm; its emission formula is not public, so this remains a planning estimate.", "Текущий сценарий фарма предпочитает рынки со средним OI и удержание 12–24 ч. Variational — единственная площадка с подтверждённой программой поинтов и live-данными исполнения в PerpFarm; формула эмиссии не публична, поэтому это плановая оценка.")}
        </p>
        <Link href="/variational" className="mt-3 inline-flex text-sm text-accent hover:text-accent-hover">{tr(locale, "Open Variational analysis →", "Открыть анализ Variational →")}</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="font-medium text-text-primary">{tr(locale, "What earns more points", "За что обычно дают больше поинтов")}</p>
          <p className="mt-1 text-xs text-text-muted">{tr(locale, "It depends on the protocol: volume, eligible pairs, holding time, OI, tiers, referrals and competitions can all matter. PerpFarm shows only factors that have been verified for each venue.", "Это зависит от протокола: значение могут иметь объём, eligible-пары, срок удержания, OI, tiers, рефералы и турниры. PerpFarm показывает только подтверждённые факторы каждой площадки.")}</p>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <p className="font-medium text-text-primary">{tr(locale, "Next venues", "Следующие площадки")}</p>
          <p className="mt-1 text-xs text-text-muted">{tr(locale, "TxFlow and RiseX are not recommendations yet: points mechanics, eligible activity and fees are not verified. TxFlow’s RWA focus alone is not enough to call a route profitable.", "TxFlow и RiseX пока не рекомендация: механика поинтов, eligible-активность и комиссии не подтверждены. Одного RWA-фокуса TxFlow недостаточно, чтобы назвать маршрут выгодным.")}</p>
          <p className="mt-2 font-mono-num text-xs font-semibold text-text-primary">SOON</p>
        </div>
      </div>
    </section>
  );
}
