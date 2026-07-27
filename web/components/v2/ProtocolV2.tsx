"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { SiteHeaderV2 } from "@/components/v2/SiteHeaderV2";
import { ProtocolMark } from "@/components/v2/ProtocolMark";
import { ProtocolCalculatorV2 } from "@/components/v2/ProtocolCalculatorV2";
import { MarketActivityV2 } from "@/components/v2/MarketActivityV2";
import type { VenueSummary } from "@/lib/types";

/* ---- real points-distribution logic (ported from VariationalLayoutPreview) ---- */
const INITIAL_POINTS_DISTRIBUTED = 7_560_000;
const INITIAL_POINTS_REMAINING = 1_650_000;
const WEEKLY_POINT_DISTRIBUTION = 150_000;
const COMPETITION_BONUS_POINTS = 20_000;
const FIRST_TRACKED_DROP_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

function pointsProgress(now: number) {
  const completedDrops =
    now < FIRST_TRACKED_DROP_UTC
      ? 0
      : Math.min(
          Math.floor((now - FIRST_TRACKED_DROP_UTC) / WEEK_MS) + 1,
          Math.ceil(INITIAL_POINTS_REMAINING / WEEKLY_POINT_DISTRIBUTION),
        );
  const remaining = Math.max(0, INITIAL_POINTS_REMAINING - completedDrops * WEEKLY_POINT_DISTRIBUTION);
  const distributed = INITIAL_POINTS_DISTRIBUTED + completedDrops * WEEKLY_POINT_DISTRIBUTION + COMPETITION_BONUS_POINTS;
  return {
    distributed,
    remaining,
    weeksRemaining: Math.ceil(remaining / WEEKLY_POINT_DISTRIBUTION),
    nextDrop: FIRST_TRACKED_DROP_UTC + completedDrops * WEEK_MS,
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

const POINT_TIERS: [string, string, string][] = [
  ["Iron", "$0", "+0%"],
  ["Bronze", "$1M", "+0.5%"],
  ["Silver", "$5M", "+1%"],
  ["Gold", "$25M", "+2%"],
  ["Platinum", "$100M", "+3%"],
  ["Diamond", "$750M", "+4%"],
  ["Infinity", "$2.5B", "+5%"],
];

const TWITTER = "https://x.com/variational_io";
const DOCS = "https://docs.variational.io/omni";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">{children}</h2>;
}

/* ---- sections ---- */

function Hero() {
  const locale = useLocale();
  const metric = (label: string, value: string, valueClass = "text-text-primary") => (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface-1 px-4 py-3.5">
      <div className="text-[11px] font-medium text-text-muted">{label}</div>
      <div className={`font-mono-num text-[18px] ${valueClass}`}>{value}</div>
    </div>
  );
  return (
    <>
      <div className="flex items-center gap-2 pb-4 pt-5 text-[13px] text-text-dim">
        <Link href="/v2#protocols" className="pf-transition text-text-muted hover:text-text-primary">
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
        <div className="grid grid-cols-3 gap-2.5">
          {metric(tr(locale, "Season", "Сезон"), "Season 1")}
          {metric(tr(locale, "Farm estimate", "Оценка фарма"), "$5–11/pt", "text-positive")}
          {metric(tr(locale, "OTC point price", "OTC цена поинта"), "$21")}
        </div>
      </div>
    </>
  );
}

function AwardsPanel() {
  const locale = useLocale();
  const priority = (n: string, tone: "1" | "2", title: string, body: string) => (
    <div
      className="flex flex-col gap-2.5 rounded-2xl border p-[18px]"
      style={{
        borderColor: tone === "1" ? "rgba(77,141,255,0.3)" : "var(--border)",
        background: "color-mix(in srgb, var(--bg) 55%, transparent)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`rounded-md px-2 py-0.5 font-mono-num text-[10px] font-medium ${tone === "1" ? "bg-accent text-white" : "bg-surface-2 text-text-primary"}`}
        >
          {n}
        </span>
        <span className="text-[11px] text-text-muted">
          {tone === "1" ? tr(locale, "strongest driver", "главный фактор") : tr(locale, "secondary", "вторичный")}
        </span>
      </div>
      <div className="text-[17px] font-semibold text-text-primary">{title}</div>
      <div className="text-[13px] leading-[1.55] text-text-muted">{body}</div>
    </div>
  );
  return (
    <div className="mt-11 grid gap-7 rounded-[20px] border p-[30px] lg:grid-cols-[1fr_380px]"
      style={{ borderColor: "rgba(77,141,255,0.2)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--surface-1) 60%)" }}
    >
      <div className="flex flex-col gap-4">
        <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-accent">
          {tr(locale, "How Variational awards points", "Как Variational начисляет поинты")}
        </div>
        <div className="max-w-[640px] text-[24px] font-semibold leading-[1.42] tracking-[-0.015em] text-text-primary">
          {tr(
            locale,
            "Keep exposure in medium-OI markets first. Volume is only the secondary driver.",
            "В первую очередь держите позицию в рынках со средним OI. Объём — лишь вторичный фактор.",
          )}
        </div>
        <div className="max-w-[620px] text-[15px] leading-[1.65] text-text-muted">
          {tr(
            locale,
            "Passive LIMIT orders provide liquidity and are more point-efficient than immediate MARKET orders.",
            "Пассивные LIMIT-ордера дают ликвидность и эффективнее по поинтам, чем немедленные MARKET-ордера.",
          )}
        </div>
        <div className="max-w-[620px] rounded-xl px-3.5 py-3 text-[13px] text-text-muted" style={{ background: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}>
          {tr(
            locale,
            "Use a referral code on sign-up for a +16% boost. Tiers and an active competition can increase the result further.",
            "Используйте реферальный код при регистрации — это +16% буста. Тиры и активное соревнование могут увеличить результат ещё сильнее.",
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {priority("PRIORITY 1", "1", tr(locale, "Medium OI, 12–24h hold", "Средний OI, удержание 12–24 ч"), tr(locale, "Hold a hedged position in a medium-depth market for at least half a day.", "Держите хеджированную позицию в рынке средней глубины минимум полдня."))}
        {priority("PRIORITY 2", "2", tr(locale, "Eligible volume", "Eligible-объём"), tr(locale, "Volume counts on every market and is only the secondary driver — there's no point stacking huge turnover, just trade organically.", "Объём считается на всех рынках и это лишь вторичный фактор — нет смысла набивать большой оборот, торгуйте органично."))}
      </div>
    </div>
  );
}

function HedgeRecommendations({ otherVenues }: { otherVenues: VenueSummary[] }) {
  const locale = useLocale();
  const [cheapestSlug, setCheapestSlug] = useState("variational");
  useEffect(() => {
    let active = true;
    fetch("/api/venues/variational/cheapest-route")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.partnerSlug) setCheapestSlug(d.partnerSlug);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const nameOf = (slug: string) =>
    slug === "variational" ? "Variational" : otherVenues.find((v) => v.slug === slug)?.name ?? slug;
  const card = (slug: string, title: string, body: string, tags: [string, "ok" | "warn" | "neutral"][]) => (
    <div className="flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-[22px]">
      <div className="flex items-center gap-2.5">
        <ProtocolMark slug={slug} name={nameOf(slug)} size={30} radius={9} />
        <div className="text-[16px] font-semibold text-text-primary">{title}</div>
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
          cheapestSlug,
          `Variational × ${nameOf(cheapestSlug)}`,
          tr(locale, "Approved delta-neutral setup with two accounts — the lowest-cost route.", "Разрешённый дельта-нейтральный сетап с двумя аккаунтами — самый дешёвый маршрут."),
          [[tr(locale, "Lowest cost", "Дешевле всего"), "ok"], [tr(locale, "Two accounts needed", "Нужно 2 аккаунта"), "neutral"]],
        )}
        {card(
          "txflow",
          "Variational × TxFlow",
          tr(locale, "Early perp-dex focused on RWA, like Variational. Potential retropoint farming.", "Ранний perp-dex с фокусом на RWA, как и Variational. Потенциальный фарм ретро-поинтов."),
          [[tr(locale, "Higher spread", "Шире спред"), "warn"], [tr(locale, "Farm retropoints", "Фарм ретро-поинтов"), "neutral"]],
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
        {/* competition */}
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
          <div className="grid grid-cols-3 gap-2.5">
            {[
              [tr(locale, "Weekly drop", "В неделю"), `+${compactPoints(WEEKLY_POINT_DISTRIBUTION)}`, "text-positive"],
              [tr(locale, "Weeks left", "Недель"), String(p.weeksRemaining), "text-text-primary"],
              [tr(locale, "Next drop", "След. дроп"), "", "text-text-primary"],
            ].map(([label, value, cls], i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
                <div className="text-[11px] text-text-muted">{label}</div>
                {i === 2 ? (
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

function FactorsAffectingPoints() {
  const locale = useLocale();
  return (
    <div className="mt-11">
      <H2>{tr(locale, "Factors affecting points", "Что влияет на поинты")}</H2>
      <div className="mt-4 rounded-[18px] border border-border bg-surface-1 p-[22px]">
        <p className="text-[15px] leading-[1.7] text-text-muted">
          {tr(locale, "Passive LIMIT orders provide liquidity and are more point-efficient than immediate MARKET orders. On sign-up, use a referral code — it gives a +16% points boost.", "Пассивные LIMIT-ордера дают ликвидность и эффективнее по поинтам, чем немедленные MARKET-ордера. При регистрации используйте реферальный код — он даёт +16% буста.")}
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[28rem] text-left text-[13px]">
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
        <p className="mt-4 text-[13px] leading-[1.6] text-text-muted">
          {tr(locale, "Tier volume = personal volume + 0.2 × referred volume. The inviter also earns 1 point per 10 points earned by referred users.", "Объём тира = личный объём + 0.2 × объём рефералов. Пригласивший также получает 1 поинт за каждые 10 поинтов, заработанных рефералами.")}
        </p>
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

        {/* Live calculator + recommended route + 10-pairs table (native, wired
            to the same pair-rankings / cross-rankings APIs). */}
        <ProtocolCalculatorV2 otherVenues={otherVenues} />

        <HedgeRecommendations otherVenues={otherVenues} />
        <ActivityAndDistribution />
        <FactorsAffectingPoints />

        {/* Native market-activity chart (live activity API, design SVG). */}
        <MarketActivityV2 />

        <div className="mt-14 flex items-center justify-between border-t border-border pt-7 text-[13px] text-text-muted">
          <span>{tr(locale, "Estimates from public data · Not financial advice", "Оценки по публичным данным · Не финансовый совет")}</span>
        </div>
      </div>
    </div>
  );
}
