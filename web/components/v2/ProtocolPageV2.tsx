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
import type { ActivityResponse } from "@/lib/activity/types";
import type { CheapestRoute } from "@/lib/cheapest-route";
import type { FdvMarketResponse } from "@/lib/fdv-market";
import { hasProtocolPage, protocolPageConfig, type ActivityConfig, type PointsConfig, type ProtocolPageConfig, type ProtocolSlug } from "@/lib/protocol-page";
import type { VenueSummary } from "@/lib/types";
import { isReadyVenue, protocolName } from "@/lib/venue-status";

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

/**
 * What the SERVER already read for this page, rendered with it.
 *
 * Every card used to ask for its own numbers after the page had painted, so a
 * visitor watched four placeholders fill in one by one. The page is
 * regenerated hourly anyway -- the same window those answers are cached for --
 * so it may as well carry them. A field left out (or a read that failed) puts
 * the card back on its own fetch, which is why every one of them is optional.
 */
export type ProtocolPageData = {
  activity?: ActivityResponse | null;
  cheapestRoute?: CheapestRoute | null;
  /** A broker's comparisons, one per connected book, keyed by venue slug. */
  cheapestRoutes?: Record<string, CheapestRoute>;
  fdvMarkets?: FdvMarketResponse | null;
};

/**
 * What a section says when the protocol has no verified data path yet.
 *
 * The layout is the reference for EVERY protocol, so a listed one that we do
 * not price keeps the same headings and says why they are empty. Dropping the
 * sections instead would leave a differently shaped page and quietly hide that
 * the protocol is listed but unpriced.
 */
function NotPricedYet({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-11">
      <div className="pb-4">
        <H2>{title}</H2>
      </div>
      <EmptyNote className="min-h-[148px] py-6">{body}</EmptyNote>
    </section>
  );
}

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
          <ProtocolMark slug={config.slug} name={config.name} size={52} radius={0} />
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] font-bold tracking-[-0.022em] text-text-primary">{config.name}</h1>
            <div className="flex items-center gap-3.5">
              <a
                href={config.tradeUrl}
                target="_blank"
                rel="noreferrer"
                className="pf-transition inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[13px] font-semibold text-accent hover:border-accent/70 hover:bg-accent/15"
              >
                {tr(locale, "Trade", "Торговать")} ↗
                {config.tradePerk ? (
                  <span className="font-mono-num text-[11px] text-accent/80">
                    {tr(locale, config.tradePerk.en, config.tradePerk.ru)}
                  </span>
                ) : null}
              </a>
              <a href={config.twitterUrl} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Twitter ↗</a>
              <a href={config.docsUrl} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Docs ↗</a>
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-2.5">
          {config.heroMetrics.map((metric) => (
            <div key={metric.label} className="flex min-w-0 flex-col gap-1.5 rounded-none border border-border bg-surface-1 px-3 py-2.5 sm:rounded-none sm:px-4 sm:py-3.5">
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
      className="mt-11 rounded-none border p-6 sm:p-[30px]"
      style={{ borderColor: "rgba(77,141,255,0.2)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}
    >
      <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">{guidance.kicker}</div>
      <p className="pt-2 text-[15px] leading-[1.6] text-text-muted">{guidance.intro}</p>

      {guidance.priorities.length === 0 ? null : (
      <div className="grid gap-3 pt-5 sm:grid-cols-2">
        {guidance.priorities.map((priority) => (
          <div key={priority.label} className={`rounded-none border p-5 ${priority.primary ? "border-accent/45 bg-surface-2" : "border-border bg-bg/45"}`}>
            <div className="flex items-center gap-3">
              <span className={`rounded-none px-2.5 py-1 font-mono-num text-[11px] font-semibold uppercase tracking-[0.04em] ${priority.primary ? "bg-accent text-white" : "bg-surface-2 text-text-primary"}`}>
                {priority.label}
              </span>
              <span className="text-[13px] text-text-muted">{priority.kicker}</span>
            </div>
            <h3 className="pt-4 text-[19px] font-semibold tracking-[-0.018em] text-text-primary">{priority.title}</h3>
            <p className="pt-2.5 text-[14px] leading-[1.6] text-text-muted">{priority.body}</p>
          </div>
        ))}
      </div>
      )}

      {guidance.tips.length === 0 ? null : (
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
      )}

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
  // A book collected only to price a broker's routes has no page of its own,
  // so it is named without a link rather than sent to a 404.
  const canOpen = linked && hasProtocolPage(partnerSlug);
  return (
    <div className="relative flex h-full flex-col gap-3.5 rounded-none border border-border bg-surface-1 p-[22px]">
      {tip ? <div className="absolute right-4 top-4"><InfoTip text={tip} /></div> : null}
      <div className="flex items-center gap-1.5 text-[16px] font-semibold text-text-primary">
        <ProtocolMark slug={homeSlug} name={homeName} size={22} radius={0} />
        <span>{homeName} ×</span>
        <ProtocolMark slug={partnerSlug} name={partner} size={22} radius={0} />
        {canOpen ? (
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
            className={`whitespace-nowrap rounded-none border px-2.5 py-1 text-[11px] font-semibold ${
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

/** A stored route the server already read, in the shape this card uses. */
function acceptedRoute(route: CheapestRoute | null | undefined): { partnerSlug: string; cycleCostUsd: number } | null {
  // A partner is accepted only if it resolves to a listed protocol. Anything
  // else -- a fixture venue, a retired slug -- is treated as no answer rather
  // than printing a raw database slug.
  return route?.partnerSlug && protocolName(route.partnerSlug) && typeof route.cycleCostUsd === "number" && Number.isFinite(route.cycleCostUsd)
    ? { partnerSlug: route.partnerSlug, cycleCostUsd: route.cycleCostUsd }
    : null;
}

/**
 * The hourly cheapest route for ONE priced book, as its own card.
 *
 * A broker page renders one per connected book: TrueNorth's cheapest hedge on
 * Hyperliquid and on Ondo are different comparisons, and a single card could
 * only ever state one of them -- it used to state Hyperliquid's while the
 * calculator was set to Ondo.
 */
function CheapestRouteCard({
  pricingSlug,
  homeSlug,
  homeName,
  initialRoute,
}: {
  /** The book actually compared -- the page's own venue, or a broker's book. */
  pricingSlug: string;
  homeSlug: ProtocolSlug;
  homeName: string;
  initialRoute?: CheapestRoute | null;
}) {
  const locale = useLocale();
  // The hourly worker has already compared self-match and every venue; the page
  // arrives with that stored result. The fetch below is the fallback for when
  // the server could not read it.
  const server = acceptedRoute(initialRoute);
  const [cheapest, setCheapest] = useState<{ partnerSlug: string; cycleCostUsd: number } | null>(server);
  // "Lowest cost" is a claim about a computed comparison. Until one has been
  // loaded the card must not make it, on any protocol.
  const [routeStatus, setRouteStatus] = useState<"loading" | "ready" | "unavailable">(
    server ? "ready" : initialRoute ? "unavailable" : "loading",
  );
  useEffect(() => {
    if (initialRoute) return;
    let active = true;
    fetch(`/api/venues/${pricingSlug}/cheapest-route`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        const accepted = acceptedRoute(d);
        if (!accepted) {
          setRouteStatus("unavailable");
          return;
        }
        setCheapest(accepted);
        setRouteStatus("ready");
      })
      .catch(() => {
        if (active) setRouteStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [initialRoute, pricingSlug]);

  const cheapestSlug = cheapest?.partnerSlug ?? homeSlug;
  return (
    <HedgeCard
      homeSlug={homeSlug}
      homeName={homeName}
      partnerSlug={cheapestSlug}
      linked={cheapestSlug !== homeSlug}
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
          ? [[tr(locale, "Lowest cost", "Дешевле всего"), "ok"], [tr(locale, "Cheapest route", "Самый дешёвый маршрут"), "neutral"]]
          : [[tr(locale, "Cheapest route", "Самый дешёвый маршрут"), "neutral"]]
      }
    />
  );
}

function HedgeRecommendations({
  config,
  initialRoute,
  initialRoutes,
}: {
  config: ProtocolPageConfig;
  initialRoute?: CheapestRoute | null;
  /** A broker's prefetched comparisons, one per connected book, by slug. */
  initialRoutes?: Record<string, CheapestRoute>;
}) {
  const locale = useLocale();
  const execution = config.execution;
  // A broker has no book of its own, so each connected book is compared on its
  // own and named by it: "TrueNorth HL", "TrueNorth Ondo".
  const books = execution
    ? execution.venues
        .filter((venue) => isReadyVenue(venue.slug))
        .map((venue) => ({
          slug: venue.slug as string,
          name: `${config.name} ${venue.short}`,
          route: initialRoutes?.[venue.slug],
        }))
    : isReadyVenue(config.slug)
      ? [{ slug: config.slug as string, name: config.name, route: initialRoute ?? undefined }]
      : [];
  const partner = config.hedge.partner;
  // The hand-placed partner card always shows; the computed ones only where a
  // comparison exists, so the grid is sized from what is actually rendered.
  const columns = books.length + 1;
  return (
    <div className="mt-11">
      <H2>{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</H2>
      <div className="pb-4 pt-1.5 text-[14px] text-text-muted">{config.hedge.intro}</div>
      <div className={`grid gap-4 ${columns > 2 ? "sm:grid-cols-2 lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {books.map((book) => (
          <CheapestRouteCard
            key={book.slug}
            pricingSlug={book.slug}
            homeSlug={config.slug}
            homeName={book.name}
            initialRoute={book.route}
          />
        ))}
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


/**
 * The unlock ladder: how far the whole field has traded, and which prize step
 * that has reached. Drawn the way the venue draws it, because a farmer checks
 * this against the campaign page and the two should agree at a glance.
 */
function UnlockLadder({
  progress,
}: {
  progress: { valueUsd: number; valueLabel: string; tiers: Array<{ atUsd: number; poolUsd: number }> };
}) {
  const locale = useLocale();
  const top = progress.tiers[progress.tiers.length - 1]?.atUsd ?? 1;
  const filled = Math.min(100, (progress.valueUsd / top) * 100);
  const usd = (value: number) =>
    value >= 1_000_000 ? `$${Math.round(value / 1_000_000)}M` : `$${(value / 1_000).toFixed(0)}K`;
  return (
    <div className="flex flex-col gap-2 rounded-none bg-surface-2 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.1em] text-text-dim">
          {tr(locale, "Combined volume", "Общий объём")}
        </span>
        <span className="font-mono-num text-[13px] text-text-primary">{progress.valueLabel}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-positive" style={{ width: `${filled}%` }} />
      </div>
      <div className="flex justify-between gap-2">
        {progress.tiers.map((tier) => {
          const reached = progress.valueUsd >= tier.atUsd;
          return (
            <div key={tier.atUsd} className="flex flex-col items-center gap-0.5">
              <span className={`font-mono-num text-[11px] ${reached ? "text-text-primary" : "text-text-dim"}`}>
                {usd(tier.atUsd)}
              </span>
              <span className={`font-mono-num text-[12px] font-semibold ${reached ? "text-positive" : "text-text-dim"}`}>
                ${tier.poolUsd.toLocaleString("en-US")}
              </span>
            </div>
          );
        })}
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
      <div className="flex flex-col gap-4 rounded-none border border-border bg-surface-1 p-[22px]">
        {/* The badge belongs to the SECTION, not to the campaign name: it says
            "this protocol has something running", which is the same claim the
            empty state makes below and on every other protocol. */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-[17px] font-semibold text-text-primary">{title}</div>
          <span className="inline-flex flex-none items-center gap-1.5 rounded-none border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
            <span className="h-[5px] w-[5px] rounded-full bg-positive" />
            {tr(locale, "Active", "Активно")}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="flex flex-col gap-1">
            <div className="text-[17px] font-semibold text-text-primary">{activity.name}</div>
            <div className="font-mono-num text-[12px] text-text-muted">{activity.meta}</div>
          </div>
          {/* The deadline is the one number here that moves, so it gets a panel
              of its own rather than a line of small print. */}
          <div className="flex flex-none flex-col items-end gap-1 rounded-none border border-border bg-surface-2 px-4 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-text-dim">
              {tr(locale, "Ends in", "Осталось")}
            </span>
            {/* The server renders one second and the browser another, so this
                text can never match on the first paint. Flagged rather than
                worked around: the value is a live clock, and it is correct the
                moment it mounts. */}
            <span suppressHydrationWarning className="font-mono-num text-[20px] font-semibold leading-none text-text-primary">
              {countdown(now, activity.endUtc)}
            </span>
          </div>
        </div>

        {activity.progress ? <UnlockLadder progress={activity.progress} /> : null}

        <div className="text-[14px] leading-[1.62] text-text-muted">{activity.body}</div>
        <a href={activity.rulesUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-accent hover:text-accent-hover">
          {tr(locale, "Campaign page ↗", "Страница кампании ↗")}
        </a>
      </div>
    );
  }

  // Nothing running. An empty slot would read as us forgetting to update it,
  // so the absence is stated explicitly -- the same on every protocol.
  // The heading sits at the top like every other card's: centring the whole
  // column pushed it down and left it out of line with the panel beside it.
  return (
    <div className="flex flex-col gap-3 rounded-none border border-border bg-surface-1 p-[22px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[17px] font-semibold text-text-primary">{title}</div>
        <span className="inline-flex flex-none items-center gap-1.5 rounded-none border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-muted">
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
      <div className="flex flex-col gap-3 rounded-none border border-border bg-surface-1 p-[22px]">
        <div className="text-[17px] font-semibold text-text-primary">{title}</div>
        <EmptyNote className="flex-1">{tr(locale, "No points yet", "Поинтов пока нет")}</EmptyNote>
      </div>
    );
  }

  const p = pointsProgress(points, now);
  return (
    <div className="flex flex-col gap-4 rounded-none border border-border bg-surface-1 p-[22px]">
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
      <div className={`grid gap-4 ${config.points.kind === "none" ? "" : "lg:grid-cols-2"}`}>
        <ActivityCard activity={config.activity} now={now} />
        {config.points.kind === "none" ? null : <PointsCard points={config.points} now={now} />}
      </div>
    </div>
  );
}

/* ---- page ---- */

export function ProtocolPageV2({
  slug,
  otherVenues,
  extras,
  initial,
}: {
  slug: ProtocolSlug;
  otherVenues: VenueSummary[];
  /** Sections unique to ONE protocol, appended after the reference layout. */
  extras?: React.ReactNode;
  /** What the server read for this page; see ProtocolPageData. */
  initial?: ProtocolPageData;
}) {
  const locale = useLocale();
  const config = protocolPageConfig(slug, locale);
  const execution = config.execution;
  // A broker page opens on its default book. The choice itself lives in the
  // calculator's own "Farm points on" field, beside "Hedge with", rather than
  // in a separate panel that said the same thing twice.
  const pricedVenue = execution?.defaultVenue ?? (isReadyVenue(slug) ? slug : null);
  return (
    <div>
      <SiteHeaderV2 />
      <div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10">
        <Hero config={config} />
        <GuidancePanel config={config} />

        {/* General hedge guidance comes before the calculator, so the reader
            can choose the right counterparty before running a route. */}
        <HedgeRecommendations
          config={config}
          initialRoute={initial?.cheapestRoute}
          initialRoutes={initial?.cheapestRoutes}
        />


        {/* Live calculator + recommended route + 10-pairs table -- only where
            there is a data path to price. */}
        {pricedVenue ? (
          <ProtocolCalculatorV2
            otherVenues={otherVenues}
            venueSlug={pricedVenue}
            venueOptions={execution?.venues}
            executionContext={execution ? { feeNote: execution.feeNote } : undefined}
          />
        ) : (
          <NotPricedYet
            title={tr(locale, "Route calculator", "Калькулятор маршрута")}
            // A protocol can say WHY it has nothing to price -- an agent that
            // fills on other venues is not a venue waiting to be collected.
            body={config.unpriced?.calculator ?? tr(
              locale,
              `PerpFarm does not collect market data for ${config.name} yet, so there is nothing to price a route from. Use the calculator on a protocol that has one, and place this leg by hand.`,
              `PerpFarm пока не собирает рыночные данные по ${config.name}, так что считать маршрут не из чего. Используйте калькулятор на протоколе, где данные есть, а эту ногу ставьте руками.`,
            )}
          />
        )}

        {/* Points distribution belongs with the market charts, below the route
            decision rather than above the calculator. */}
        <ActivityAndDistribution config={config} />

        {/* Prediction-market FDV expectations sit before the activity chart.
            The panel states its own absence, so it renders for everyone. */}
        {isReadyVenue(slug) ? <FdvMarketsV2 venueSlug={slug} initialData={initial?.fdvMarkets} /> : null}

        {/* Market-activity chart (live activity API). */}
        {pricedVenue ? (
          <MarketActivityV2
            venueSlug={pricedVenue}
            venueOptions={execution?.venues}
            initialData={initial?.activity}
          />
        ) : (
          <NotPricedYet
            title={tr(locale, "Market activity", "Активность рынка")}
            body={config.unpriced?.activity ?? tr(
              locale,
              `Volume, open interest and traders are drawn from saved observations, and PerpFarm has not started collecting them for ${config.name}.`,
              `Объём, открытый интерес и трейдеры рисуются по сохранённым наблюдениям — по ${config.name} мы их пока не собираем.`,
            )}
          />
        )}

        {extras}

        <div className="mt-14 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted">
          <span>{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span>
        </div>
      </div>
    </div>
  );
}
