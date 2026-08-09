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
          {tr(locale, "HOW PERPFARM WORKS", "КАК УСТРОЕН PERPFARM")}
        </div>
        <h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.032em] text-text-primary sm:text-[56px]">
          {tr(locale, "How PerpFarm works", "Как устроен PerpFarm")}
        </h1>
        <p className="text-[17px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "PerpFarm researches how each protocol rewards farming, verifies the rules, and estimates the real cost of following them — so you can farm efficiently at a known cost. It never predicts how many points a protocol will emit or the value of a point.",
            "PerpFarm исследует, как каждый протокол награждает за фарм, проверяет правила и оценивает реальную стоимость их исполнения — чтобы вы фармили эффективно при понятной цене. Сайт никогда не предсказывает, сколько поинтов выдаст протокол, и не оценивает цену поинта.",
          )}
        </p>
      </div>
    </div>
  );
}

/** The hedge-cycle 3D (LONG/SHORT entry+exit over the net-funding layer) — sits
 *  next to the cost formula it illustrates. */
function HedgeRouteCard() {
  const locale = useLocale();
  return (
    <div className="mb-4 overflow-hidden rounded-[20px] border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(180deg, #10162a, #0a0e18)" }}>
      <div className="flex items-center justify-between gap-4 px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="font-mono-num text-[11px] uppercase tracking-[0.1em]" style={{ color: "#8b96ad" }}>
          {tr(locale, "Hedge route", "Хедж-маршрут")}
        </div>
        <div className="flex items-center gap-5 text-[12px]" style={{ color: "#8b96ad" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "#4d8dff" }} />
            {tr(locale, "Route cost", "Стоимость маршрута")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "#f0b45a" }} />
            {tr(locale, "Funding layer", "Фандинг")}
          </span>
        </div>
      </div>
      <RouteMap mode="checkpoints" height={260} />
    </div>
  );
}

function Approach() {
  const locale = useLocale();
  const steps = [
    {
      n: "01",
      title: tr(locale, "Analyse farming strategies", "Анализируем стратегии фарма"),
      body: tr(locale, "We work out what actually earns points — holding time, medium-OI markets, passive liquidity, tiers and activity — and how to farm them.", "Разбираемся, что реально приносит поинты — время удержания, рынки среднего OI, пассивная ликвидность, тиры и активность — и как их фармить."),
    },
    {
      n: "02",
      title: tr(locale, "Collect public data", "Собираем публичные данные"),
      body: tr(locale, "We collect buy and sell quotes, spread and quote impact at each tested size, open interest, 24h trading volume, funding and published fees from public protocol data. Market snapshots are saved hourly.", "Собираем котировки покупки и продажи, спред и quote impact для каждого проверяемого размера, open interest, торговый объём за 24ч, фандинг и опубликованные комиссии из публичных данных протоколов. Снимки рынка сохраняются каждый час."),
    },
    {
      n: "03",
      title: tr(locale, "Verify reward rules", "Проверяем правила наград"),
      body: tr(locale, "We read each protocol's docs and mark what is publicly confirmed versus a planning assumption.", "Читаем документацию каждого протокола и отмечаем, что публично подтверждено, а что — предположение для планирования."),
    },
    {
      n: "04",
      title: tr(locale, "Estimate execution cost", "Оцениваем стоимость исполнения"),
      body: tr(locale, "We price the full hedge cycle at your size, so you can follow the strategy on the cheapest route.", "Считаем полный хедж-цикл под ваш размер, чтобы следовать стратегии по самому дешёвому маршруту."),
    },
  ];
  return (
    <section className="pt-13">
      <H2
        title={tr(locale, "Our approach", "Наш подход")}
        sub={tr(locale, "First how to farm, then what it costs — in that order.", "Сначала как фармить, потом сколько это стоит — именно в таком порядке.")}
      />
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface-1 p-6">
            <div className="font-mono-num text-[11px] text-accent">{s.n}</div>
            <div className="text-[16px] font-semibold text-text-primary">{s.title}</div>
            <div className="text-[14px] leading-[1.62] text-text-muted">{s.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InputCards() {
  const locale = useLocale();
  const card = "flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-6";
  const num = (n: string) => <div className="font-mono-num text-[11px] text-accent">{n}</div>;
  const chip = (t: string) => <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-mono-num text-[11px] text-text-primary">{t}</span>;
  return (
    <section className="pt-13">
      <H2 title={tr(locale, "What is included in a route calculation", "Что входит в расчёт маршрута")} sub={tr(locale, "Five inputs, in the order the model applies them.", "Пять входов — в порядке, в котором их применяет модель.")} />
      <div className="grid gap-3.5 md:grid-cols-3">
        <div className={card}>
          <div className="flex items-center gap-3">{num("01")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Market eligibility", "Пригодность рынка")}</div></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Only tradable markets are considered: asset availability, enough liquidity for the selected position size, sufficient market activity, and any protocol-specific eligibility rules.", "Учитываются только торгуемые рынки: доступность актива, достаточная ликвидность для выбранного размера позиции, достаточная рыночная активность и правила eligibility конкретного протокола.")}</div>
          <div className="mt-auto flex flex-wrap gap-1.5">{chip("availability")}{chip("liquidity")}{chip("eligibility")}</div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">{num("02")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Entry and exit", "Вход и выход")}</div></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Each route opens and closes both hedge legs. The model prices the complete cycle, not one trade. Fees and execution costs are applied according to each protocol and order type.", "Каждый маршрут открывает и закрывает обе ноги хеджа. Модель считает полный цикл, а не одну сделку. Комиссии и стоимость исполнения учитываются по правилам каждого протокола и типу ордера.")}</div>
          <div className="mt-auto grid grid-cols-2 gap-1.5">
            <div className="rounded-[9px] border border-positive/20 bg-positive/[0.06] px-3 py-2 font-mono-num text-[11px] text-positive">LONG entry</div>
            <div className="rounded-[9px] border border-positive/20 bg-positive/[0.06] px-3 py-2 font-mono-num text-[11px] text-positive">LONG exit</div>
            <div className="rounded-[9px] border border-negative/20 bg-negative/[0.06] px-3 py-2 font-mono-num text-[11px] text-negative">SHORT entry</div>
            <div className="rounded-[9px] border border-negative/20 bg-negative/[0.06] px-3 py-2 font-mono-num text-[11px] text-negative">SHORT exit</div>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">{num("03")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Spread and quote impact", "Спред и quote impact")}</div></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Published fees can be zero while execution still costs. PerpFarm adds half-spread and quote impact at your size, using the 24h median with a typical range.", "Опубликованные комиссии могут быть нулевыми, а исполнение всё равно стоит. PerpFarm добавляет полспреда и quote impact на ваш размер — по медиане за 24ч с типичным диапазоном.")}</div>
          <div className="mt-auto flex items-center justify-between rounded-[10px] bg-surface-2 px-3.5 py-3">
            <span className="text-[12px] text-text-muted">{tr(locale, "Published fee", "Комиссия")}</span>
            <span className="font-mono-num text-[13px] text-text-dim">$0.00</span>
            <span className="text-[12px] text-text-muted">{tr(locale, "Real cost", "Реальная")}</span>
            <span className="font-mono-num text-[13px] text-text-primary">$6.20</span>
          </div>
        </div>
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-6">
          <div className="flex items-center gap-3">{num("04")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Funding", "Фандинг")}</div><span className="ml-auto rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono-num text-[10px] text-warning">{tr(locale, "ESTIMATE", "ОЦЕНКА")}</span></div>
          <div className="text-[14px] leading-[1.65] text-text-muted">{tr(locale, "Funding is shown separately from execution cost. For cross-protocol routes, we average the two funding rates over the latest 24h and estimate the difference for a fixed 12-hour hold. A + value is an expected credit; a − value is an expected payment. Equal-size legs on one protocol net to $0. Funding can change while the hedge is open, so it never changes the route ranking.", "Фандинг показан отдельно от стоимости исполнения. Для кросс-маршрута мы усредняем ставки двух площадок за последние 24ч и оцениваем разницу для фиксированного удержания 12 часов. Значение со знаком + — ожидаемый доход, со знаком − — ожидаемый расход. Ноги равного размера на одной площадке нетятся в $0. Фандинг может меняться во время удержания, поэтому не влияет на ранжирование маршрута.")}</div>
        </div>
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface-1 p-6 md:col-span-2">
          <div className="flex items-center gap-3">{num("05")}<div className="text-[17px] font-semibold text-text-primary">{tr(locale, "Protocol reward mechanics", "Механики наград протокола")}</div></div>
          <div className="max-w-[640px] text-[14px] leading-[1.65] text-text-muted">{tr(locale, "The protocol rules that affect farming efficiency are shown alongside the route analysis.", "Правила протокола, влияющие на эффективность фарма, показываются вместе с анализом маршрута.")}</div>
          <div className="flex flex-wrap gap-1.5">
            {["holding time", "open interest", "eligible volume", "maker liquidity", "activity"].map((m) => (
              <span key={m} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-text-primary">{m}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
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
    <section className="pt-13">
      <H2
        title={tr(locale, "How a route cost is built", "Из чего складывается стоимость маршрута")}
        sub={tr(
          locale,
          "Routes are ranked by their complete hedge-cycle cost, not by the published trading fee alone.",
          "Маршруты ранжируются по полной стоимости хедж-цикла, а не только по опубликованной торговой комиссии.",
        )}
      />
      <HedgeRouteCard />
      <div className="rounded-[20px] border border-accent/20 p-6 sm:p-8" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), var(--surface-1) 55%)" }}>
        <div className="font-mono-num text-[11px] uppercase tracking-[0.1em] text-accent">
          {tr(locale, "Full hedge-cycle cost =", "Полная стоимость хедж-цикла =")}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pt-4">
          {step(tr(locale, "LONG entry", "Вход LONG"), "long")}
          <span className="font-mono-num text-[16px] text-text-dim">+</span>
          {step(tr(locale, "LONG exit", "Выход LONG"), "long")}
          <span className="font-mono-num text-[16px] text-text-dim">+</span>
          {step(tr(locale, "SHORT entry", "Вход SHORT"), "short")}
          <span className="font-mono-num text-[16px] text-text-dim">+</span>
          {step(tr(locale, "SHORT exit", "Выход SHORT"), "short")}
          <span className="font-mono-num text-[16px] text-text-dim">+</span>
          <span className="rounded-[11px] border border-warning/25 bg-warning/[0.06] px-3.5 py-2.5 font-mono-num text-[13px] text-warning">
            {tr(locale, "funding · 12h", "фандинг · 12ч")}
          </span>
        </div>

        <div className="mt-6 max-w-[900px] border-t border-border pt-5 text-[15px] leading-[1.68] text-text-muted">
          {tr(
            locale,
            "In plain words: execution cost = your position size × (half the spread you cross + quote impact) for each MARKET order + applicable fees on all fills. Funding is estimated separately for a 12-hour hold and does not change the ranking.",
            "Простыми словами: стоимость исполнения = размер позиции × (половина пересекаемого спреда + quote impact) для каждого MARKET-ордера + применимые комиссии всех исполнений. Фандинг оценивается отдельно для удержания 12 часов и не влияет на ранжирование.",
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
            <div className="text-[15px] font-semibold text-text-primary">{tr(locale, "Typical 24h cost range", "Типичный диапазон стоимости за 24ч")}</div>
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

function DataBasis() {
  const locale = useLocale();
  const item = (label: string) => (
    <div className="whitespace-nowrap rounded-[10px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] text-text-primary">
      {label}
    </div>
  );

  return (
    <section className="pt-13">
      <H2
        title={tr(locale, "Data behind the estimate", "Данные в основе оценки")}
        sub={tr(
          locale,
          "Current quotes are read when you run a calculation. Market history is saved hourly; the 24h cost range is built from those observations.",
          "Текущие котировки запрашиваются при запуске расчёта. История рынка сохраняется каждый час; диапазон за 24ч строится по этим наблюдениям.",
        )}
      />
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface-1">
        <div className="grid md:grid-cols-[1.35fr_1fr]">
          <div className="p-6 sm:p-7 md:border-r md:border-border">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                <h3 className="text-[17px] font-semibold text-text-primary">{tr(locale, "Observed market data", "Наблюдаемые рыночные данные")}</h3>
              </div>
              <span className="rounded-md bg-positive/10 px-2 py-1 font-mono-num text-[10px] uppercase tracking-[0.08em] text-positive">{tr(locale, "OBSERVED", "НАБЛЮДАЕТСЯ")}</span>
            </div>
            <p className="pt-2 text-[14px] leading-[1.6] text-text-muted md:min-h-[45px]">
              {tr(locale, "Used directly when routes are ranked.", "Используются напрямую при ранжировании маршрутов.")}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:mt-[26px]">
              {item(tr(locale, "Current quotes", "Текущие котировки"))}
              {item(tr(locale, "Open interest & 24h trading volume", "OI и торговый объём за 24ч"))}
              {item(tr(locale, "Spread & impact", "Спред и влияние"))}
              {item(tr(locale, "Typical 24h cost range", "Диапазон стоимости за 24ч"))}
            </div>
          </div>

          <div className="border-t border-border p-6 sm:p-7 md:border-l-0 md:border-t-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                <h3 className="text-[17px] font-semibold text-text-primary">{tr(locale, "Estimated over the hold", "Оценивается на период удержания")}</h3>
              </div>
              <span className="rounded-md bg-warning/10 px-2 py-1 font-mono-num text-[10px] uppercase tracking-[0.08em] text-warning">{tr(locale, "ESTIMATED", "ОЦЕНКА")}</span>
            </div>
            <p className="pt-2 text-[14px] leading-[1.6] text-text-muted md:min-h-[45px]">
              {tr(
                locale,
                "These values depend on market conditions after you run the calculation.",
                "Эти значения зависят от состояния рынка после запуска расчёта.",
              )}
            </p>
            <div className="mt-4 grid gap-2">
              {item(tr(locale, "Exit cost", "Стоимость выхода"))}
              {item(tr(locale, "Net funding", "Чистый фандинг"))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-4 rounded-[16px] border border-warning/20 bg-surface-1 px-5 py-4">
        <span className="w-[3px] flex-none rounded-full bg-warning" />
        <p className="text-[14px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "Protocol rules can change. PerpFarm separates publicly confirmed rules from planning assumptions.",
            "Правила протоколов могут меняться. PerpFarm отделяет публично подтверждённые правила от предположений для планирования.",
          )}
        </p>
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
        <Approach />
        <InputCards />
        <CostModel />
        <DataBasis />

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
