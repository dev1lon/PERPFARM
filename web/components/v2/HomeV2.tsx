"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { brandAssets } from "@/lib/brand";
import { PerpDexLogo } from "@/components/PerpDexLogo";
import { RouteMap } from "@/components/v2/RouteMap";
import { LocaleToggle, tr, useLocale, type Locale } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  TIER_S,
  EARLY,
  RADAR,
  TRACKED_COUNT,
  type HomeProtocol,
  type PointsStatus,
} from "@/lib/home-protocols";

/* ---------------------------------------------------------------------------
   Shared bits
   -------------------------------------------------------------------------- */

/** A protocol's real logo inside the one uniform tile every protocol shares
 *  (see the design's "logo tile rules"). Falls back to the colored monogram. */
function ProtocolMark({
  slug,
  name,
  size,
  radius,
}: {
  slug: string;
  name: string;
  size: number;
  radius: number;
}) {
  const { mark, markScale, invertMarkOnLight } = brandAssets(slug);
  return (
    <span
      className="flex shrink-0 items-center justify-center border border-border bg-surface-2"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {mark ? (
        // eslint-disable-next-line @next/next/no-img-element -- static mark from /public
        <img
          src={`/${mark}`}
          alt=""
          aria-hidden
          className={`w-auto${invertMarkOnLight ? " pf-mark-invert-on-light" : ""}`}
          style={{
            height: Math.round(size * 0.58 * (markScale ?? 1)),
            maxWidth: Math.round(size * 0.7),
            maxHeight: Math.round(size * 0.66),
          }}
        />
      ) : (
        <PerpDexLogo slug={slug} name={name} size={Math.round(size * 0.62)} />
      )}
    </span>
  );
}

function statusLabel(locale: Locale, status: PointsStatus): string {
  switch (status) {
    case "live":
      return tr(locale, "Points live", "Поинты идут");
    case "teased":
      return tr(locale, "Points teased", "Поинты анонсированы");
    case "mainnet":
      return tr(locale, "Mainnet", "Mainnet");
    case "ended":
      return tr(locale, "Ended", "Завершено");
  }
}

function StatusBadge({ status }: { status: PointsStatus }) {
  const locale = useLocale();
  const positive = status === "live";
  const neutral = status === "ended";
  const tone = positive
    ? "border-positive/30 bg-positive/10 text-positive"
    : neutral
      ? "border-border bg-surface-2 text-text-muted"
      : "border-warning/30 bg-warning/10 text-warning";
  const dot = positive ? "bg-positive" : neutral ? "bg-text-dim" : "bg-warning";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}
    >
      <span className={`h-[5px] w-[5px] rounded-full ${dot}`} />
      {statusLabel(locale, status)}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Header
   -------------------------------------------------------------------------- */

function Header() {
  const locale = useLocale();
  const link =
    "pf-transition text-sm font-medium text-text-muted hover:text-text-primary";
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-5 sm:px-10">
        <Link href="/v2" className="flex items-center gap-2.5">
          <Image src="/icon.svg" alt="" aria-hidden width={26} height={26} className="h-[26px] w-[26px] rounded-lg" />
          <span className="text-base font-bold tracking-tight text-text-primary">
            PerpFarm
          </span>
        </Link>
        <div className="flex items-center gap-5 sm:gap-7">
          <a href="#protocols" className={`hidden sm:inline ${link}`}>
            {tr(locale, "Protocols", "Протоколы")}
          </a>
          <a href="#how" className={`hidden sm:inline ${link}`}>
            {tr(locale, "How it works", "Как это работает")}
          </a>
          <Link href="/methodology" className={`hidden sm:inline ${link}`}>
            {tr(locale, "Methodology", "Методология")}
          </Link>
          <div className="flex items-center gap-1">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Hero + route-map placeholder
   -------------------------------------------------------------------------- */

function Hero() {
  const locale = useLocale();
  return (
    <div className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-[76px]">
      <div className="flex flex-col items-start gap-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 py-1.5 pl-2 pr-3">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="font-mono-num text-[11px] tracking-wide text-accent">
            {tr(locale, `${TRACKED_COUNT} protocols tracked`, `${TRACKED_COUNT} протоколов в отслеживании`)}
          </span>
        </span>
        <h1 className="text-[42px] font-bold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[60px] sm:leading-[1.04]">
          {tr(locale, "Farm perp points with lower costs.", "Фармите perp-поинты дешевле.")}
        </h1>
        <p className="max-w-[480px] text-[17px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "Perp protocols reward trading activity with points. PerpFarm explains the rules, compares hedge routes and estimates the cost before you trade.",
            "Perp-протоколы награждают за торговую активность поинтами. PerpFarm объясняет правила, сравнивает маршруты хеджа и оценивает стоимость до того, как вы торгуете.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <a
            href="#protocols"
            className="pf-transition inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_26px_rgba(77,141,255,0.28)] hover:bg-accent-hover"
          >
            {tr(locale, "Choose a protocol", "Выбрать протокол")}
            <span className="font-mono-num text-[13px]">→</span>
          </a>
          <a
            href="#how"
            className="pf-transition inline-flex items-center rounded-xl border border-border px-5 py-3.5 text-[15px] font-semibold text-text-primary hover:bg-surface-2"
          >
            {tr(locale, "How it works", "Как это работает")}
          </a>
        </div>
        <div className="text-[13px] text-text-dim">
          {tr(
            locale,
            "No wallet connection. No trading on PerpFarm.",
            "Без подключения кошелька. Без торговли на PerpFarm.",
          )}
        </div>
      </div>

      {/* The 3D route panel stays a fixed dark "device" in both themes so the
          WebGL scene and its overlay labels always read (like the brand cards). */}
      <div
        className="overflow-hidden rounded-[20px] border"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(180deg, #10162a, #0a0e18)" }}
      >
        <div
          className="flex items-center justify-between px-[18px] py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="font-mono-num text-[11px] uppercase tracking-[0.1em]" style={{ color: "#8b96ad" }}>
            {tr(locale, "Route map", "Карта маршрута")}
          </div>
          <div className="font-mono-num text-[11px]" style={{ color: "#78849c" }}>
            {tr(locale, "example", "пример")} · Variational × TxFlow
          </div>
        </div>
        <RouteMap mode="network" pair="XAU" height={432} />
        <div
          className="flex items-center gap-5 px-[18px] py-3.5 text-[12px]"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "#8b96ad" }}
        >
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4d8dff" }} />
            {tr(locale, "On the route", "На маршруте")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#64708a" }} />
            {tr(locale, "Other protocols", "Другие протоколы")}
          </span>
          <span className="ml-auto hidden sm:inline" style={{ color: "#78849c" }}>
            {tr(locale, "Hover a node for its name", "Наведите на узел для имени")}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   How it works
   -------------------------------------------------------------------------- */

function HowItWorks() {
  const locale = useLocale();
  const steps = [
    {
      n: "1",
      title: tr(locale, "Choose the points", "Выберите поинты"),
      body: tr(
        locale,
        "Open the protocol whose points you want to farm and read how it awards them.",
        "Откройте протокол, чьи поинты хотите фармить, и прочитайте, как он их начисляет.",
      ),
    },
    {
      n: "2",
      title: tr(locale, "Choose the hedge", "Выберите хедж"),
      body: tr(
        locale,
        "Pick the protocol for the opposite leg — the same one or a different one.",
        "Выберите протокол для встречной ноги — тот же или другой.",
      ),
    },
    {
      n: "3",
      title: tr(locale, "Run the calculation", "Запустите расчёт"),
      body: tr(
        locale,
        "Enter volume per account and get the cheapest route with its full cycle cost.",
        "Введите объём на аккаунт и получите самый дешёвый маршрут с полной стоимостью цикла.",
      ),
    },
  ];
  return (
    <div id="how" className="grid gap-4 pb-[76px] md:grid-cols-3">
      {steps.map((s) => (
        <div
          key={s.n}
          className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-6"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-accent/30 bg-accent/10 font-mono-num text-[12px] text-accent">
              {s.n}
            </span>
            <div className="text-[15px] font-semibold text-text-primary">{s.title}</div>
          </div>
          <div className="text-[14px] leading-[1.6] text-text-muted">{s.body}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Protocols
   -------------------------------------------------------------------------- */

function TierLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pb-3.5">
      <div className="font-mono-num text-[11px] uppercase tracking-[0.12em] text-text-muted">
        {children}
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function TierSCard({ p }: { p: HomeProtocol }) {
  const locale = useLocale();
  const cell = (label: string, value?: string) => (
    <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="font-mono-num text-[15px] text-text-primary">{value ?? "—"}</div>
    </div>
  );
  return (
    <Link
      href={`/${p.slug}`}
      className="flex flex-col gap-[18px] rounded-[18px] border border-border bg-surface-1 p-[22px] transition-[transform,border-color] duration-200 hover:border-accent/40 motion-safe:hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <ProtocolMark slug={p.slug} name={p.name} size={38} radius={11} />
          <div className="flex flex-col gap-1">
            <div className="text-[17px] font-semibold text-text-primary">{p.name}</div>
            {p.season ? (
              <div className="font-mono-num text-[12px] text-text-muted">{p.season}</div>
            ) : null}
          </div>
        </div>
        {p.status ? <StatusBadge status={p.status} /> : null}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {cell(tr(locale, "Farm estimate", "Оценка фарма"), p.farmEstimate)}
        {cell(tr(locale, "OTC point price", "OTC цена поинта"), p.otc)}
        {cell(tr(locale, "Next drop", "След. дроп"), p.nextDrop)}
      </div>
    </Link>
  );
}

function EarlyCard({ p }: { p: HomeProtocol }) {
  return (
    <Link
      href={`/${p.slug}`}
      className="flex items-center justify-between rounded-[18px] border border-border bg-surface-1 px-5 py-[18px] transition-[transform,border-color] duration-200 hover:border-accent/40 motion-safe:hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-3.5">
        <ProtocolMark slug={p.slug} name={p.name} size={34} radius={10} />
        <div className="text-[16px] font-semibold text-text-primary">{p.name}</div>
      </div>
      {p.status ? <StatusBadge status={p.status} /> : null}
    </Link>
  );
}

function RadarTile({ p }: { p: HomeProtocol }) {
  return (
    <Link
      href={`/${p.slug}`}
      className="pf-transition flex items-center gap-2.5 rounded-xl border border-border bg-bg px-3 py-2.5 hover:border-text-muted/40 hover:bg-surface-1"
    >
      <ProtocolMark slug={p.slug} name={p.name} size={24} radius={7} />
      <div className="truncate text-[13px] font-medium text-text-primary">{p.name}</div>
    </Link>
  );
}

function Protocols() {
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (p: HomeProtocol) => !q || p.name.toLowerCase().includes(q);

  const tierS = TIER_S.filter(match);
  const early = EARLY.filter(match);
  const radar = RADAR.filter(match);
  const empty = tierS.length + early.length + radar.length === 0;

  return (
    <div id="protocols" className="pb-4">
      <div className="flex flex-col items-start justify-between gap-4 pb-5 sm:flex-row sm:items-end">
        <div>
          <h2 className="mb-2 text-[30px] font-bold tracking-[-0.02em] text-text-primary">
            {tr(locale, "Protocols", "Протоколы")}
          </h2>
          <div className="text-[15px] text-text-muted">
            {tr(
              locale,
              "Pick the protocol whose points you want. Everything else follows from that.",
              "Выберите протокол, чьи поинты вам нужны. Всё остальное следует из этого.",
            )}
          </div>
        </div>
        <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-1 px-3.5 py-2.5 sm:w-[260px]">
          <span className="text-[13px] text-text-dim">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr(locale, "Search protocols", "Поиск протоколов")}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-dim"
          />
        </div>
      </div>

      {empty ? (
        <div className="rounded-[18px] border border-border bg-surface-1 px-5 py-10 text-center text-[14px] text-text-muted">
          {tr(locale, "No protocols match your search.", "Ничего не найдено.")}
        </div>
      ) : (
        <>
          {tierS.length > 0 && (
            <>
              <TierLabel>Tier S</TierLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                {tierS.map((p) => (
                  <TierSCard key={p.slug} p={p} />
                ))}
              </div>
            </>
          )}

          {early.length > 0 && (
            <>
              <div className="pt-[34px]">
                <TierLabel>{tr(locale, "Early stage", "Ранняя стадия")}</TierLabel>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {early.map((p) => (
                  <EarlyCard key={p.slug} p={p} />
                ))}
              </div>
            </>
          )}

          {radar.length > 0 && (
            <>
              <div className="pt-[34px]">
                <TierLabel>{tr(locale, "Radar", "Радар")}</TierLabel>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {radar.map((p) => (
                  <RadarTile key={p.slug} p={p} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   What PerpFarm compares
   -------------------------------------------------------------------------- */

function Compares() {
  const locale = useLocale();
  const factors = [
    {
      title: tr(locale, "Entry & exit execution", "Вход и выход"),
      body: tr(locale, "Maker and taker fees on all four fills of the cycle.", "Maker- и taker-комиссии на всех четырёх исполнениях цикла."),
    },
    {
      title: tr(locale, "Spread", "Спред"),
      body: tr(locale, "The gap you cross on each side of the hedge.", "Разрыв, который вы пересекаете на каждой стороне хеджа."),
    },
    {
      title: tr(locale, "Slippage", "Проскальзывание"),
      body: tr(locale, "Quote impact at your size, not at one lot.", "Влияние на цену при вашем размере, а не при одном лоте."),
    },
    {
      title: tr(locale, "Funding", "Фандинг"),
      body: tr(locale, "Paid or received over the holding period on both legs.", "Уплаченный или полученный за период удержания на обеих ногах."),
    },
    {
      title: tr(locale, "Market depth", "Глубина рынка"),
      body: tr(locale, "How much size the book absorbs before price moves.", "Сколько объёма стакан поглощает до движения цены."),
    },
    {
      title: tr(locale, "Open interest", "Открытый интерес"),
      body: tr(locale, "Whether a market is deep enough to be worth farming.", "Достаточно ли рынок глубок, чтобы его фармить."),
    },
    {
      title: tr(locale, "Reward mechanics", "Механики наград"),
      body: tr(locale, "Tiers, referral boosts and what each protocol counts.", "Тиры, реферальные бусты и что учитывает каждый протокол."),
    },
    {
      title: tr(locale, "Active competitions", "Активные соревнования"),
      body: tr(locale, "Extra weight on eligible markets while a contest runs.", "Доп. вес на подходящих рынках, пока идёт конкурс."),
    },
  ];
  return (
    <div className="pt-[76px]">
      <h2 className="mb-2 text-[30px] font-bold tracking-[-0.02em] text-text-primary">
        {tr(locale, "What PerpFarm compares", "Что сравнивает PerpFarm")}
      </h2>
      <div className="pb-6 text-[15px] text-text-muted">
        {tr(
          locale,
          "Every cost that moves between two protocols, priced for the volume you enter.",
          "Каждая стоимость между двумя протоколами, посчитанная под введённый вами объём.",
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {factors.map((f) => (
          <div
            key={f.title}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-1 p-[18px]"
          >
            <div className="text-[14px] font-semibold text-text-primary">{f.title}</div>
            <div className="text-[13px] leading-[1.6] text-text-muted">{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Inline footer
   -------------------------------------------------------------------------- */

function InlineFooter() {
  const locale = useLocale();
  const link = "pf-transition text-[13px] text-text-muted hover:text-text-primary";
  return (
    <div className="mt-[76px] flex flex-col items-start justify-between gap-4 border-t border-border pb-16 pt-7 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2.5">
        <Image src="/icon.svg" alt="" aria-hidden width={22} height={22} className="h-[22px] w-[22px] rounded-[7px]" />
        <div className="text-[13px] text-text-muted">
          {tr(
            locale,
            "Estimates from public data · Not financial advice",
            "Оценки по публичным данным · Не финансовый совет",
          )}
        </div>
      </div>
      <div className="flex items-center gap-6">
        <Link href="/methodology" className={link}>
          {tr(locale, "Methodology", "Методология")}
        </Link>
        <a href="https://x.com/devilonnn" target="_blank" rel="noreferrer" className={link}>
          Twitter
        </a>
        <div className="font-mono-num text-[12px] text-text-dim">
          {tr(locale, "data refreshed hourly", "данные обновляются ежечасно")}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function HomeV2() {
  return (
    <div
      style={{
        backgroundImage:
          "radial-gradient(1100px 520px at 78% -6%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)",
      }}
    >
      <Header />
      <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
        <Hero />
        <HowItWorks />
        <Protocols />
        <Compares />
        <InlineFooter />
      </div>
    </div>
  );
}
