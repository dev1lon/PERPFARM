"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { InfoTip, farmEstimateTip, otcPointTip } from "@/components/v2/InfoTip";
import { ProtocolCalculatorV2 } from "@/components/v2/ProtocolCalculatorV2";
import { MarketActivityV2 } from "@/components/v2/MarketActivityV2";
import { OiCompositionChart } from "@/components/v2/OiCompositionChart";
import { FdvMarketsV2 } from "@/components/v2/FdvMarketsV2";
import { protocolName } from "@/lib/venue-status";
import type { VenueSummary } from "@/lib/types";

/* ---- points distribution (manual figures) ----
   Distributed = 3.0M base + 150k per completed weekly drop + 20k per completed
   competition. As of 2026-07-31 that is 3.0M + 34x150k + 5x20k = 8.2M. */
const BASE_POINTS = 3_000_000;
const WEEKLY_POINT_DISTRIBUTION = 150_000;
const COMPETITION_POINT_DISTRIBUTION = 20_000;
/** Completed competitions so far — bump by one each time a competition ends. */
const COMPLETED_COMPETITIONS = 5;
/** A known weekly-drop day, with the number of farming weeks completed by then. */
const WEEK_ANCHOR_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const WEEKS_AT_ANCHOR = 32;
/** Pool left on the anchor date: 10 weekly drops, so 8 remain by 2026-08-04. */
const REMAINING_AT_ANCHOR = 1_500_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

function pointsProgress(now: number) {
  const weeksSinceAnchor = Math.max(0, Math.floor((now - WEEK_ANCHOR_UTC) / WEEK_MS));
  const weeksFarmed = WEEKS_AT_ANCHOR + weeksSinceAnchor;
  const remaining = Math.max(0, REMAINING_AT_ANCHOR - weeksSinceAnchor * WEEKLY_POINT_DISTRIBUTION);
  const distributed =
    BASE_POINTS +
    weeksFarmed * WEEKLY_POINT_DISTRIBUTION +
    COMPLETED_COMPETITIONS * COMPETITION_POINT_DISTRIBUTION;
  return {
    distributed,
    remaining,
    weeksFarmed,
    weeksRemaining: Math.ceil(remaining / WEEKLY_POINT_DISTRIBUTION),
    nextDrop: WEEK_ANCHOR_UTC + (weeksSinceAnchor + 1) * WEEK_MS,
    pct: Math.round((distributed / (distributed + remaining)) * 100),
  };
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


const TWITTER = "https://x.com/variational_io";
const DOCS = "https://docs.variational.io/omni";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{children}</h2>;
}

/* ---- sections ---- */

function Hero() {
  const locale = useLocale();
  const metric = (label: string, value: string, valueClass = "text-text-primary", tip?: string) => (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-border bg-surface-1 px-3 py-2.5 sm:rounded-[14px] sm:px-4 sm:py-3.5">
      <div className="flex min-h-[26px] items-start gap-1.5 text-[10px] font-medium leading-[1.3] text-text-muted sm:min-h-0 sm:items-center sm:text-[11px]">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </div>
      <div className={`whitespace-nowrap font-mono-num text-[16px] leading-none sm:text-[18px] ${valueClass}`}>{value}</div>
    </div>
  );
  return (
    <>
      <div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim">
        <Link href="/#protocols" className="pf-transition text-text-muted hover:text-text-primary">
          {tr(locale, "Protocols", "Протоколы")}
        </Link>
        <span>/</span>
        <span className="text-text-primary">Variational</span>
      </div>
      <div className="flex flex-col items-start justify-between gap-6 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div className="flex items-center gap-4">
          <ProtocolMark slug="variational" name="Variational" size={52} radius={14} />
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] font-bold tracking-[-0.022em] text-text-primary">Variational</h1>
            <div className="flex items-center gap-3.5">
              <a href={TWITTER} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Twitter ↗</a>
              <a href={DOCS} target="_blank" rel="noreferrer" className="pf-transition text-[13px] text-text-muted hover:text-text-primary">Docs ↗</a>
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-2.5">
          {metric(tr(locale, "Season", "Сезон"), "1")}
          {metric(tr(locale, "Farm estimate", "Оценка фарма"), "$5–11/pt", "text-positive", farmEstimateTip(locale))}
          {metric(tr(locale, "OTC point price", "OTC цена поинта"), "$24", "text-text-primary", otcPointTip(locale))}
        </div>
      </div>
    </>
  );
}

function AwardsPanel() {
  const locale = useLocale();
  const priorities = [
    {
      label: "Priority 1",
      kicker: tr(locale, "strongest driver", "главный фактор"),
      title: tr(locale, "Medium OI, 12–24h hold", "Средний OI, удержание 12–24ч"),
      body: tr(
        locale,
        "Low OI pays more but costs more to execute; high OI is cheapest but pays least. Medium OI is the balance, so hold a delta-neutral position there for at least 12 hours.",
        "Низкий OI даёт больше поинтов, но дороже в исполнении; высокий OI дешевле, но платит меньше. Средний OI — баланс: держите там дельта-нейтральную позицию хотя бы 12 часов.",
      ),
      primary: true,
    },
    {
      label: "Priority 2",
      kicker: tr(locale, "secondary", "вторично"),
      title: tr(locale, "Eligible volume", "Подходящий объём"),
      body: tr(
        locale,
        "Volume counts on every market, but it is secondary — don't stack turnover; trade organically.",
        "Объём учитывается на каждом рынке, но вторичен — не набивайте оборот, торгуйте органично.",
      ),
      primary: false,
    },
  ];
  const tips = [
    {
      n: "01",
      title: tr(locale, "Farm TradFi markets first", "В первую очередь фармите TradFi-рынки"),
      body: tr(
        locale,
        "They execute cheaper than crypto pairs and award more points for the same volume.",
        "Их исполнение дешевле, чем у крипто-пар, а поинтов за тот же объём они дают больше.",
      ),
    },
    {
      n: "02",
      title: tr(locale, "Enter with passive LIMIT orders", "Заходите пассивными LIMIT-ордерами"),
      body: tr(
        locale,
        "Resting LIMIT orders provide liquidity and are more point-efficient than immediate MARKET orders.",
        "Лимитные ордера в стакане дают ликвидность и эффективнее по поинтам, чем немедленные MARKET-ордера.",
      ),
    },
    {
      n: "03",
      title: tr(locale, "Look like an organic trader", "Выглядите как органический трейдер"),
      body: tr(
        locale,
        "When you close a leg by MARKET, set a take-profit one cent above/below the current price.",
        "Закрывая ногу по MARKET, ставьте take-profit на один цент выше/ниже текущей цены.",
      ),
    },
    {
      n: "04",
      title: tr(locale, "Use a full +16% referral", "Используйте реферал на полные +16%"),
      body: tr(
        locale,
        "Many referral links give only 12–15%; reward tiers add another multiplier as 30-day volume grows.",
        "Многие рефералы дают только 12–15%; reward-тиры добавляют множитель по мере роста объёма за 30 дней.",
      ),
    },
  ];

  return (
    <section
      className="mt-11 rounded-[20px] border p-6 sm:p-[30px]"
      style={{ borderColor: "rgba(77,141,255,0.2)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}
    >
      <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">
        {tr(locale, "How Variational awards points", "Как Variational начисляет поинты")}
      </div>

      <p className="pt-2 text-[15px] leading-[1.6] text-text-muted">
        {tr(
          locale,
          "Points are driven first by medium OI and holding time; volume helps, but comes second.",
          "Главные факторы поинтов — средний OI и время удержания; объём помогает, но идёт вторым.",
        )}
      </p>

      <div className="grid gap-3 pt-5 sm:grid-cols-2">
        {priorities.map((priority) => (
          <div
            key={priority.label}
            className={`rounded-[18px] border p-5 ${priority.primary ? "border-accent/45 bg-surface-2" : "border-border bg-bg/45"}`}
          >
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
          {tips.map((tip) => (
            <li key={tip.n} className="flex gap-3.5 rounded-2xl border border-border bg-bg/45 p-[18px]">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent font-mono-num text-[11px] font-medium text-white">
                {tip.n}
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="text-[15px] font-semibold text-text-primary">{tip.title}</span>
                <span className="text-[13px] leading-[1.6] text-text-muted">{tip.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <a
        href="https://docs.variational.io/omni/"
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-block text-[13px] font-semibold text-accent hover:text-accent-hover"
      >
        {tr(locale, "Reward tiers and full program rules in the docs ↗", "Reward-тиры и полные правила программы в документации ↗")}
      </a>
    </section>
  );
}

function HedgeRecommendations() {
  const locale = useLocale();
  // The hourly worker has already compared self-match and every venue. The
  // browser only asks for that stored result.
  const [cheapest, setCheapest] = useState<{ partnerSlug: string; cycleCostUsd: number } | null>(null);
  // "Lowest cost" is a claim about a computed comparison. Until one has been
  // loaded the card must not make it: the previous version defaulted to
  // self-match and badged it as the winner even when the request failed.
  const [routeStatus, setRouteStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    fetch("/api/venues/variational/cheapest-route")
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
  }, []);
  const card = (
    slug: string,
    title: string,
    body: string,
    tags: [string, "ok" | "warn" | "neutral"][],
    projectSlug?: string,
  ) => (
    <div className="relative flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]">
      {tags.some(([t]) => t === tr(locale, "Lowest cost", "Дешевле всего")) && <div className="absolute right-4 top-4"><InfoTip text={tr(locale, "This recommendation is generated by the hourly snapshot job and refreshes once an hour.", "Эта рекомендация формируется часовой задачей по снимкам рынка и обновляется раз в час.")} /></div>}
      <div className="flex items-center gap-2.5">
        {projectSlug ? (
          <div className="flex items-center gap-1.5 text-[16px] font-semibold text-text-primary">
            <ProtocolMark slug="variational" name="Variational" size={22} radius={7} />
            <span>Variational ×</span>
            <ProtocolMark slug={projectSlug} name={protocolName(projectSlug) ?? ""} size={22} radius={7} />
            <Link href={`/${projectSlug}`} className="pf-transition hover:text-accent">
              <span className="underline decoration-accent/70 underline-offset-4">{protocolName(projectSlug)}</span>
              <span aria-hidden>↗</span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[16px] font-semibold text-text-primary"><ProtocolMark slug="variational" name="Variational" size={22} radius={7} /><span>Variational ×</span><ProtocolMark slug={slug} name={protocolName(slug) ?? ""} size={22} radius={7} /><span>{protocolName(slug)}</span></div>
        )}
      </div>
      <div className="text-[14px] leading-[1.62] text-text-muted">{body}</div>
      <div className="mt-auto flex gap-2">
        {tags.map(([t, tone]) => (
          <span
            key={t}
            className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              tone === "ok"
                ? "border-positive/30 bg-positive/10 text-positive"
                : tone === "warn"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-surface-2 text-text-muted"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <div className="mt-11">
      <H2>{tr(locale, "Hedge-route recommendations", "Рекомендации по хедж-маршрутам")}</H2>
      <div className="pb-4 pt-1.5 text-[14px] text-text-muted">
        {tr(locale, "General guidance for Variational, independent of the calculation above.", "Общие рекомендации по Variational, независимо от расчёта выше.")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {card(
          cheapest?.partnerSlug ?? "variational",
          `Variational × ${protocolName(cheapest?.partnerSlug ?? "variational")}`,
          routeStatus === "ready"
            ? tr(locale, "Approved delta-neutral setup with two accounts — the lowest-cost route.", "Одобренный дельта-нейтральный сетап с двумя аккаунтами — маршрут с минимальной стоимостью.")
            : routeStatus === "loading"
              ? tr(locale, "Comparing routes…", "Сравниваем маршруты…")
              : tr(locale, "Approved delta-neutral setup with two accounts. The hourly route comparison is unavailable right now, so no cheapest route is claimed.", "Одобренный дельта-нейтральный сетап с двумя аккаунтами. Часовое сравнение маршрутов сейчас недоступно, поэтому самый дешёвый маршрут не заявляется."),
          routeStatus === "ready"
            ? [[tr(locale, "Lowest cost", "Дешевле всего"), "ok"], [tr(locale, "Two accounts needed", "Нужно 2 аккаунта"), "neutral"]]
            : [[tr(locale, "Two accounts needed", "Нужно 2 аккаунта"), "neutral"]],
          cheapest && cheapest.partnerSlug !== "variational" ? cheapest.partnerSlug : undefined,
        )}
        {card(
          "txflow",
          "Variational ×",
          tr(locale, "Early perp-dex focused on TradFi markets, like Variational. Potential retro points.", "Ранний perp-dex с фокусом на TradFi-рынки, как и Variational. Потенциальные ретро-поинты."),
          [[tr(locale, "Farm retro points", "Фарм ретро-поинтов"), "ok"], [tr(locale, "Higher cost", "Дороже исполнение"), "warn"]],
          "txflow",
        )}
      </div>
    </div>
  );
}

function ActivityAndDistribution() {
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);
  const p = pointsProgress(now);
  return (
    <div className="mt-11">
      <H2>{tr(locale, "Protocol activity", "Активность протокола")}</H2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Running activity, or an explicit "nothing running" state — an empty
            slot would read as us forgetting to update it. */}
        {false ? (
          <div className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface-1 p-[22px]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="text-[17px] font-semibold text-text-primary">TradFi Trading Competition #5</div>
                <div className="font-mono-num text-[12px] text-text-muted">2026-07-17 → 2026-07-31 · $20,000 {tr(locale, "prizes", "призы")}</div>
              </div>
              <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
                <span className="h-[5px] w-[5px] rounded-full bg-positive" />
                {tr(locale, "Active", "Активно")}
              </span>
            </div>
            <div className="text-[14px] leading-[1.62] text-text-muted">
              {locale === "ru"
                ? "Участие фактически обязательно для максимума поинтов: в конце каждого турнира дополнительно раздаётся 20 000 поинтов по объёму торгов на eligible-активах (сейчас TradFi). Score: TradFi PnL × √TradFi volume."
                : "Joining is effectively required for max points: at the end of every competition an extra 20,000 points are handed out by trading volume on eligible assets (currently TradFi). Score: TradFi PnL × √TradFi volume."}
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-text-muted">
              <span className="text-[11px] uppercase tracking-[0.1em] text-text-dim">{tr(locale, "Eligible", "Eligible")}</span>
              <span className="text-text-primary">{tr(locale, "all TradFi markets", "все TradFi-рынки")}</span>
            </div>
            <a href="https://docs.variational.io/omni/trading-competition" target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-accent hover:text-accent-hover">
              {tr(locale, "Competition rules ↗", "Правила конкурса ↗")}
            </a>
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[18px] border border-border bg-surface-1 p-[22px] text-center">
            <div className="flex items-center gap-2.5">
              <span className="hidden h-[5px] w-[5px] rounded-full bg-text-dim" />
              <div className="font-mono-num text-[18px] font-semibold uppercase tracking-[0.12em] text-text-dim">
                {tr(locale, "No activity running", "Нет активных активностей")}
              </div>
            </div>
            <div className="hidden text-[14px] leading-[1.62] text-text-muted">
              {tr(
                locale,
                "Right now there is no competition or bonus that would increase the number of points you earn or lower their cost. We track this and it will appear here as soon as one starts.",
                "Сейчас нет соревнований или бонусов, которые увеличили бы количество поинтов или снизили их стоимость. Мы это отслеживаем — как только что-то начнётся, оно появится здесь.",
              )}
            </div>
            <div className="hidden text-[13px] text-text-dim">
              {tr(
                locale,
                "The last competition ended on 2026-07-31; its 20,000-point distribution is already counted in the total.",
                "Последний турнир завершился 31.07.2026 — его раздача 20 000 поинтов уже учтена в общем количестве.",
              )}
            </div>
          </div>
        )}

        {/* points distribution */}
        <div className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface-1 p-[22px]">
          <div className="flex items-center justify-between">
            <div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Points distribution", "Раздача поинтов")}</div>
            <div className="font-mono-num text-[12px] text-text-dim">Season 1</div>
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
              [tr(locale, "Weekly drop", "В неделю"), `+${compactPoints(WEEKLY_POINT_DISTRIBUTION)}`, "text-positive"],
              [tr(locale, "Weeks left", "Недель"), String(p.weeksRemaining), "text-text-primary"],
              [tr(locale, "Next drop", "След. дроп"), "", "text-text-primary"],
            ].map(([label, value, cls], i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
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
      </div>
    </div>
  );
}

/* ---- page ---- */

export function ProtocolV2({ otherVenues }: { otherVenues: VenueSummary[] }) {
  const locale = useLocale();
  return (
    <div>
      <SiteHeaderV2 />
      <div className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-10">
        <Hero />
        <AwardsPanel />

        {/* General hedge guidance comes before the calculator, so the reader
            can choose the right counterparty before running a route. */}
        <HedgeRecommendations />

        {/* Live calculator + recommended route + 10-pairs table (native, wired
            to the same pair-rankings / cross-rankings APIs). */}
        <ProtocolCalculatorV2 otherVenues={otherVenues} />

        {/* Points distribution belongs with the market charts, below the route
            decision rather than above the calculator. */}
        <ActivityAndDistribution />

        {/* Polymarket FDV expectations sit immediately before activity. */}
        <FdvMarketsV2 />

        {/* Native market-activity chart (live activity API, design SVG). */}
        <MarketActivityV2 />

        {/* Fourth chart: how open interest splits across BTC / TradFi / crypto. */}
        <OiCompositionChart />

        <div className="mt-14 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted">
          <span>{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span>
        </div>
      </div>
    </div>
  );
}
