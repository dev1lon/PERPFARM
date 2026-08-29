/**
 * Per-protocol CONTENT for the protocol page.
 *
 * The page itself -- every window, label, button, badge and link -- is one
 * layout defined in `components/v2/ProtocolPageV2.tsx`, with the Variational
 * page as the reference. Only what is genuinely protocol-specific lives here:
 * the numbers in the hero, the points/execution guidance, the hedge partner
 * card, and whether an activity or a points programme exists at all.
 *
 * Adding a protocol means adding an entry below. It must never mean writing a
 * second page that drifts from this one -- TxFlow used to be a separate file
 * and had quietly lost the "no data yet" state on its hedge card, so it badged
 * a route "Lowest cost" even when the comparison had failed to load.
 */
import { tr, type Locale } from "@/components/LocaleProvider";
import { farmEstimateTip, otcPointTip } from "@/components/v2/InfoTip";

export type ProtocolSlug =
  | "variational"
  | "txflow"
  | "qfex"
  | "risex"
  | "polymarket"
  | "entropy";

export type HeroMetric = { label: string; value: string; valueClass?: string; tip?: string };

export type Priority = { label: string; kicker: string; title: string; body: string; primary: boolean };
export type PracticalTip = { n: string; title: string; body: string };

export type HedgePartnerCard = {
  /** Any listed protocol, not only the two with a live data path: this card is
   *  the MANUAL leg a farmer places by hand, so it can point at a venue the
   *  calculator has no adapter for. */
  slug: string;
  body: string;
  tags: Array<[string, "ok" | "warn" | "neutral"]>;
};

/** A running competition or bonus, or an explicit "nothing is running". */
export type ActivityConfig =
  | {
      kind: "campaign";
      name: string;
      /** Local window in UTC ms; the page decides whether it is live. */
      startUtc: number;
      endUtc: number;
      meta: string;
      body: string;
      eligibleLabel: string;
      eligibleValue: string;
      rulesUrl: string;
      /** Shown once the window has closed. */
      endedNote: string;
      /** A pool that unlocks in steps as combined volume grows, drawn as the
       *  venue draws it. Absent for campaigns with a fixed pool. */
      progress?: {
        valueUsd: number;
        valueLabel: string;
        tiers: Array<{ atUsd: number; poolUsd: number }>;
      };
    }
  | { kind: "none" };

/** A points programme with a measurable distribution, or none announced. */
export type PointsConfig =
  | {
      kind: "season";
      seasonLabel: string;
      basePoints: number;
      weeklyDrop: number;
      perCampaign: number;
      completedCampaigns: number;
      /** A known drop day, and how many farming weeks were done by then. */
      weekAnchorUtc: number;
      weeksAtAnchor: number;
      remainingAtAnchor: number;
    }
  | { kind: "none" };

export type ProtocolPageConfig = {
  slug: ProtocolSlug;
  name: string;
  twitterUrl: string;
  docsUrl: string;
  /** Where to actually trade the protocol. Referral links, so the discount they
   *  carry is the one the calculator already prices in. */
  tradeUrl: string;
  /** Shown beside the trade link when the referral carries a fee discount. */
  tradePerk?: { en: string; ru: string };
  heroMetrics: HeroMetric[];
  guidance: {
    kicker: string;
    intro: string;
    priorities: Priority[];
    tips: PracticalTip[];
    docsUrl: string;
    docsLabel: string;
  };
  hedge: { intro: string; partner: HedgePartnerCard };
  activity: ActivityConfig;
  points: PointsConfig;
};

/**
 * TxFlow's "Trade & Unlock" campaign.
 *
 * Read off the venue's own campaign page and refreshed by hand. Deliberately
 * NOT computed: the prize pool unlocks on the COMBINED volume of every
 * participant and each share is settled on net fees paid, so any figure we
 * derived for one farmer would be a guess dressed as arithmetic. What the page
 * states is the fact that a pool exists and how far the field has got -- the
 * farmer decides what that is worth.
 */
/**
 * TxFlow's "Daily 100K Heist", read off the campaign page on 2026-08-23.
 *
 * The rule that matters to a farmer here is the eligibility one, not the pool
 * size: ONLY PERPETUAL TAKER VOLUME COUNTS. Our own hedge route deliberately
 * rests one leg as a maker to pay the cheaper fee, and that leg earns nothing
 * toward this campaign. Stating the pool without stating that would send people
 * to farm it the way that does not count.
 */
const TXFLOW_CAMPAIGN = {
  startUtc: Date.UTC(2026, 7, 21, 0, 0, 0),
  endUtc: Date.UTC(2026, 7, 31, 0, 0, 0),
  /** A fixed pool handed out each day, not one unlocked by the field's volume. */
  dailyPoolUsd: 100_000,
  days: 10,
  totalPoolUsd: 1_000_000,
  /** Daily taker volume -> that day's reward. Highest tier reached only; they
   *  do not stack, and nothing carries into the next day. */
  tiers: [
    { volumeUsd: 200_000, rewardUsd: 5 },
    { volumeUsd: 500_000, rewardUsd: 15 },
    { volumeUsd: 1_000_000, rewardUsd: 35 },
    { volumeUsd: 1_500_000, rewardUsd: 60 },
    { volumeUsd: 2_500_000, rewardUsd: 100 },
  ],
};

/** "$200K → $5 · $500K → $15 · …", built from the ladder above. */
function txflowTierLine(): string {
  return TXFLOW_CAMPAIGN.tiers
    .map((tier) => `$${tier.volumeUsd >= 1_000_000
      ? `${tier.volumeUsd / 1_000_000}M`
      : `${tier.volumeUsd / 1_000}K`} → $${tier.rewardUsd}`)
    .join(" · ");
}

const VARIATIONAL_COMPETITION_START_UTC = Date.UTC(2026, 6, 17, 0, 0, 0);
const VARIATIONAL_COMPETITION_END_UTC = Date.UTC(2026, 6, 31, 0, 0, 0);

function variational(locale: Locale): ProtocolPageConfig {
  return {
    slug: "variational",
    name: "Variational",
    tradeUrl: "https://omni.variational.io/?ref=OMNI6VEMG0I8",
    twitterUrl: "https://x.com/variational_io",
    docsUrl: "https://docs.variational.io/omni",
    heroMetrics: [
      { label: tr(locale, "Season", "Сезон"), value: "1" },
      { label: tr(locale, "Farm estimate", "Оценка фарма"), value: "$5–11/pt", valueClass: "text-positive", tip: farmEstimateTip(locale) },
      { label: tr(locale, "OTC point price", "OTC цена поинта"), value: "$24", tip: otcPointTip(locale) },
    ],
    guidance: {
      kicker: tr(locale, "How Variational awards points", "Как Variational начисляет поинты"),
      intro: tr(
        locale,
        "Points are driven first by medium OI and holding time; volume helps, but comes second.",
        "Главные факторы поинтов — средний OI и время удержания; объём помогает, но идёт вторым.",
      ),
      priorities: [
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
      ],
      tips: [
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
      ],
      docsUrl: "https://docs.variational.io/omni/",
      docsLabel: tr(locale, "Reward tiers and full program rules in the docs ↗", "Reward-тиры и полные правила программы в документации ↗"),
    },
    hedge: {
      intro: tr(
        locale,
        "General guidance for Variational, independent of the calculation below.",
        "Общие рекомендации по Variational, независимо от расчёта ниже.",
      ),
      partner: {
        slug: "txflow",
        body: tr(
          locale,
          "Early perp-dex focused on TradFi markets, like Variational. Potential retro points.",
          "Ранний perp-dex с фокусом на TradFi-рынки, как и Variational. Потенциальные ретро-поинты.",
        ),
        tags: [
          [tr(locale, "Farm retro points", "Фарм ретро-поинтов"), "ok"],
          [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
        ],
      },
    },
    activity: {
      kind: "campaign",
      name: "TradFi Trading Competition #5",
      startUtc: VARIATIONAL_COMPETITION_START_UTC,
      endUtc: VARIATIONAL_COMPETITION_END_UTC,
      meta: `2026-07-17 → 2026-07-31 · $20,000 ${tr(locale, "prizes", "призы")}`,
      body: tr(
        locale,
        "Joining is effectively required for max points: at the end of every competition an extra 20,000 points are handed out by trading volume on eligible assets (currently TradFi). Score: TradFi PnL × √TradFi volume.",
        "Участие фактически обязательно для максимума поинтов: в конце каждого турнира дополнительно раздаётся 20 000 поинтов по объёму торгов на eligible-активах (сейчас TradFi). Score: TradFi PnL × √TradFi volume.",
      ),
      eligibleLabel: tr(locale, "Eligible", "Eligible"),
      eligibleValue: tr(locale, "all TradFi markets", "все TradFi-рынки"),
      rulesUrl: "https://docs.variational.io/omni/trading-competition",
      endedNote: tr(
        locale,
        "The last competition ended on 2026-07-31; its 20,000-point distribution is already counted in the total.",
        "Последний турнир завершился 31.07.2026 — его раздача 20 000 поинтов уже учтена в общем количестве.",
      ),
    },
    points: {
      kind: "season",
      seasonLabel: "Season 1",
      basePoints: 3_000_000,
      weeklyDrop: 150_000,
      perCampaign: 20_000,
      completedCampaigns: 5,
      weekAnchorUtc: Date.UTC(2026, 6, 17, 0, 0, 0),
      weeksAtAnchor: 32,
      remainingAtAnchor: 1_500_000,
    },
  };
}

function txflow(locale: Locale): ProtocolPageConfig {
  const retroTip = tr(
    locale,
    "TxFlow has not announced a points or retroactive program. PerpFarm considers one likely; this is our view, not an official claim.",
    "TxFlow не анонсировал программу поинтов или ретродроп. PerpFarm считает её вероятной; это наше мнение, а не заявление протокола.",
  );
  return {
    slug: "txflow",
    name: "TxFlow",
    tradeUrl: "https://app.txflow.com/r/TXDEVILON",
    tradePerk: { en: "5% fee discount", ru: "−5% к комиссии" },
    twitterUrl: "https://x.com/TxFlow_L1",
    docsUrl: "https://docs.txflow.com",
    heroMetrics: [
      { label: tr(locale, "Season", "Сезон"), value: "0" },
      // Same three reference tiles. There is no announced programme, so instead
      // of an invented $/pt range the tile names what is actually being farmed
      // here; the tip keeps the caveat that retro points are our expectation.
      { label: tr(locale, "Farm estimate", "Оценка фарма"), value: tr(locale, "Retro points", "Ретро-поинты"), valueClass: "text-positive", tip: retroTip },
      { label: tr(locale, "OTC point price", "OTC цена поинта"), value: "TBA", tip: otcPointTip(locale) },
    ],
    guidance: {
      kicker: tr(locale, "How TxFlow awards points", "Как TxFlow начисляет поинты"),
      intro: tr(
        locale,
        "No points programme is announced yet, so this is PerpFarm's opinion.",
        "Программа поинтов пока не анонсирована, так что это наше мнение.",
      ),
      priorities: [
        {
          label: "Priority 1",
          kicker: tr(locale, "strongest driver", "главный фактор"),
          title: tr(locale, "Eligible volume", "Подходящий объём"),
          body: tr(
            locale,
            "PerpFarm's view is to favour TradFi, where the protocol is focused, while building natural volume on the top markets.",
            "По мнению PerpFarm, стоит делать упор на TradFi — это фокус протокола — и набирать естественный объём в топовых рынках.",
          ),
          primary: true,
        },
        {
          label: "Priority 2",
          kicker: tr(locale, "secondary", "вторично"),
          title: tr(locale, "Hold 2–4 hours, keep activity organic", "Держите 2–4 часа, торгуйте органично"),
          body: tr(
            locale,
            "Hold a position for 2–4 hours rather than closing it straight away. TxFlow runs on its own L1, so every action a trader takes is written on chain — use TP/SL and stay clear of wash trading. With no public points criteria, spot activity may also be worth considering; the pair calculator prices Perps only and does not estimate spot execution.",
            "Держите позицию 2–4 часа, а не закрывайте сразу. TxFlow работает на собственном L1-чейне, поэтому все действия трейдера записываются в блокчейн — используйте TP/SL и не занимайтесь wash-трейдингом. Пока нет публичных критериев поинтов, можно также рассмотреть активность на споте; калькулятор пар считает только Perps и не оценивает исполнение на споте.",
          ),
          primary: false,
        },
      ],
      tips: [
        {
          n: "01",
          title: tr(locale, "Sign up through a referral", "Регистрируйтесь по рефералу"),
          body: tr(
            locale,
            "A referral link takes 5% off the trading fee, and on TxFlow the fee is most of what a route costs.",
            "Реферальная ссылка даёт 5% скидки на комиссию, а на TxFlow комиссия — большая часть стоимости маршрута.",
          ),
        },
        {
          n: "02",
          title: tr(locale, "Trade with LIMIT orders", "Торгуйте лимитными ордерами"),
          body: tr(
            locale,
            "A LIMIT order pays the maker fee, which is cheaper.",
            "Лимитный ордер исполняется по maker fee, а это дешевле.",
          ),
        },
        {
          n: "03",
          title: tr(locale, "Join the running competitions", "Участвуйте в активных соревнованиях"),
          body: tr(
            locale,
            "TxFlow runs volume campaigns with USDC prize pools; joining one makes the same volume worth more.",
            "TxFlow проводит объёмные кампании с призовыми пулами в USDC — участие делает тот же объём выгоднее.",
          ),
        },
        {
          n: "04",
          title: tr(locale, "Trade some volume from the phone", "Наберите часть объёма с телефона"),
          body: tr(
            locale,
            "TxFlow already ships a full mobile app. Putting at least part of your volume through it is a strong on-chain signal.",
            "У TxFlow уже запущено полноценное мобильное приложение. Набрать хотя бы часть объёма через него — сильный on-chain сигнал.",
          ),
        },
      ],
      docsUrl: "https://docs.txflow.com/perp/trading-fees",
      docsLabel: tr(locale, "Reward tiers and full program rules in the docs ↗", "Reward-тиры и полные правила программы в документации ↗"),
    },
    hedge: {
      intro: tr(
        locale,
        "General guidance for TxFlow, independent of the calculation below.",
        "Общие рекомендации по TxFlow, независимо от расчёта ниже.",
      ),
      // The MANUAL second leg, deliberately not the computed one: the card
      // above already names the cheapest route the worker found. QFEX is a
      // suggestion for the leg a farmer places by hand.
      //
      // Verified on qfex.com: "the first 24/7 exchange only for US equities,
      // commodities and FX" -- the same RWA ground TxFlow trades. Their own
      // docs say nothing about points or retroactive credit, so that part is
      // worded as an expectation, not as their claim.
      partner: {
        slug: "qfex",
        body: tr(
          locale,
          "RWA perps on the same ground as TxFlow — US equities, commodities and FX, around the clock. Early stage with no announced points, so activity here may be counted later.",
          "RWA-перпы на том же поле, что и TxFlow — акции США, сырьё и FX, круглосуточно. Ранняя стадия, поинты не анонсированы, поэтому активность может быть зачтена позже.",
        ),
        tags: [
          [tr(locale, "Retro activity", "Ретро-активность"), "ok"],
          [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
        ],
      },
    },
    activity: {
      kind: "campaign",
      name: "Daily 100K Heist · $1,000,000 USDC",
      startUtc: TXFLOW_CAMPAIGN.startUtc,
      endUtc: TXFLOW_CAMPAIGN.endUtc,
      meta: `$${(TXFLOW_CAMPAIGN.dailyPoolUsd / 1000).toFixed(0)}K ${tr(locale, "every day", "каждый день")} · ${TXFLOW_CAMPAIGN.days} ${tr(locale, "days", "дней")}`,
      body: tr(
        locale,
        `Only PERPETUAL TAKER volume counts — maker volume is excluded, and so is volume from Fee Credit redemptions or self-matched trades. A position has to be held at least a minute, and trading must be manual. That matters for the hedge below: its resting LIMIT leg is a maker leg and earns nothing here, so only the MARKET leg builds campaign volume. Your total resets at 00:00 UTC every day, and only the highest tier you reach that day pays: ${txflowTierLine()}. The $100,000 daily pool is allocated from the highest volumes down until it runs out, and whatever is left does not carry over.`,
        `Засчитывается только ТЕЙКЕРСКИЙ объём по перпам — мейкерский не считается, как и объём, оплаченный Fee Credits, и сделки сам с собой. Позицию нужно держать хотя бы минуту, торговля должна быть ручной. Для маршрута ниже это важно: пассивная LIMIT-нога — это мейкер, она здесь не засчитывается, объём кампании набирает только MARKET-нога. Счётчик обнуляется каждый день в 00:00 UTC, и платят только за верхнюю достигнутую за день ступень: ${txflowTierLine()}. Дневной пул $100 000 раздаётся сверху вниз, от самых больших объёмов, пока не кончится; остаток на следующий день не переносится.`,
      ),
      eligibleLabel: tr(locale, "Counts toward it", "Что засчитывается"),
      eligibleValue: tr(locale, "Perp taker volume", "Тейкерский объём"),
      // Plain campaign page, no referral parameter: TxFlow's referral is a path
      // (`/r/CODE`) and a `?ref=` here was not honoured, so carrying one only
      // made the link look like it did something it did not. The referral lives
      // on the trade link above, which is the one people sign up through.
      rulesUrl: "https://app.txflow.com/campaign",
      endedNote: tr(
        locale,
        "This campaign has ended. Check TxFlow for the next one.",
        "Эта кампания завершилась. Следующую смотрите у TxFlow.",
      ),
    },
    points: { kind: "none" },
  };
}

/* ---- listed protocols without a verified data path yet ----
 *
 * These pages exist so a listed protocol is a real page rather than a SOON
 * placeholder: its links, its season, its points status and its hedge partner
 * are all real. What is NOT here is anything we would have to invent.
 *
 * TO FILL IN BY HAND, per protocol (each marked TODO below):
 *   1. `tradeUrl`     -- your referral link, and `tradePerk` if it carries a
 *                        fee discount. Until then the trade button points at
 *                        the venue's plain app URL.
 *   2. `heroMetrics`  -- farm estimate and OTC point price, once you have them.
 *   3. `guidance`     -- the priorities and practical tips for this protocol;
 *                        the panel renders only the intro while they are empty.
 *   4. `hedge.body`   -- why THIS partner, in one sentence.
 *   5. `activity`     -- a running campaign, if the venue announces one.
 *   6. `points`       -- season numbers, once a programme is announced.
 */

type PendingProtocol = {
  slug: ProtocolSlug;
  name: string;
  twitterUrl: string;
  docsUrl: string;
  /** TODO(manual): replace with the referral link. */
  tradeUrl: string;
  season: string;
  /** What the home card already claims, so both say the same thing. */
  farmEstimate: { value: string; positive?: boolean; tip?: string };
  otcPointPrice: string;
  /** The venue a farmer would hedge on by hand today. */
  hedgePartnerSlug: string;
};

function pendingProtocol(protocol: PendingProtocol, locale: Locale): ProtocolPageConfig {
  return {
    slug: protocol.slug,
    name: protocol.name,
    twitterUrl: protocol.twitterUrl,
    docsUrl: protocol.docsUrl,
    tradeUrl: protocol.tradeUrl,
    heroMetrics: [
      { label: tr(locale, "Season", "Сезон"), value: protocol.season },
      {
        label: tr(locale, "Farm estimate", "Оценка фарма"),
        value: protocol.farmEstimate.value,
        valueClass: protocol.farmEstimate.positive ? "text-positive" : undefined,
        tip: protocol.farmEstimate.tip ?? farmEstimateTip(locale),
      },
      { label: tr(locale, "OTC point price", "OTC цена поинта"), value: protocol.otcPointPrice, tip: otcPointTip(locale) },
    ],
    guidance: {
      kicker: tr(locale, `How ${protocol.name} awards points`, `Как ${protocol.name} начисляет поинты`),
      intro: tr(
        locale,
        `PerpFarm has not verified a data path for ${protocol.name} yet, so no route, cost or point estimate is published for it here. Everything on this page comes from the protocol itself.`,
        `PerpFarm пока не проверил источник данных для ${protocol.name}, поэтому маршруты, стоимость и оценки поинтов для него не публикуются. Всё на этой странице — из самого протокола.`,
      ),
      // TODO(manual): your priorities and practical tips for this protocol.
      // Both lists render only when they have entries, so an empty list leaves
      // the panel short rather than leaving a heading over nothing.
      priorities: [],
      tips: [],
      docsUrl: protocol.docsUrl,
      docsLabel: tr(locale, `${protocol.name} docs ↗`, `Документация ${protocol.name} ↗`),
    },
    hedge: {
      intro: tr(
        locale,
        `Both legs still have to be placed by hand: PerpFarm does not price ${protocol.name} routes yet, so nothing below is a costed recommendation.`,
        `Обе ноги пока ставятся руками: PerpFarm ещё не считает маршруты для ${protocol.name}, так что ниже — не рассчитанная рекомендация.`,
      ),
      partner: {
        slug: protocol.hedgePartnerSlug,
        // TODO(manual): why this partner, in one sentence.
        body: tr(
          locale,
          "The deepest book PerpFarm does price, so the hedge leg is at least the part of the route you can measure.",
          "Самый глубокий стакан из тех, что PerpFarm считает, — значит хедж-ногу вы хотя бы можете измерить.",
        ),
        tags: [[tr(locale, "Placed by hand", "Ставится руками"), "neutral"]],
      },
    },
    activity: { kind: "none" },
    points: { kind: "none" },
  };
}

function retroExpectedTip(name: string, locale: Locale): string {
  return tr(
    locale,
    `${name} has not announced a points or retroactive program. PerpFarm considers one likely; this is our view, not an official claim.`,
    `${name} не анонсировал программу поинтов или ретродроп. PerpFarm считает её вероятной; это наше мнение, а не заявление протокола.`,
  );
}

function qfex(locale: Locale): ProtocolPageConfig {
  return pendingProtocol(
    {
      slug: "qfex",
      name: "QFEX",
      twitterUrl: "https://x.com/QFEX",
      docsUrl: "https://docs.qfex.com/qfex/about",
      tradeUrl: "https://app.qfex.com", // TODO(manual): referral link
      season: "0",
      farmEstimate: { value: tr(locale, "Retro points", "Ретро-поинты"), positive: true, tip: retroExpectedTip("QFEX", locale) },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
}

function entropy(locale: Locale): ProtocolPageConfig {
  return pendingProtocol(
    {
      slug: "entropy",
      name: "Entropy",
      twitterUrl: "https://x.com/entropyIO",
      docsUrl: "https://docs.entropy.io/",
      tradeUrl: "https://entropy.io", // TODO(manual): referral link
      season: "0",
      farmEstimate: { value: tr(locale, "Retro points", "Ретро-поинты"), positive: true, tip: retroExpectedTip("Entropy", locale) },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
}

function risex(locale: Locale): ProtocolPageConfig {
  return pendingProtocol(
    {
      slug: "risex",
      name: "RiseX",
      twitterUrl: "https://x.com/risechain",
      docsUrl: "https://docs.risechain.com/",
      tradeUrl: "https://risex.io", // TODO(manual): referral link
      season: "—",
      // The same range the home card publishes, so the two cannot disagree.
      farmEstimate: { value: "$1–2/pt" },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
}

function polymarket(locale: Locale): ProtocolPageConfig {
  return pendingProtocol(
    {
      slug: "polymarket",
      name: "Polymarket",
      twitterUrl: "https://x.com/Polymarket",
      docsUrl: "https://docs.polymarket.us/api/introduction",
      tradeUrl: "https://polymarket.com", // TODO(manual): referral link
      season: "—",
      farmEstimate: { value: tr(locale, "Retro activity", "Ретро-активность"), positive: true, tip: retroExpectedTip("Polymarket", locale) },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
}

const BUILDERS: Record<ProtocolSlug, (locale: Locale) => ProtocolPageConfig> = {
  variational,
  txflow,
  qfex,
  risex,
  polymarket,
  entropy,
};

/** Whether this slug has a protocol page at all (the rest get the SOON page). */
export function hasProtocolPage(slug: string): slug is ProtocolSlug {
  return slug in BUILDERS;
}

export function protocolPageConfig(slug: ProtocolSlug, locale: Locale): ProtocolPageConfig {
  return BUILDERS[slug](locale);
}
