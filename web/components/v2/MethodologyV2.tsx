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

/**
 * The six inputs, as full-width rows rather than a three-column card grid.
 *
 * The grid was the wrong container for this content. In a row of three, every
 * card stretches to the tallest, so the moment one input needed two paragraphs
 * (the liquidity floors) its neighbours grew with it and stood half empty; two
 * of the six also had to span two columns, leaving a third of the row blank.
 * Prose of uneven length wants rows, not equal-height cells.
 *
 * Each row keeps its title in a fixed left rail so all six titles line up, and
 * holds its text to a ~75-character measure, which is comfortable to read.
 * The body is set in the PRIMARY text colour: muted is the token for captions
 * and secondary notes, and using it for the main explanation is what made this
 * section read as washed out.
 */
function InputRow({
  index,
  title,
  badge,
  children,
}: {
  index: string;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-border bg-surface-1 p-6 sm:p-7">
      <div className="grid gap-4 lg:grid-cols-[minmax(180px,232px)_1fr] lg:gap-9">
        <div className="flex items-start gap-3">
          <span className="font-mono-num text-[11px] leading-[1.75] text-accent">{index}</span>
          <div className="flex flex-col items-start gap-2">
            <h3 className="text-[17px] font-semibold leading-[1.35] text-text-primary">{title}</h3>
            {badge}
          </div>
        </div>
        <div className="flex flex-col gap-3.5">{children}</div>
      </div>
    </div>
  );
}

function InputCards() {
  const locale = useLocale();
  // Measured, not guessed: `68ch` resolved to 747px here, because `ch` is the
  // width of Jakarta's zero (~0.73em) rather than an average letter -- that put
  // 95 characters on a line, well past comfortable reading. 600px lands at
  // roughly 75.
  const body = "max-w-[600px] text-[15px] leading-[1.7] text-text-primary";
  const note = "max-w-[600px] text-[13px] leading-[1.65] text-text-muted";
  const order = (label: string, tone: "long" | "short") => (
    <span
      key={label}
      className={`rounded-[9px] border px-3 py-2 font-mono-num text-[11px] ${
        tone === "long"
          ? "border-positive/20 bg-positive/[0.06] text-positive"
          : "border-negative/20 bg-negative/[0.06] text-negative"
      }`}
    >
      {label}
    </span>
  );

  return (
    <section className="pt-13">
      <H2
        title={tr(locale, "What is included in a route calculation", "Что входит в расчёт маршрута")}
        sub={tr(locale, "Six inputs, in the order the model applies them.", "Шесть входов — в порядке, в котором их применяет модель.")}
      />
      <div className="flex flex-col gap-3">
        <InputRow index="01" title={tr(locale, "Market eligibility", "Пригодность рынка")}>
          <p className={body}>
            {tr(
              locale,
              "A market is listed only if it can actually be traded at the size you entered. It has to show real turnover over the last 24 hours, and its open interest has to clear the floor set for that protocol.",
              "Рынок попадает в список, только если на нём реально можно исполнить введённый размер: за последние 24 часа на нём был настоящий оборот, а открытый интерес выше порога, заданного для этого протокола.",
            )}
          </p>
          <p className={body}>
            {tr(
              locale,
              "The floors are per protocol, because venues differ in size by orders of magnitude — one number would filter out everything on a small venue and nothing on a large one. Each protocol's own thresholds are shown on its page, next to the pair count.",
              "Пороги задаются отдельно для каждого протокола: площадки различаются по размеру на порядки, и одно общее число отсеяло бы на маленькой всё, а на крупной — ничего. Конкретные пороги протокола указаны на его странице, рядом со счётчиком пар.",
            )}
          </p>
          <p className={note}>
            {tr(
              locale,
              "On a cross-protocol route the two legs are held to different bars: the protocol you FARM applies its own floor, while the hedge leg only has to be a real market. The venue you farm sets the standard, not the one you hedge on — which is why the same two protocols can list a slightly different number of pairs depending on which one you start from.",
              "В кросс-маршруте к ногам разные требования: протокол, который вы ФАРМИТЕ, применяет свой порог, а хедж-ноге достаточно быть настоящим рынком. Планку задаёт площадка, которую вы фармите, а не та, на которой хеджируете, — поэтому те же два протокола могут показать разное число пар в зависимости от того, с какого вы начали.",
            )}
          </p>
        </InputRow>

        <InputRow index="02" title={tr(locale, "Entry and exit", "Вход и выход")}>
          <p className={body}>
            {tr(
              locale,
              "Each route opens and closes both hedge legs. The model prices the complete cycle, not one trade. Fees and execution costs are applied according to each protocol and order type.",
              "Каждый маршрут открывает и закрывает обе ноги хеджа. Модель считает полный цикл, а не одну сделку. Комиссии и стоимость исполнения учитываются по правилам каждого протокола и типу ордера.",
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {order("LONG entry", "long")}
            {order("LONG exit", "long")}
            {order("SHORT entry", "short")}
            {order("SHORT exit", "short")}
          </div>
        </InputRow>

        <InputRow index="03" title={tr(locale, "Spread and quote impact", "Спред и quote impact")}>
          <p className={body}>
            {tr(
              locale,
              "Published fees can be zero while execution still costs. PerpFarm adds half-spread and quote impact at your size, using the 24h median with a typical range.",
              "Опубликованные комиссии могут быть нулевыми, а исполнение всё равно стоит. PerpFarm добавляет полспреда и quote impact на ваш размер — по медиане за 24ч с типичным диапазоном.",
            )}
          </p>
          <div className="flex max-w-[420px] items-center justify-between gap-4 rounded-[10px] bg-surface-2 px-3.5 py-3">
            <span className="text-[12px] text-text-muted">{tr(locale, "Published fee", "Комиссия")}</span>
            <span className="font-mono-num text-[13px] text-text-dim">$0.00</span>
            <span className="text-[12px] text-text-muted">{tr(locale, "Real cost", "Реальная")}</span>
            <span className="font-mono-num text-[13px] text-text-primary">$6.20</span>
          </div>
        </InputRow>

        <InputRow
          index="04"
          title={tr(locale, "Funding", "Фандинг")}
          badge={
            <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono-num text-[10px] text-warning">
              {tr(locale, "ESTIMATE", "ОЦЕНКА")}
            </span>
          }
        >
          <p className={body}>
            {tr(
              locale,
              "Funding is shown separately from execution cost. For cross-protocol routes, we average the two funding rates over the latest 24h and estimate the difference for a fixed 12-hour hold. A + value is an expected credit; a − value is an expected payment. Equal-size legs on one protocol net to $0.",
              "Фандинг показан отдельно от стоимости исполнения. Для кросс-маршрута мы усредняем ставки двух площадок за последние 24ч и оцениваем разницу для фиксированного удержания 12 часов. Значение со знаком + — ожидаемый доход, со знаком − — ожидаемый расход. Ноги равного размера на одной площадке нетятся в $0.",
            )}
          </p>
          <p className={note}>
            {tr(
              locale,
              "Funding can change while the hedge is open, so it never changes the route ranking.",
              "Фандинг может меняться во время удержания, поэтому не влияет на ранжирование маршрута.",
            )}
          </p>
        </InputRow>

        <InputRow index="05" title={tr(locale, "What the spread-risk badge means", "Что означает плашка риска расхождения")}>
          <p className={body}>
            {tr(
              locale,
              "Two protocols price the same asset slightly differently, and that difference moves. A hedge is neutral only while it holds: the long leg is marked on one venue and the short leg on the other, so if the gap changes between opening and closing, the legs stop cancelling and the difference becomes real money.",
              "Два протокола оценивают один и тот же актив немного по-разному, и эта разница гуляет. Хедж нейтрален только пока она держится: длинная нога считается по цене одной площадки, короткая — по цене другой. Если разрыв изменится между входом и выходом, ноги перестанут гасить друг друга, а разница превратится в реальные деньги.",
            )}
          </p>
          <p className={body}>
            {tr(
              locale,
              "It appears on cross-protocol routes only — when both legs sit on one venue's book at one price, there is nothing to drift apart.",
              "Плашка показывается только на кросс-маршрутах: если обе ноги стоят на одном стакане по одной цене, расходиться нечему.",
            )}
          </p>
          <p className={body}>
            {tr(
              locale,
              "It is measured from saved prices with both venues read at the same moment. Every hour we take the gap between them, work out that pair's own normal gap, and count HOW OFTEN the gap sat further than 0.5% away from it. A constant offset is met on the way in and again on the way out, so it nets out; only leaving the usual place costs money. Out of the last week's readings: up to 5% of them is low risk, up to 15% medium, more is high.",
              "Считается по сохранённым ценам, причём обе площадки берутся в один и тот же момент. Каждый час мы смотрим разрыв между ними, определяем обычный для этой пары уровень и считаем, КАК ЧАСТО разрыв оказывался дальше 0.5% от него. Постоянный сдвиг встречается и на входе, и на выходе, поэтому схлопывается; денег стоит только уход с обычного места. Из наблюдений за последнюю неделю: до 5% — низкий риск, до 15% — средний, больше — высокий.",
            )}
          </p>
          <p className={note}>
            {tr(
              locale,
              "The window is seven days of hourly prices: enough readings to place a pair confidently, and a whole week so a market that behaves differently while its underlying is shut is not judged on a single stretch. A pair with too few readings is marked unknown instead of guessed at. It rates the price gap between venues and nothing else: not liquidation, not volatility, not protocol safety.",
              "Окно — семь дней почасовых цен: наблюдений хватает, чтобы уверенно отнести пару к уровню, а целая неделя нужна, чтобы рынок, который вне сессии базового актива ведёт себя иначе, не оценивался по одному куску. Пара со слишком малым числом наблюдений помечается как неизвестная, а не оценивается наугад. Плашка оценивает только разрыв цен между площадками: не ликвидацию, не волатильность и не надёжность протокола.",
            )}
          </p>
        </InputRow>

        <InputRow index="06" title={tr(locale, "Protocol reward mechanics", "Механики наград протокола")}>
          <p className={body}>
            {tr(
              locale,
              "The protocol rules that affect farming efficiency are shown alongside the route analysis.",
              "Правила протокола, влияющие на эффективность фарма, показываются вместе с анализом маршрута.",
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              tr(locale, "holding time", "время удержания"),
              tr(locale, "open interest", "открытый интерес"),
              tr(locale, "eligible volume", "зачётный объём"),
              tr(locale, "maker liquidity", "мейкер-ликвидность"),
              tr(locale, "activity", "активность"),
            ].map((label) => (
              <span key={label} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-text-primary">
                {label}
              </span>
            ))}
          </div>
        </InputRow>
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
                "The entered volume is turnover per account, not one order. $20,000 per account means a $10,000 entry and a $10,000 exit on each account — a $40,000 two-account cycle. It is priced on a $100 grid: $20,450 is costed as $20,500, and the figure shown is the one that was costed.",
                "Указанный объём — это оборот на одном аккаунте, а не размер одного ордера. $20,000 на аккаунт означает вход на $10,000 и выход на $10,000 на каждом аккаунте — полный цикл двух аккаунтов на $40,000. Расчёт идёт с шагом $100: $20,450 считается как $20,500, и показывается именно то число, по которому считали.",
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
                "The range shows the middle half of twelve saved observations — every second hour of the last 24 — so brief unusually cheap or expensive quotes do not dominate the result.",
                "Диапазон показывает среднюю половину двенадцати сохранённых наблюдений — каждый второй час за последние 24, — чтобы кратковременные необычно дешёвые или дорогие котировки не искажали результат.",
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
          "Every number comes from saved market snapshots, not from a live request when you press Run. The collector records each protocol hourly; a calculation reads twelve of those hours — every second hour across the last 24 — and the cost range is the middle half of them.",
          "Все числа берутся из сохранённых снимков рынка, а не из живого запроса в момент нажатия «Рассчитать». Сборщик записывает каждый протокол раз в час; расчёт читает двенадцать таких часов — каждый второй за последние 24, — а диапазон стоимости это их средняя половина.",
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
              {item(tr(locale, "Saved hourly quotes", "Сохранённые котировки за час"))}
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

      {/* Spread risk is explained here and nowhere else. It used to live in a
          hover tooltip on the badge itself, which is the wrong place for four
          sentences: it is a property of the route, not a footnote on a word. */}
      <div className="mt-4 rounded-[16px] border border-border bg-surface-1 p-6 sm:p-7">
        <h3 className="text-[17px] font-semibold text-text-primary">{tr(locale, "Spread risk", "Риск расхождения")}</h3>
        <p className="pt-2 text-[14px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "Two protocols price the same asset slightly differently, and that gap moves. A hedge is neutral only while the gap holds, so one that keeps leaving its usual place can cost more than the execution itself. This applies to cross-protocol routes only — both legs of a same-protocol route sit on one book at one price, so there is no gap to drift.",
            "Два протокола оценивают один и тот же актив немного по-разному, и этот разрыв гуляет. Хедж нейтрален только пока разрыв держится, поэтому разрыв, который постоянно уходит с обычного места, может стоить дороже самого исполнения. Это касается только кросс-протокольных маршрутов — обе ноги маршрута внутри одного протокола стоят в одном стакане по одной цене, и расходиться там нечему.",
          )}
        </p>
        <p className="pt-2.5 text-[14px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "It is measured, not estimated: we take the last 7 days of saved prices, read both venues at the same tick, and count how often their gap sat more than 50 bps away from its own median. Under 5% of readings is low, under 15% is medium, above that is high.",
            "Это измеряется, а не оценивается: берём сохранённые цены за последние 7 дней, читаем обе площадки в один и тот же момент и считаем, как часто их разрыв уходил больше чем на 50 б.п. от собственной медианы. Меньше 5% наблюдений — низкий, меньше 15% — средний, больше — высокий.",
          )}
        </p>
        <p className="pt-2.5 text-[14px] leading-[1.62] text-text-muted">
          {tr(
            locale,
            "A rating is a description, not a filter: routes are ranked by cost, and the badge tells you what you are taking on. The rating can change from day to day, because the measurement window moves with it.",
            "Рейтинг — это описание, а не фильтр: маршруты ранжируются по стоимости, а плашка говорит, что вы берёте на себя. Рейтинг может меняться день ото дня, потому что окно измерения едет вместе с ним.",
          )}
        </p>
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
