"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { EmptyNote } from "@/components/v2/EmptyNote";
import { FdvMarketsV2 } from "@/components/v2/FdvMarketsV2";
import { InfoTip } from "@/components/v2/InfoTip";
import { MarketActivityV2 } from "@/components/v2/MarketActivityV2";
import { ProtocolCalculatorV2 } from "@/components/v2/ProtocolCalculatorV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { protocolPageConfig, type ActivityConfig, type HedgePartnerCard, type PointsConfig, type ProtocolPageConfig, type ProtocolSlug } from "@/lib/protocol-page";
import type { VenueSummary } from "@/lib/types";
import { protocolName } from "@/lib/venue-status";

/**
 * THE protocol page. One layout, one set of words, one set of controls, for
 * every protocol; the Variational page is the reference it was taken from.
 *
 * Everything that differs between protocols arrives as content through
 * `lib/protocol-page.ts`. Nothing here branches on a slug except where a
 * protocol genuinely has no such thing (no running campaign, no points
 * programme) -- and those cases render a stated empty state, never a gap.
 *
 * Anything truly unique to one protocol is passed in as `extras` rather than
 * added here, so it cannot silently become part of the reference.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{children}</h2>;
}

function compactPoints(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/0$/, "")}M`;
  return `${Math.round(value / 1_000)}K`;
}

function countdown(now: number, nextDrop: number): string {
  const s = Math.max(0, Math.floor((nextDrop - now) / 1_000));
  const p = [Math.floor(s / 86_400), Math.floor((s % 86_400) / 3_600), Math.floor((s % 3_600) / 60), s % 60];
  return `${p[0]}d ${String(p[1]).padStart(2, "0")}:${String(p[2]).padStart(2, "0")}:${String(p[3]).padStart(2, "0")}`;
}

function pointsProgress(points: Extract<PointsConfig, { kind: "season" }>, now: number) {
  const weeksSinceAnchor = Math.max(0, Math.floor((now - points.weekAnchorUtc) / WEEK_MS));
  const weeksFarmed = points.weeksAtAnchor + weeksSinceAnchor;
  const remaining = Math.max(0, points.remainingAtAnchor - weeksSinceAnchor * points.weeklyDrop);
  const distributed = points.basePoints + weeksFarmed * points.weeklyDrop + points.completedCampaigns * points.perCampaign;
  return {
    distributed,
    remaining,
    weeksFarmed,
    weeksRemaining: Math.ceil(remaining / points.weeklyDrop),
    nextDrop: points.weekAnchorUtc + (weeksSinceAnchor + 1) * WEEK_MS,
    pct: Math.round((distributed / (distributed + remaining)) * 100),
  };
}

/* ---- sections ---- */

function Hero({ config }: { config: ProtocolPageConfig }) {
  const locale = useLocale();
  return (
    <>
      <div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim">
        <Link href="/#protocols" className="pf-transition text-text-muted hover:text-text-primary">
          {tr(locale, "Protocols", "Протоколы")}
        </Link>
        <span>/</span>
        <span className="text-text-primary">{config.name}</span>
      </div>
      <div className="flex flex-col items-start justify-between gap-6 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div className="flex items-center gap-4">
          <ProtocolMark slug={config.slug} name={config.name} size={52} radius={14} />
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] font-bold tracking-[-0.022em] text-text-primary">{config.name}</h1>
            <div className="flex items-center gap-3.5">
              <a href={config.twitterUrl} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Twitter ↗</a>
              <a href={config.docsUrl} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Docs ↗</a>
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-2.5">
          {config.heroMetrics.map((metric) => (
            <div key={metric.label} className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-border bg-surface-1 px-3 py-2.5 sm:rounded-[14px] sm:px-4 sm:py-3.5">
              <div className="flex min-h-[26px] items-start gap-1.5 text-[10px] font-medium leading-[1.3] text-text-muted sm:min-h-0 sm:items-center sm:text-[11px]">
                {metric.label}
                {metric.tip ? <InfoTip text={metric.tip} /> : null}
              </div>
              {/* Numbers must never wrap mid-value; a multi-word value has to,
                  or it overflows the third of a phone screen it gets. */}
              <div
                className={`font-mono-num text-[16px] sm:text-[18px] ${metric.value.includes(" ") ? "leading-tight" : "whitespace-nowrap leading-none"} ${metric.valueClass ?? "text-text-primary"}`}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GuidancePanel({ config }: { config: ProtocolPageConfig }) {
  const locale = useLocale();
  const { guidance } = config;
  return (
    <section
      className="mt-11 rounded-[20px] border p-6 sm:p-[30px]"
      style={{ borderColor: "rgba(77,141,255,0.2)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}
    >
      <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{guidance.kicker}</div>
      <p className="pt-2 text-[15px] leading-[1.6] text-text-muted">{guidance.intro}</p>

      <div className="grid gap-3 pt-5 sm:grid-cols-2">
        {guidance.priorities.map((priority) => (
          <div key={priority.label} className={`rounded-[18px] border p-5 ${priority.primary ? "border-accent/45 bg-surface-2" : "border-border bg-bg/45"}`}>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 font-mono-num text-[11px] font-semibold uppercase tracking-[0.04em] ${priority.primary ? "bg-accent text-white" : "bg-surface-2 text-text-primary"}`}>
                {priority.label}
              </span>
              <span className="text-[13px] text-text-muted">{priority.kicker}</span>
            </div>
            <h3 className="pt-4 text-[19px] font-semibold tracking-[-0.018em] text-text-primary">{priority.title}</h3>
            <p className="pt-2.5 text-[14px] leading-[1.6] text-text-muted">{priority.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-border/80 pt-6">
        <h3 className="text-[15px] font-semibold text-text-primary">{tr(locale, "Practical tips", "Практические советы")}</h3>
        <ol className="grid gap-3 pt-4 sm:grid-cols-2">
          {guidance.tips.map((tip) => (
            <li key={tip.n} className="flex gap-3.5 rounded-2xl border border-border bg-bg/45 p-[18px]">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent font-mono-num text-[11px] font-medium text-white">{tip.n}</span>
              <span className="flex flex-col gap-1.5">
                <span className="text-[15px] font-semibold text-text-primary">{tip.title}</span>
                <span className="text-[13px] leading-[1.6] text-text-muted">{tip.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <a href={guidance.docsUrl} target="_blank" rel="noreferrer" className="mt-5 inline-block text-[13px] font-semibold text-accent hover:text-accent-hover">
        {guidance.docsLabel}
      </a>
    </section>
  );
}

function HedgeCard({
  homeSlug,
  homeName,
  partnerSlug,
  body,
  tags,
  linked,
  tip,
}: {
  homeSlug: ProtocolSlug;
  homeName: string;
  partnerSlug: string;
  body: string;
  tags: Array<[string, "ok" | "warn" | "neutral"]>;
  linked: boolean;
  tip?: string;
}) {
  const partner = protocolName(partnerSlug) ?? homeName;
  return (
    <div className="relative flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]">
      {tip ? <div className="absolute right-4 top-4"><InfoTip text={tip} /></div> : null}
      <div className="flex items-center gap-1.5 text-[16px] font-semibold text-text-primary">
        <ProtocolMark slug={homeSlug} name={homeName} size={22} radius={7} />
        <span>{homeName} ×</span>
        <ProtocolMark slug={partnerSlug} name={partner} size={22} radius={7} />
        {linked ? (
          <Link href={`/${partnerSlug}`} className="pf-transition hover:text-accent">
            <span className="underline decoration-accent/70 underline-offset-4">{partner}</span>
            <span aria-hidden>↗</span>
          </Link>
        ) : (
          <span>{partner}</span>
        )}
      </div>
      <div className="text-[14px] leading-[1.62] text-text-muted">{body}</div>
      <div className="mt-auto flex gap-2">
        {tags.map(([text, tone]) => (
          <span
            key={text}
            className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              tone === "ok"
                ? "border-positive/30 bg-positive/10 text-positive"
                : tone === "warn"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-surface-2 text-text-muted"
            }`}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

function HedgeRecommendations({ config }: { config: ProtocolPageConfig }) {
  const locale = useLocale();
  // The hourly worker has already compared self-match and every venue. The
  // browser only asks for that stored result.
  const [cheapest, setCheapest] = useState<{ partnerSlug: string; cycleCostUsd: number } | null>(null);
  // "Lowest cost" is a claim about a computed comparison. Until one has been
  // loaded the card must not make it, on any protocol.
  const [routeStatus, setRouteStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    fetch(`/api/venues/${config.slug}/cheapest-route`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        // A partner is accepted only if it resolves to a listed protocol.
        // Anything else -- a fixture venue, a retired slug -- is treated as no
        // answer rather than printing a raw database slug.
        if (!d?.partnerSlug || !protocolName(d.partnerSlug) || typeof d.cycleCostUsd !== "number" || !Number.isFinite(d.cycleCostUsd)) {
          setRouteStatus("unavailable");
          return;
        }
        setCheapest(d);
        setRouteStatus("ready");
      })
      .catch(() => {
        if (active) setRouteStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [config.slug]);

  const partner: HedgePartnerCard = config.hedge.partner;
  const cheapestSlug = cheapest?.partnerSlug ?? config.slug;
  return (
    <div className="mt-11">
      <H2>{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</H2>
      <div className="pb-4 pt-1.5 text-[14px] text-text-muted">{config.hedge.intro}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <HedgeCard
          homeSlug={config.slug}
          homeName={config.name}
          partnerSlug={cheapestSlug}
          linked={cheapestSlug !== config.slug}
          tip={tr(locale, "Updates hourly.", "Обновляется раз в час.")}
          body={
            routeStatus === "ready"
              ? tr(locale, "Approved delta-neutral setup with two accounts — the lowest-cost route.", "Одобренный дельта-нейтральный сетап с двумя аккаунтами — маршрут с минимальной стоимостью.")
              : routeStatus === "loading"
                ? tr(locale, "Comparing routes…", "Сравниваем маршруты…")
                : tr(
                    locale,
                    "Approved delta-neutral setup with two accounts. The hourly route comparison is unavailable right now, so no cheapest route is claimed.",
                    "Одобренный дельта-нейтральный сетап с двумя аккаунтами. Часовое сравнение маршрутов сейчас недоступно, поэтому самый дешёвый маршрут не заявляется.",
                  )
          }
          tags={
            routeStatus === "ready"
              ? [[tr(locale, "Lowest cost", "Дешевле всего"), "ok"], [tr(locale, "Two accounts needed", "Нужно 2 аккаунта"), "neutral"]]
              : [[tr(locale, "Two accounts needed", "Нужно 2 аккаунта"), "neutral"]]
          }
        />
        <HedgeCard
          homeSlug={config.slug}
          homeName={config.name}
          partnerSlug={partner.slug}
          linked
          body={partner.body}
          tags={partner.tags}
        />
      </div>
    </div>
  );
}

function ActivityCard({ activity, now }: { activity: ActivityConfig; now: number }) {
  const locale = useLocale();
  const title = tr(locale, "Protocol activity", "Активность протокола");
  const live = activity.kind === "campaign" && now >= activity.startUtc && now < activity.endUtc;

  if (activity.kind === "campaign" && live) {
    return (
      <div className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface-1 p-[22px]">
        <div className="text-[17px] font-semibold text-text-primary">{title}</div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="text-[17px] font-semibold text-text-primary">{activity.name}</div>
            <div className="font-mono-num text-[12px] text-text-muted">{activity.meta}</div>
          </div>
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
            <span className="h-[5px] w-[5px] rounded-full bg-positive" />
            {tr(locale, "Active", "Активно")}
          </span>
        </div>
        <div className="text-[14px] leading-[1.62] text-text-muted">{activity.body}</div>
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-text-muted">
          <span className="text-[11px] uppercase tracking-[0.1em] text-text-dim">{activity.eligibleLabel}</span>
          <span className="text-text-primary">{activity.eligibleValue}</span>
        </div>
        <a href={activity.rulesUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-accent hover:text-accent-hover">
          {tr(locale, "Competition rules ↗", "Правила конкурса ↗")}
        </a>
      </div>
    );
  }

  // Nothing running. An empty slot would read as us forgetting to update it,
  // so the absence is stated explicitly -- the same on every protocol.
  // The heading sits at the top like every other card's: centring the whole
  // column pushed it down and left it out of line with the panel beside it.
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface-1 p-[22px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[17px] font-semibold text-text-primary">{title}</div>
        <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-muted">
          <span className="h-[5px] w-[5px] rounded-full bg-text-dim" />
          {tr(locale, "Inactive", "Неактивно")}
        </span>
      </div>
      <EmptyNote className="flex-1">
        {tr(
          locale,
          "Right now there is no competition or bonus that would increase the number of points you earn or lower their cost. We track this and it will appear here as soon as one starts.",
          "Сейчас нет соревнований или бонусов, которые увеличили бы количество поинтов или снизили их стоимость. Мы это отслеживаем — как только что-то начнётся, оно появится здесь.",
        )}
      </EmptyNote>
      {activity.kind === "campaign" && <div className="text-[13px] text-text-dim">{activity.endedNote}</div>}
    </div>
  );
}

function PointsCard({ points, now }: { points: PointsConfig; now: number }) {
  const locale = useLocale();
  const title = tr(locale, "Points distribution", "Раздача поинтов");

  if (points.kind === "none") {
    return (
      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface-1 p-[22px]">
        <div className="text-[17px] font-semibold text-text-primary">{title}</div>
        <EmptyNote className="flex-1">{tr(locale, "No points yet", "Поинтов пока нет")}</EmptyNote>
      </div>
    );
  }

  const p = pointsProgress(points, now);
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface-1 p-[22px]">
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-semibold text-text-primary">{title}</div>
        <div className="font-mono-num text-[12px] text-text-dim">{points.seasonLabel}</div>
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: "linear-gradient(90deg, var(--accent), #7fb0ff)" }} />
        </div>
        <div className="flex justify-between pt-2 text-[12px] text-text-muted">
          <span>{tr(locale, "Distributed", "Роздано")} <span className="font-mono-num text-text-primary">{compactPoints(p.distributed)}</span></span>
          <span>{tr(locale, "Remaining", "Осталось")} <span className="font-mono-num text-text-primary">{compactPoints(p.remaining)}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          [tr(locale, "Weeks farmed", "Недель фарма"), String(p.weeksFarmed), "text-text-primary"],
          [tr(locale, "Weekly drop", "В неделю"), `+${compactPoints(points.weeklyDrop)}`, "text-positive"],
          [tr(locale, "Weeks left", "Недель"), String(p.weeksRemaining), "text-text-primary"],
          [tr(locale, "Next drop", "След. дроп"), "", "text-text-primary"],
        ].map(([label, value, cls], i) => (
          <div key={label} className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
            <div className="text-[11px] text-text-muted">{label}</div>
            {i === 3 ? (
              <div suppressHydrationWarning className="font-mono-num text-[14px] text-text-primary">{countdown(now, p.nextDrop)}</div>
            ) : (
              <div className={`font-mono-num text-[16px] ${cls}`}>{value}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityAndDistribution({ config }: { config: ProtocolPageConfig }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="mt-11">
      <div className="grid gap-4 lg:grid-cols-2">
        <ActivityCard activity={config.activity} now={now} />
        <PointsCard points={config.points} now={now} />
      </div>
    </div>
  );
}

/* ---- page ---- */

export function ProtocolPageV2({
  slug,
  otherVenues,
  extras,
}: {
  slug: ProtocolSlug;
  otherVenues: VenueSummary[];
  /** Sections unique to ONE protocol, appended after the reference layout. */
  extras?: React.ReactNode;
}) {
  const locale = useLocale();
  const config = protocolPageConfig(slug, locale);
  return (
    <div>
      <SiteHeaderV2 />
      <div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10">
        <Hero config={config} />
        <GuidancePanel config={config} />

        {/* General hedge guidance comes before the calculator, so the reader
            can choose the right counterparty before running a route. */}
        <HedgeRecommendations config={config} />

        {/* Live calculator + recommended route + 10-pairs table. */}
        <ProtocolCalculatorV2 otherVenues={otherVenues} venueSlug={slug} />

        {/* Points distribution belongs with the market charts, below the route
            decision rather than above the calculator. */}
        <ActivityAndDistribution config={config} />

        {/* Prediction-market FDV expectations sit before the activity chart. */}
        <FdvMarketsV2 venueSlug={slug} />

        {/* Market-activity chart (live activity API). */}
        <MarketActivityV2 venueSlug={slug} />

        {extras}

        <div className="mt-14 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted">
          <span>{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span>
        </div>
      </div>
    </div>
  );
}
