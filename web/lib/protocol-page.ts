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

export type ProtocolSlug = "variational" | "txflow";

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
const TXFLOW_CAMPAIGN = {
  startUtc: Date.UTC(2026, 7, 14, 0, 0, 0),
  endUtc: Date.UTC(2026, 7, 20, 23, 59, 0),
  totalVolumeUsd: 88_844_546,
  unlockedPoolUsd: 2_000,
  maxPoolUsd: 8_000,
  readAtUtc: "2026-08-18 15:27 UTC",
};

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
            "TxFlow has not announced points. PerpFarm's view is to favour TradFi, where the protocol is focused, while building natural volume on the top markets.",
            "TxFlow не анонсировал поинты. По мнению PerpFarm, стоит делать упор на TradFi — это фокус протокола — и набирать естественный объём в топовых рынках.",
          ),
          primary: true,
        },
        {
          label: "Priority 2",
          kicker: tr(locale, "secondary", "вторично"),
          title: tr(locale, "Keep activity organic", "Торгуйте органично"),
          body: tr(
            locale,
            "With no public points criteria, spot activity may also be worth considering. The pair calculator prices Perps only; it does not estimate spot execution.",
            "Пока нет публичных критериев поинтов, можно также рассмотреть активность на споте. Калькулятор пар считает только Perps и не оценивает исполнение на споте.",
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
          title: tr(locale, "Use the referral discount", "Используйте реферальную скидку"),
          body: tr(
            locale,
            "A referral gives a 5% fee discount for the trader's first $25M of volume.",
            "Реферал даёт трейдеру 5% скидки на комиссии для первых $25M объёма.",
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
          [tr(locale, "Manual leg", "Ручная нога"), "neutral"],
        ],
      },
    },
    activity: {
      kind: "campaign",
      name: "Trade & Unlock",
      startUtc: TXFLOW_CAMPAIGN.startUtc,
      endUtc: TXFLOW_CAMPAIGN.endUtc,
      meta: `$${(TXFLOW_CAMPAIGN.unlockedPoolUsd / 1000).toFixed(0)}K ${tr(locale, "of", "из")} $${(TXFLOW_CAMPAIGN.maxPoolUsd / 1000).toFixed(0)}K ${tr(locale, "unlocked", "разблокировано")} · ${tr(locale, "read", "снято")} ${TXFLOW_CAMPAIGN.readAtUtc}`,
      body: tr(
        locale,
        `A USDC prize pool that unlocks as the combined volume of all participants grows: $50M unlocks $1,000, $80M unlocks $2,000, and it runs to $8,000 at $200M. Participants so far have traded $${(TXFLOW_CAMPAIGN.totalVolumeUsd / 1_000_000).toFixed(1)}M. Your share is settled on the fees you actually pay, capped at 20% of the pool. Volume that generates no trading fee does not count. Farming through the campaign is cheaper than farming outside it, because part of what you spend on fees comes back from the pool — how much depends on the field, so PerpFarm does not put a number on it.`,
        `Призовой пул в USDC, который открывается по мере роста общего объёма всех участников: $50M открывают $1,000, $80M — $2,000, и так до $8,000 на $200M. Участники уже наторговали $${(TXFLOW_CAMPAIGN.totalVolumeUsd / 1_000_000).toFixed(1)}M. Ваша доля считается по фактически уплаченным комиссиям, но не больше 20% пула. Объём, не создающий комиссию, не засчитывается. Фарм внутри кампании дешевле, чем вне её, потому что часть уплаченных комиссий возвращается из пула — насколько именно, зависит от остальных участников, поэтому цифру мы не выдумываем.`,
      ),
      eligibleLabel: tr(locale, "Combined volume", "Общий объём"),
      eligibleValue: `$${(TXFLOW_CAMPAIGN.totalVolumeUsd / 1_000_000).toFixed(1)}M`,
      rulesUrl: "https://app.txflow.com/campaign/trade-and-unlock-2",
      endedNote: tr(
        locale,
        "This campaign has ended. Check TxFlow for the next one.",
        "Эта кампания завершилась. Следующую смотрите у TxFlow.",
      ),
    },
    points: { kind: "none" },
  };
}

const BUILDERS: Record<ProtocolSlug, (locale: Locale) => ProtocolPageConfig> = {
  variational,
  txflow,
};

export function protocolPageConfig(slug: ProtocolSlug, locale: Locale): ProtocolPageConfig {
  return BUILDERS[slug](locale);
}
