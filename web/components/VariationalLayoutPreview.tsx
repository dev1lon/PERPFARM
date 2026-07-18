"use client";

import { useEffect, useState } from "react";
import { PerpIdentity } from "@/components/PerpIdentity";
import { tr, useLocale } from "@/components/LocaleProvider";
import { VariationalMarketActivity } from "@/components/VariationalMarketActivity";
import { VenueWizard } from "@/components/VenueWizard";
import type { VenueSummary } from "@/lib/types";

const INITIAL_POINTS_DISTRIBUTED = 7_560_000;
const INITIAL_POINTS_REMAINING = 1_650_000;
const WEEKLY_POINT_DISTRIBUTION = 150_000;
const FIRST_TRACKED_DROP_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

function pointsProgress(now: number) {
  const completedDrops = now < FIRST_TRACKED_DROP_UTC
    ? 0
    : Math.min(
      Math.floor((now - FIRST_TRACKED_DROP_UTC) / WEEK_MS) + 1,
      Math.ceil(INITIAL_POINTS_REMAINING / WEEKLY_POINT_DISTRIBUTION)
    );
  const remaining = Math.max(0, INITIAL_POINTS_REMAINING - completedDrops * WEEKLY_POINT_DISTRIBUTION);
  return {
    distributed: INITIAL_POINTS_DISTRIBUTED + completedDrops * WEEKLY_POINT_DISTRIBUTION,
    remaining,
    weeksRemaining: Math.ceil(remaining / WEEKLY_POINT_DISTRIBUTION),
    nextDrop: FIRST_TRACKED_DROP_UTC + completedDrops * WEEK_MS,
  };
}

function compactPoints(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/0$/, "")}M`;
  return `${Math.round(value / 1_000)}K`;
}

function countdown(now: number, nextDrop: number): string {
  const seconds = Math.max(0, Math.floor((nextDrop - now) / 1_000));
  const parts = [
    Math.floor(seconds / 86_400),
    Math.floor((seconds % 86_400) / 3_600),
    Math.floor((seconds % 3_600) / 60),
    seconds % 60,
  ];
  return parts.map((value) => String(value).padStart(2, "0")).join(" : ");
}

function PreviewPointsDistribution({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = pointsProgress(now);
  const metrics = [
    [tr(locale, "Distributed", "Роздано"), compactPoints(progress.distributed)],
    [tr(locale, "Remaining", "Осталось"), compactPoints(progress.remaining)],
    [tr(locale, "Weekly drop", "Раздача в неделю"), `+${compactPoints(WEEKLY_POINT_DISTRIBUTION)}`],
    [tr(locale, "Left", "Осталось"), `${progress.weeksRemaining} ${tr(locale, "weeks", "недель")}`],
  ];

  return (
    <section className={`rounded-[1.75rem] border border-border bg-surface-1 p-6 ${className}`}>
      <h2 className="text-xl font-semibold tracking-tight text-text-primary">{tr(locale, "Points distribution", "Раздача поинтов")}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 px-4 py-3">
            <p className="text-sm text-text-muted">{label}</p>
            <p className="mt-1 font-mono-num text-xl text-text-primary">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-center">
        <p className="text-sm text-text-muted">{tr(locale, "Next drop", "Следующая раздача")}</p>
        <p suppressHydrationWarning className="mt-1 font-mono-num text-2xl tracking-wide text-text-primary">{countdown(now, progress.nextDrop)}</p>
      </div>
    </section>
  );
}

const POINT_TIERS: [string, string, string][] = [
  ["Iron", "$0", "+0%"],
  ["Bronze", "$1M", "+0.5%"],
  ["Silver", "$5M", "+1%"],
  ["Gold", "$25M", "+2%"],
  ["Platinum", "$100M", "+3%"],
  ["Diamond", "$750M", "+4%"],
  ["Infinity", "$2.5B", "+5%"],
];

function FactorsAffectingPoints({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(true);
  return (
    <section className={`overflow-hidden rounded-[1.75rem] border border-border bg-surface-1 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pf-transition flex w-full items-center justify-between gap-3 px-6 py-5 text-left hover:bg-surface-hover"
      >
        <span>
          <span className="block text-xl font-semibold tracking-tight text-text-primary">{tr(locale, "Factors affecting points", "Что влияет на поинты")}</span>
          <span className="mt-1 block text-sm text-text-muted">{tr(locale, "Passive limit liquidity, reward tiers, referral boost", "Пассивная лимитная ликвидность, тиры наград, реферальный буст")}</span>
        </span>
        <span className="text-2xl leading-none text-text-muted" aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-border px-6 pb-6 pt-5">
          <p className="text-base leading-7 text-text-muted">
            {tr(locale, "Passive LIMIT orders provide liquidity and are more point-efficient than immediate MARKET orders.", "Пассивные LIMIT-ордера дают ликвидность и эффективнее по поинтам, чем немедленные MARKET-ордера.")}
          </p>
          <p className="mt-3 text-base leading-7 text-text-muted">
            {tr(locale, "Points are distributed every Friday at 00:00 UTC for the previous week. Use a referral link before the first trade; the current campaign claim is a +16% point boost — confirm it on the signup screen.", "Поинты раздаются каждую пятницу в 00:00 UTC за прошлую неделю. Используйте реферальную ссылку до первой сделки; текущий клейм кампании — буст +16% к поинтам — подтвердите его на экране регистрации.")}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2 px-5 py-4 text-base text-text-primary"><span className="text-accent">{tr(locale, "Priority 1", "Приоритет 1")}</span> <span className="text-text-muted">·</span> {tr(locale, "Medium OI, 12–24h hold", "Средний OI, удержание 12–24 ч")}</div>
            <div className="rounded-xl bg-surface-2 px-5 py-4 text-base text-text-primary"><span className="text-text-muted">{tr(locale, "Priority 2", "Приоритет 2")}</span> <span className="text-text-muted">·</span> {tr(locale, "Eligible volume", "Eligible-объём")}</div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="bg-surface-2 text-text-muted">
                  <th className="px-4 py-3 font-medium">{tr(locale, "Tier", "Тир")}</th>
                  <th className="px-4 py-3 font-medium">{tr(locale, "30-day volume to unlock", "Объём за 30 дней")}</th>
                  <th className="px-4 py-3 font-medium">{tr(locale, "Points boost", "Буст поинтов")}</th>
                </tr>
              </thead>
              <tbody>
                {POINT_TIERS.map(([tier, volume, boost]) => (
                  <tr key={tier} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-text-primary">{tier}</td>
                    <td className="px-4 py-3 font-mono-num text-text-muted">{volume}</td>
                    <td className="px-4 py-3 font-mono-num text-text-muted">{boost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm leading-6 text-text-muted">
            {tr(locale, "Tier volume = personal volume + 0.2 × referred volume. The inviter also earns 1 point per 10 points earned by referred users.", "Объём тира = личный объём + 0.2 × объём рефералов. Пригласивший также получает 1 поинт за каждые 10 поинтов, заработанных рефералами.")}
          </p>
        </div>
      )}
    </section>
  );
}

function ProtocolActivityPreview({ className = "" }: { className?: string }) {
  const locale = useLocale();
  return (
    <section className={`rounded-[1.75rem] border border-border bg-surface-1 p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">{tr(locale, "Activity", "Активность")}</h2>
        <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono-num text-xs font-semibold uppercase tracking-wide text-emerald-400">
          {tr(locale, "Active", "Активно")}
        </span>
      </div>
      <article className="mt-5 rounded-xl bg-surface-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-text-muted">{tr(locale, "Trading competition", "Торговый конкурс")}</p>
            <h3 className="mt-1 text-lg font-medium text-text-primary">TradFi Trading Competition #5</h3>
          </div>
          <p className="font-mono-num text-sm text-text-primary">$20,000 {tr(locale, "prizes", "призы")}</p>
        </div>
        <p className="mt-3 text-base leading-7 text-text-muted">
          {tr(locale, "Jul 17, 00:00 UTC — Jul 31, 00:00 UTC. Score: TradFi PnL × √TradFi volume.", "17 июля, 00:00 UTC — 31 июля, 00:00 UTC. Score: TradFi PnL × √TradFi volume.")}
        </p>
        <a
          href="https://docs.variational.io/omni/trading-competition"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex text-sm text-accent hover:text-accent-hover"
        >
          {tr(locale, "Competition rules ↗", "Правила конкурса ↗")}
        </a>
      </article>
    </section>
  );
}

function HedgeRecommendationsPreview({ className = "" }: { className?: string }) {
  const locale = useLocale();
  return (
    <section className={`rounded-[1.75rem] border border-border bg-surface-1 p-6 ${className}`}>
      <h2 className="text-xl font-semibold tracking-tight text-text-primary">{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl bg-surface-2 p-5">
          <h3 className="text-lg font-medium text-text-primary">Variational × Variational</h3>
          <p className="mt-2 text-base leading-7 text-text-muted">{tr(locale, "Approved delta-neutral setup with two accounts, lowest-cost route.", "Разрешённый дельта-нейтральный сетап с двумя аккаунтами — самый дешёвый маршрут.")}</p>
        </article>
        <article className="rounded-xl bg-surface-2 p-5">
          <h3 className="text-lg font-medium text-text-primary">Variational × TxFlow</h3>
          <p className="mt-2 text-base leading-7 text-text-muted">{tr(locale, "Early RWA thesis; manual research for now.", "Ранняя RWA-гипотеза; пока только ручное исследование.")}</p>
        </article>
      </div>
    </section>
  );
}

export function VariationalLayoutPreview({
  otherVenues,
}: {
  otherVenues: VenueSummary[];
}) {
  const locale = useLocale();
  return (
    <main className="min-h-screen bg-bg px-3 py-3 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[1.5rem] bg-bg p-5 sm:p-9">
          <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <h1><PerpIdentity slug="variational" name="Variational" markPx={40} namePx={28} nameClassName="text-3xl" /></h1>
              <p className="text-base text-text-muted"><span className="block sm:inline">{tr(locale, "Season", "Сезон")}</span> 1</p>
              <a href="https://x.com/variational_io" target="_blank" rel="noreferrer" className="text-base text-accent hover:text-accent-hover">Twitter ↗</a>
              <a href="https://docs.variational.io/omni" target="_blank" rel="noreferrer" className="text-base text-accent hover:text-accent-hover">Docs ↗</a>
            </div>
            <div className="flex items-start gap-3 text-right">
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-2.5"><p className="text-sm text-text-muted">{tr(locale, "Farm", "Фарм")}</p><p className="mt-1 font-mono-num text-lg text-emerald-400">$5–11/pt</p></div>
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-2.5"><p className="text-sm text-text-muted">OTC</p><p className="mt-1 font-mono-num text-lg text-text-primary">$21</p></div>
            </div>
          </header>

          <div className="mt-7">
            <VariationalMarketActivity includeUniqueTraders />
          </div>

          {/* Two independent columns (each packs its own content), so the
              collapsible Factors panel can't leave a fixed-row gap or shove
              unrelated panels around the page. */}
          <div className="mt-7 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_27.5rem]">
            <div className="flex flex-col gap-7">
              <FactorsAffectingPoints />
              <ProtocolActivityPreview />
              <HedgeRecommendationsPreview />
            </div>
            <div className="flex flex-col gap-7">
              <PreviewPointsDistribution />
              <VenueWizard venueSlug="variational" otherVenues={otherVenues} layout="sidebar-wide" allowCustomAccountVolume />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
