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
import {
  BUILDER_FEE_CAP_BPS,
  TRUE_NORTH_DEFAULT_EXECUTION_VENUE,
  TRUE_NORTH_EXECUTION_VENUES,
  type TrueNorthExecutionVenue,
} from "@/lib/truenorth-execution";

export type ProtocolSlug =
  | "variational"
  | "txflow"
  | "qfex"
  | "risex"
  | "polymarket"
  | "entropy"
  | "tradexyz"
  | "hibachi"
  | "lighterrh"
  | "truenorth";

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

/** A broker page prices the real exchange book the farmer picks. */
export type ExecutionConfig = {
  venues: ReadonlyArray<{ slug: TrueNorthExecutionVenue; name: string; short: string }>;
  defaultVenue: TrueNorthExecutionVenue;
  /** The most a builder may add on top of the book's own maker/taker fee. */
  builderFeeCapBps: number;
  feeNote: string;
};

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
  /** Present when the page is a broker, not an order book of its own. */
  execution?: ExecutionConfig;
  /** Why a protocol with a page has nothing to price or chart, in its own
   *  words. Absent means the generic "not collected yet", which is wrong for an
   *  agent: it has no market of its own to collect. */
  unpriced?: { calculator: string; activity: string };
};

/**
 * TxFlow's "The Bull Pit", read off app.txflow.com/campaign/bull-pit on
 * 2026-09-12.
 *
 * Two leaderboards, ROI and PnL, $20,000 each. A farmer may be enrolled in only
 * one at a time, and someone who ranks in both is paid the higher reward only.
 *
 * The pool is NOT fixed: it unlocks in steps as the whole field's eligible
 * taker volume grows, and the step reached at the end is what everyone is paid
 * from. That ladder is the one figure worth drawing, so it is stated here and
 * rendered as the campaign's progress.
 *
 * The combined-volume reading is a hand-refreshed snapshot, like every other
 * campaign number on this page: TxFlow publishes it on the campaign page and
 * nowhere machine-readable.
 */
const TXFLOW_CAMPAIGN = {
  startUtc: Date.UTC(2026, 8, 5, 0, 0, 0),
  endUtc: Date.UTC(2026, 8, 14, 23, 59, 0),
  /** Each leaderboard's maximum; the campaign advertises the two together. */
  poolPerEventUsd: 20_000,
  totalPoolUsd: 40_000,
  /** Own eligible taker volume needed to be ranked at all. */
  minTakerVolumeUsd: 100_000,
  /** The field's combined taker volume -> the pool it unlocks, per event. */
  tiers: [
    { atUsd: 50_000_000, poolUsd: 2_500 },
    { atUsd: 150_000_000, poolUsd: 6_000 },
    { atUsd: 200_000_000, poolUsd: 8_000 },
    { atUsd: 250_000_000, poolUsd: 10_000 },
    { atUsd: 500_000_000, poolUsd: 20_000 },
  ],
  /** Read off the ROI leaderboard at 2026-09-12 18:16 UTC. */
  combinedVolumeUsd: 61_730_331,
  combinedVolumeAsOf: "2026-09-12 18:16 UTC",
};

/** Variational Swaps Trading Competition: 2026-09-10 00:00 UTC to 2026-09-24
 *  00:00 UTC, per omni.variational.io/competition and
 *  docs.variational.io/omni/trading-competition. Months are 0-based here. */
const VARIATIONAL_COMPETITION_START_UTC = Date.UTC(2026, 8, 10, 0, 0, 0);
const VARIATIONAL_COMPETITION_END_UTC = Date.UTC(2026, 8, 24, 0, 0, 0);

function variational(locale: Locale): ProtocolPageConfig {
  return {
    slug: "variational",
    name: "Variational",
    tradeUrl: "https://omni.variational.io/?ref=OMNIDEVILON",
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
      // Only what the venue states. The previous (TradFi) competitions paid an
      // extra 20,000 points; nothing on the swaps competition's page or docs
      // says this one does, so no points are claimed for it. The docs phrase
      // the 250k floor as "on TradFi markets", but the competition page itself
      // says swap volume, and it is the competition's own page -- that wins.
      name: "Swaps Trading Competition",
      startUtc: VARIATIONAL_COMPETITION_START_UTC,
      endUtc: VARIATIONAL_COMPETITION_END_UTC,
      meta: `2026-09-10 → 2026-09-24 · 20,000 USDC ${tr(locale, "prizes", "призы")}`,
      body: tr(
        locale,
        "Swap markets only — perps do not count. Score = swap PnL × √swap volume. Ranking needs at least 250,000 USDC of swap volume in the window; the top 20 are paid.",
        "Засчитываются только свопы — перпы не считаются. Score = PnL по свопам × √объём по свопам. Для места в рейтинге нужно от 250 000 USDC объёма по свопам за время турнира; призы получают топ-20.",
      ),
      eligibleLabel: tr(locale, "Eligible", "Eligible"),
      eligibleValue: tr(locale, "swap markets only", "только свопы"),
      rulesUrl: "https://omni.variational.io/competition",
      endedNote: tr(
        locale,
        "The Swaps Trading Competition ended on 2026-09-24.",
        "Турнир по свопам завершился 24.09.2026.",
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
      name: "The Bull Pit · $40,000 USDC",
      startUtc: TXFLOW_CAMPAIGN.startUtc,
      endUtc: TXFLOW_CAMPAIGN.endUtc,
      meta: `ROI + PnL · $${(TXFLOW_CAMPAIGN.poolPerEventUsd / 1000).toFixed(0)}K ${tr(locale, "each", "на каждый")}`,
      progress: {
        valueUsd: TXFLOW_CAMPAIGN.combinedVolumeUsd,
        valueLabel: `$${(TXFLOW_CAMPAIGN.combinedVolumeUsd / 1_000_000).toFixed(1)}M · ${TXFLOW_CAMPAIGN.combinedVolumeAsOf}`,
        tiers: TXFLOW_CAMPAIGN.tiers,
      },
      body: tr(
        locale,
        `Two leaderboards, ROI and PnL, $${(TXFLOW_CAMPAIGN.poolPerEventUsd / 1000).toFixed(0)}K each. You can be in only one at a time, and someone who ranks in both is paid the higher reward only. Only PERPETUAL TAKER volume counts — maker volume, Fee Credit volume and self-matched trades are all excluded, a position has to be held at least a minute, and trading must be manual. The pool everyone shares unlocks with the field's combined volume (above), and the top 50 of each board are paid; $${(TXFLOW_CAMPAIGN.minTakerVolumeUsd / 1000).toFixed(0)}K of your own taker volume is the floor to be ranked at all. Read the hedge below with that in mind: a delta-neutral route nets about zero by design, so it clears the floor and grows the shared pool but climbs neither board.`,
        `Два рейтинга, ROI и PnL, по $${(TXFLOW_CAMPAIGN.poolPerEventUsd / 1000).toFixed(0)}K. Участвовать можно только в одном за раз, а если попал в оба — заплатят только большую из наград. Засчитывается только ТЕЙКЕРСКИЙ объём по перпам: мейкерский, оплаченный Fee Credits и сделки сам с собой не считаются, позицию нужно держать хотя бы минуту, торговля — ручная. Общий пул раскрывается по мере роста объёма всех участников (шкала выше), платят топ-50 каждого рейтинга, а чтобы вообще попасть в рейтинг, нужно $${(TXFLOW_CAMPAIGN.minTakerVolumeUsd / 1000).toFixed(0)}K собственного тейкерского объёма. Отсюда важное про хедж ниже: дельта-нейтральный маршрут по своей природе даёт около нуля, поэтому он проходит порог и увеличивает общий пул, но в рейтинги не поднимается.`,
      ),
      eligibleLabel: tr(locale, "Counts toward it", "Что засчитывается"),
      eligibleValue: tr(locale, "Perp taker volume", "Тейкерский объём"),
      // Plain campaign page, no referral parameter: TxFlow's referral is a path
      // (`/r/CODE`) and a `?ref=` here was not honoured, so carrying one only
      // made the link look like it did something it did not. The referral lives
      // on the trade link above, which is the one people sign up through.
      rulesUrl: "https://app.txflow.com/campaign/bull-pit",
      endedNote: tr(
        locale,
        "The Bull Pit ended on 2026-09-14. Check TxFlow for the next one.",
        "The Bull Pit завершился 14.09.2026. Следующую кампанию смотрите у TxFlow.",
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

/** The one sentence every unwritten slot says, so they cannot drift apart. */
function notWrittenYet(name: string, locale: Locale): string {
  return tr(
    locale,
    `PerpFarm has not published this part of its ${name} guidance yet.`,
    `PerpFarm пока не опубликовал эту часть рекомендаций по ${name}.`,
  );
}

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
  /** The venue HAS announced a points programme; only the write-up is missing.
   *  Without this the intro says no mechanics were announced, which is false
   *  for a venue like Hibachi. */
  pointsProgramAnnounced?: boolean;
};

/** The two priorities and four tips a written page fills, before the labels
 *  and numbering the reference adds to them. */
type WrittenGuidance = {
  intro: string;
  /** Exactly two: the strongest driver, then the secondary one. */
  priorities: [{ title: string; body: string }, { title: string; body: string }];
  /** Four, in the order a farmer would do them. */
  tips: Array<{ title: string; body: string }>;
};

/**
 * A protocol's guidance, written.
 *
 * The labels, the kickers and the numbering are the REFERENCE's, not the
 * protocol's -- every page wears them the same way -- so a protocol supplies
 * only what is true of it and cannot drift in the parts that must not differ.
 */
function withGuidance(base: ProtocolPageConfig, locale: Locale, written: WrittenGuidance): ProtocolPageConfig {
  return {
    ...base,
    guidance: {
      ...base.guidance,
      intro: written.intro,
      priorities: [
        {
          label: "Priority 1",
          kicker: tr(locale, "strongest driver", "главный фактор"),
          title: written.priorities[0].title,
          body: written.priorities[0].body,
          primary: true,
        },
        {
          label: "Priority 2",
          kicker: tr(locale, "secondary", "вторично"),
          title: written.priorities[1].title,
          body: written.priorities[1].body,
          primary: false,
        },
      ],
      tips: written.tips.map((tip, index) => ({
        n: String(index + 1).padStart(2, "0"),
        title: tip.title,
        body: tip.body,
      })),
    },
  };
}

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
      // What is missing on these pages is the WRITING, not the data: the
      // adapters were wired and the calculator below prices their routes from
      // stored snapshots like every other protocol. The intro used to say the
      // opposite -- "no route or cost is published" -- directly above a table
      // of costed routes.
      intro: protocol.pointsProgramAnnounced
        ? tr(
            locale,
            `${protocol.name} routes are priced from PerpFarm's own hourly collection, like every other protocol here. ${protocol.name} runs a points programme, but PerpFarm has not written up how to farm it yet, so the guidance below is left blank rather than guessed.`,
            `Маршруты ${protocol.name} считаются по нашему часовому сбору данных, как и у остальных протоколов. У ${protocol.name} есть программа поинтов, но как её фармить, мы пока не описали, поэтому рекомендации ниже оставлены пустыми, а не придуманы.`,
          )
        : tr(
            locale,
            `${protocol.name} routes are priced from PerpFarm's own hourly collection, like every other protocol here. What is not written yet is how ${protocol.name} awards points: it has announced no mechanics, so the guidance below is left blank rather than guessed.`,
            `Маршруты ${protocol.name} считаются по нашему часовому сбору данных, как и у остальных протоколов. Не написано другое — как ${protocol.name} начисляет поинты: механики не анонсированы, поэтому рекомендации ниже оставлены пустыми, а не придуманы.`,
          ),
      // The reference's shape, waiting for its words: two priorities and four
      // tips, in the same slots every other protocol uses. Kept visible on
      // purpose -- a protocol page that silently drops half the panel is a
      // different page, and the empty slots say what is still missing.
      //
      // TODO(manual): replace `title` and `body` on each of the six.
      priorities: [
        {
          label: "Priority 1",
          kicker: tr(locale, "strongest driver", "главный фактор"),
          title: tr(locale, "Not written yet", "Пока не написано"),
          body: notWrittenYet(protocol.name, locale),
          primary: true,
        },
        {
          label: "Priority 2",
          kicker: tr(locale, "secondary", "вторично"),
          title: tr(locale, "Not written yet", "Пока не написано"),
          body: notWrittenYet(protocol.name, locale),
          primary: false,
        },
      ],
      tips: ["01", "02", "03", "04"].map((n) => ({
        n,
        title: tr(locale, "Not written yet", "Пока не написано"),
        body: notWrittenYet(protocol.name, locale),
      })),
      docsUrl: protocol.docsUrl,
      docsLabel: tr(locale, `${protocol.name} docs ↗`, `Документация ${protocol.name} ↗`),
    },
    hedge: {
      intro: tr(
        locale,
        `General guidance for ${protocol.name}, independent of the calculation below.`,
        `Общие рекомендации по ${protocol.name}, независимо от расчёта ниже.`,
      ),
      partner: {
        slug: protocol.hedgePartnerSlug,
        // TODO(manual): why this partner, in one sentence.
        body: tr(
          locale,
          "The deepest book among the protocols PerpFarm prices, so the hedge leg is the cheapest half of the route to cross.",
          "Самый глубокий стакан среди протоколов, которые считает PerpFarm, — значит хедж-нога дешевле всего в пересечении.",
        ),
        // TODO(manual): the real reason for this partner, and its tags.
        tags: [[tr(locale, "Deepest book", "Самый глубокий стакан"), "neutral"]],
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

/**
 * QFEX, written from August and September 2026 reports.
 *
 * There is nothing to farm yet in the literal sense: no points have been
 * awarded, the programme is said to start in autumn or winter, and activity
 * until then is recorded retroactively. What CAN be acted on is the fee tier a
 * deposit locked in and the size of the field while it is still invite-only.
 */
function qfex(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "qfex",
      name: "QFEX",
      twitterUrl: "https://x.com/QFEX",
      docsUrl: "https://docs.qfex.com/qfex/about",
      // app.qfex.com does not resolve; qfex.com does.
      tradeUrl: "https://qfex.com", // TODO(manual): referral link
      season: "0",
      farmEstimate: { value: tr(locale, "Retro points", "Ретро-поинты"), positive: true, tip: retroExpectedTip("QFEX", locale) },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "QFEX has awarded no points at all. The team says the programme starts in autumn or winter 2026 and that everything traded until then is tracked retroactively, with a TGE talked about for December. So there is no cost per point to quote and no OTC price to quote either — what you are buying is a record on a venue that is still invite-only.",
      "QFEX не начислил ни одного поинта. Команда говорит, что программа стартует осенью-зимой 2026, а всё, что наторговано до этого, учтётся ретроспективно; TGE обсуждают в районе декабря. Поэтому ни себестоимости поинта, ни OTC-цены тут быть не может — вы покупаете историю на площадке, куда пока пускают по инвайтам.",
    ),
    priorities: [
      {
        title: tr(locale, "History built early", "История, набранная рано"),
        body: tr(
          locale,
          "Nothing is awarded yet, so the bet is the record left before the crowd arrives: farmers aim for $100k+ of organic volume while the field is small.",
          "Пока не начисляют ничего, поэтому ставка — след, оставленный до прихода толпы: фармеры целятся в $100k+ органического объёма, пока участников мало.",
        ),
      },
      {
        title: tr(locale, "The fee tier you locked", "Зафиксированный тариф"),
        body: tr(
          locale,
          "Accounts that deposited before the 24 August snapshot kept 0% maker and 0.015% / 0.006% taker on stocks / indices for good. That is what makes the volume affordable at all.",
          "Аккаунты, пополнившиеся до снепшота 24 августа, навсегда сохранили 0% maker и 0.015% / 0.006% taker на акциях / индексах. Именно это делает объём здесь подъёмным.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Register with an invite code", "Регистрируйтесь по инвайт-коду"),
        body: tr(
          locale,
          "The book is invite-only, and a code carries a 10% discount on trading fees.",
          "Площадка пускает только по приглашениям, а код даёт 10% скидки на торговые комиссии.",
        ),
      },
      {
        title: tr(locale, "Deposit through Connect Wallet", "Вносите депозит через Connect Wallet"),
        body: tr(
          locale,
          "USDC on Arbitrum from your own wallet, $10 and up. Sending straight from an exchange address gets stopped by compliance with a “Deposit blocked”.",
          "USDC в сети Arbitrum со своего кошелька, от $10. Перевод прямо с биржевого адреса режет комплаенс сообщением «Deposit blocked».",
        ),
      },
      {
        title: tr(locale, "Build the volume gradually", "Набирайте объём постепенно"),
        body: tr(
          locale,
          "A retroactive review looks at a history, not at one burst: $100k+ spread over time reads as a user, one session reads as a farm.",
          "Ретроспективный разбор смотрит на историю, а не на один залп: $100k+, размазанные по времени, выглядят как пользователь, один заход — как ферма.",
        ),
      },
      {
        title: tr(locale, "Trade the RWA book on limit orders", "Торгуйте RWA лимитками"),
        body: tr(
          locale,
          "Stocks, indices, metals and FX run 24/7 here, and the Pre-IPO pair OPENAI and ANTHROPIC opened on 10 September at 10x. Maker fills are free on the locked tier.",
          "Акции, индексы, металлы и валюты идут здесь 24/7, а пары Pre-IPO — OPENAI и ANTHROPIC — открылись 10 сентября с плечом 10x. На зафиксированном тарифе мейкерские исполнения бесплатны.",
        ),
      },
    ],
  });
}

/**
 * Entropy, written from August and September 2026 reports.
 *
 * Points are not live: the fields are in the code (`pointsMultiplier`), the
 * team says early activity is credited retroactively, and a token is talked
 * about for 2027. The one rule that is not a rumour is which markets count.
 */
function entropy(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
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
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "Entropy has not started its points programme — the fields are already in its code, the team says early activity is credited retroactively, and a token is talked about for 2027. So there is no cost per point yet. The rule that is not a rumour: only Entropy's own io: markets count. Volume on Hyperliquid's native pairs through the same screen is not Entropy's activity.",
      "Программа поинтов у Entropy ещё не запущена — поля уже есть в коде, команда говорит, что ранняя активность зачтётся ретроспективно, а токен обсуждают на 2027 год. Поэтому себестоимости поинта пока нет. Что не слух: считаются только собственные рынки Entropy с префиксом io:. Объём по нативным парам Hyperliquid в том же окне — это не активность Entropy.",
    ),
    priorities: [
      {
        title: tr(locale, "Only the io: markets", "Только рынки io:"),
        body: tr(
          locale,
          "Retroactive credit is for Entropy's own Pre-IPO and RWA contracts — io:ANTH, io:OAI, io:SNDK. Everything else on the screen belongs to Hyperliquid.",
          "Ретро-зачёт идёт за собственные контракты Entropy на Pre-IPO и RWA — io:ANTH, io:OAI, io:SNDK. Всё остальное на экране принадлежит Hyperliquid.",
        ),
      },
      {
        title: tr(locale, "Volume and open interest, by report", "Объём и открытый интерес — по слухам"),
        body: tr(
          locale,
          "No formula is published. Farmers who asked in September were told open interest will matter alongside volume, which is why most hold a pre-IPO position a day or two instead of churning it.",
          "Формулы нет. Тем, кто спрашивал в сентябре, отвечали, что вместе с объёмом будет важен открытый интерес — поэтому большинство держит позицию по pre-IPO сутки-двое, а не крутит её.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Trade the Pre-IPO book", "Торгуйте книгой Pre-IPO"),
        body: tr(
          locale,
          "Anthropic's contract held $19–25M of open interest in September, the deepest venue for that asset anywhere — which is also why the spread there is workable.",
          "Контракт на Anthropic держал в сентябре $19–25M открытого интереса — самая глубокая площадка по этому активу в мире, отсюда и рабочий спред.",
        ),
      },
      {
        title: tr(locale, "Place maker orders", "Ставьте мейкерские ордера"),
        body: tr(
          locale,
          "0.003% maker against 0.009% taker: about $3 per $100k of volume on the maker side, before any rebate.",
          "0.003% мейкер против 0.009% тейкер: около $3 на $100k объёма мейкерской стороной, ещё до ребейтов.",
        ),
      },
      {
        title: tr(locale, "Hold it for a day or two", "Держите сутки-двое"),
        body: tr(
          locale,
          "Empty turnover is the expensive way to be counted here, and a delta-neutral pre-IPO position cost about $4 per $10k to open against Lighter in early September.",
          "Пустой оборот — самый дорогой способ быть учтённым, а дельта-нейтральная позиция по pre-IPO против Lighter в начале сентября стоила около $4 на $10k.",
        ),
      },
      {
        title: tr(locale, "Take the fee rebate", "Берите возврат комиссий"),
        body: tr(
          locale,
          "Entropy's referral programme returns 20–50% of the platform's share of your fees, which is the difference between a cheap route and a costly one.",
          "Реферальная программа Entropy возвращает 20–50% от платформенной доли ваших комиссий — это и есть разница между дешёвым и дорогим маршрутом.",
        ),
      },
    ],
  });
}

/**
 * RiseX, written from what farmers measured in August and September 2026.
 *
 * The venue publishes no formula. What is measured and repeated across the
 * period is that TIME carries the points: the same position held twelve hours
 * paid twelve times what an hour paid, and a tournament scores volume, open
 * interest and PnL as an equal third each.
 */
function risex(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "risex",
      name: "RiseX",
      twitterUrl: "https://x.com/risechain",
      docsUrl: "https://docs.risechain.com/",
      tradeUrl: "https://risex.io", // TODO(manual): referral link
      season: "1",
      // The same range the home card publishes, so the two cannot disagree.
      // Weeks 6-7 of September: $0.43 at the best, $0.70-1.00 typical.
      farmEstimate: { value: "$0.4–1/pt" },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "RiseX pays for volume and for open interest, and it is TIME that carries the points: a $10k position held twelve hours earned twelve times what the same position held one hour did. Its tournaments score volume, open interest and PnL as an equal third each. Support confirmed on 6 September that parking funds in a vault earns nothing by itself — only trading and holding count.",
      "RiseX начисляет и за объём, и за открытый интерес, но основное дают ЧАСЫ в позиции: $10k, удержанные 12 часов, принесли ровно в 12 раз больше, чем те же $10k за час. В турнирах счёт складывается из объёма, открытого интереса и PnL равными долями. 6 сентября поддержка подтвердила: просто держать деньги в вольте бессмысленно — считаются только торговля и удержание.",
    ),
    priorities: [
      {
        title: tr(locale, "Open interest, held for days", "Открытый интерес, удержанный сутками"),
        body: tr(
          locale,
          "Points grow with the hours a position stays open, so 24–48 hours on one position is worth far more than the same size churned through the book.",
          "Поинты растут вместе с часами в позиции, поэтому одна позиция на 24–48 часов стоит намного больше, чем тот же размер, прокрученный через стакан.",
        ),
      },
      {
        title: tr(locale, "Volume, but only organic", "Объём, но только органический"),
        body: tr(
          locale,
          "Volume is a third of a tournament's score and still earns, but stacking turnover burns fees faster than it pays: one farmer's $1.04M of volume cost $220 in fees for 87.8 points.",
          "Объём — треть турнирного счёта и он тоже приносит поинты, но набивать оборот дороже, чем он платит: у одного фармера $1.04M объёма стоили $220 комиссий и дали 87.8 поинта.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Enter and leave on limit orders", "Входите и выходите лимитками"),
        body: tr(
          locale,
          "Maker fills are what hold the cost per point near the bottom of its range; a market order pays the spread on both legs of the hedge.",
          "Именно мейкерские исполнения держат себестоимость поинта у нижней границы; маркет-ордер платит спред на обеих ногах хеджа.",
        ),
      },
      {
        title: tr(locale, "Hold the position, don't churn it", "Держите позицию, а не крутите её"),
        body: tr(
          locale,
          "Open-and-close cycles pay little. Farmers who held 24–48 hours reported $0.43–1.00 a point in September, against $1.50–1.80 in late August when conditions tightened.",
          "Циклы «открыл-закрыл» платят мало. Те, кто держал 24–48 часов, в сентябре отчитывались о $0.43–1.00 за поинт против $1.50–1.80 в конце августа, когда условия ужесточились.",
        ),
      },
      {
        title: tr(locale, "Hedge it on another venue", "Хеджируйте на другой площадке"),
        body: tr(
          locale,
          "The usual setup runs RiseX against Lighter RH, Variational or Ondo on the same RWA pair — gold, oil, SPY, QQQ — so both sides earn while the direction cancels out.",
          "Обычная схема — RiseX против Lighter RH, Variational или Ondo по одной и той же RWA-паре: золото, нефть, SPY, QQQ. Обе стороны фармят, направление гасится.",
        ),
      },
      {
        title: tr(locale, "Take the boosts that cost nothing", "Берите бусты, которые ничего не стоят"),
        body: tr(
          locale,
          "A referral link carries a standing +12.5% to +20%, and RiseX runs more on top — a +20% RWA boost through late August, a $34,000 USDC competition into 18 September.",
          "Реферальная ссылка даёт постоянные +12.5%…+20%, а сверху RiseX проводит ещё — +20% за RWA во второй половине августа, соревнование с пулом $34 000 USDC до 18 сентября.",
        ),
      },
    ],
  });
}

/**
 * Polymarket's perps, written from August and September 2026 reports.
 *
 * The honest headline: there is no points programme and none has been
 * promised. The venue raised at a $21B valuation and earns fees on a product
 * that already works, so the farm here is the market-maker pool, not a drop.
 */
function polymarket(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "polymarket",
      name: "Polymarket",
      twitterUrl: "https://x.com/Polymarket",
      docsUrl: "https://docs.polymarket.us/api/introduction",
      tradeUrl: "https://polymarket.com", // TODO(manual): referral link
      season: "0",
      farmEstimate: { value: tr(locale, "Retro activity", "Ретро-активность"), positive: true, tip: retroExpectedTip("Polymarket", locale) },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "Polymarket runs no points programme on its perps and has promised no token. It raised at a $21B valuation and takes fees on a product that already works, so a retro drop is a guess, not a plan. What it does pay, every day, is $75,000 to market makers — which is the one thing on this page you can actually farm.",
      "На перпах Polymarket нет программы поинтов, и токен никто не обещал. Компания подняла раунд по оценке $21B и зарабатывает на комиссиях продукта, который и так работает, — так что ретро-дроп здесь догадка, а не план. Что площадка действительно платит каждый день, так это $75 000 маркет-мейкерам: это единственное на этой странице, что реально фармится.",
    ),
    priorities: [
      {
        title: tr(locale, "Market-maker rewards", "Награды маркет-мейкеру"),
        body: tr(
          locale,
          "$75,000 a day goes to resting liquidity. It is paid in cash, today, and it does not depend on a token that may never exist.",
          "$75 000 в день уходят тем, кто стоит в стакане. Это деньги сегодня, и они не зависят от токена, которого может не быть.",
        ),
      },
      {
        title: tr(locale, "A retro drop nobody promised", "Ретро-дроп, который никто не обещал"),
        body: tr(
          locale,
          "Activity is recorded, and farmers are betting on a future $POLY. Treat it as a maybe: do not burn an account for a drop the venue has never mentioned.",
          "Активность записывается, и фармеры ставят на будущий $POLY. Относитесь к этому как к «может быть»: не сжигайте аккаунт ради дропа, о котором площадка ни разу не говорила.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Rest orders instead of taking them", "Стойте в стакане, а не бейте по нему"),
        body: tr(
          locale,
          "A resting order earns from the daily maker pool; a market order pays the fee instead. That inverts the usual advice on this site.",
          "Стоящий ордер зарабатывает из дневного пула мейкера, а маркет-ордер, наоборот, платит комиссию. Это переворачивает привычный совет на этом сайте.",
        ),
      },
      {
        title: tr(locale, "Allow for the taker delay", "Учитывайте задержку тейкера"),
        body: tr(
          locale,
          "On 3 September the taker delay went from 50 ms to 150 ms to protect liquidity — one more reason the taker side is the wrong one here.",
          "3 сентября задержку тейкера подняли с 50 мс до 150 мс ради защиты ликвидности — ещё одна причина не вставать на тейкерскую сторону.",
        ),
      },
      {
        title: tr(locale, "Take the joining promo once", "Возьмите стартовое промо один раз"),
        body: tr(
          locale,
          "Early September paid $10 USDC for a $20 deposit, a $20 prediction and $2,000 of perp volume — enough to open an account without burning anything.",
          "В начале сентября за депозит $20, ставку на $20 и $2 000 объёма на перпах платили $10 USDC — этого хватает, чтобы открыть аккаунт, ничего не сжигая.",
        ),
      },
      {
        title: tr(locale, "Spread the activity out", "Растяните активность"),
        body: tr(
          locale,
          "Wash volume in one session is what a review looks for. Trade the markets you would trade anyway, across days.",
          "Накрученный за одну сессию объём — именно то, что ищут при разборе. Торгуйте те рынки, что торговали бы и так, и растягивайте это по дням.",
        ),
      },
    ],
  });
}

/**
 * trade.xyz, written from August and September 2026 reports.
 *
 * No points programme has been announced, no season, no scoring -- so there is
 * no cost per point to state. What the reports DO carry is cost, and it differs
 * enormously by market, which is the one thing a farmer can act on: $1M traded
 * in gold cost about $1,100 in early September, the same $1M in the US100 index
 * about $150.
 */
function tradexyz(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "tradexyz",
      name: "TradeXYZ",
      twitterUrl: "https://x.com/tradexyz",
      docsUrl: "https://docs.trade.xyz/",
      tradeUrl: "https://trade.xyz", // TODO(manual): referral link
      season: "0",
      // The same status the home card publishes, so the two cannot disagree.
      farmEstimate: { value: tr(locale, "Activity records", "Учитывает активность"), positive: true, tip: retroExpectedTip("TradeXYZ", locale) },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "trade.xyz has announced no points programme and no season: it is the largest HIP-3 deployer on Hyperliquid, holding over 90% of the open interest in stock, index, commodity and pre-IPO perps, and it records what you trade without saying how it would be scored. So the thing to get right here is cost, and cost depends on the market: $1M traded in gold cost about $1,100 in early September, the same $1M in the US100 index about $150.",
      "trade.xyz не анонсировал ни программу поинтов, ни сезон: это крупнейший деплоер HIP-3 на Hyperliquid, у него больше 90% открытого интереса в перпах на акции, индексы, сырьё и pre-IPO, и он просто записывает, что вы торговали, не объясняя, как это оценит. Поэтому здесь главное — стоимость, а она зависит от рынка: $1M по золоту в начале сентября стоил около $1 100, тот же $1M по индексу US100 — около $150.",
    ),
    priorities: [
      {
        title: tr(locale, "The market you pick, not the volume", "Выбранный рынок, а не объём"),
        body: tr(
          locale,
          "The same notional costs about seven times more in metals than in the indices. The pair table below prices every market of this venue, so pick from it before trading size.",
          "Один и тот же номинал в металлах стоит примерно в семь раз дороже, чем в индексах. Таблица пар ниже считает каждый рынок площадки — выбирайте по ней, прежде чем торговать объёмом.",
        ),
      },
      {
        title: tr(locale, "Recorded activity", "Записанная активность"),
        body: tr(
          locale,
          "No formula and no season, only a record. The one published effect of volume is the account tier, which lifts past $100k, and a deposit carries a welcome bonus.",
          "Ни формулы, ни сезона — только запись. Единственный опубликованный эффект объёма — уровень аккаунта, который поднимается после $100k, а за депозит дают приветственный бонус.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Compare markets before trading size", "Сравните рынки до крупного объёма"),
        body: tr(
          locale,
          "Run the calculator below first: the cheapest market on this venue and the dearest one differ by a factor a farmer feels immediately.",
          "Сначала прогоните калькулятор ниже: самый дешёвый и самый дорогой рынок площадки различаются в разы, и это чувствуется сразу.",
        ),
      },
      {
        title: tr(locale, "Pass $100k for the higher tier", "Пройдите $100k ради тира выше"),
        body: tr(
          locale,
          "Reported on 18 August: volume past $100,000 raises the account tier, and a deposit carries a welcome bonus on top.",
          "По сообщениям от 18 августа: объём выше $100 000 поднимает уровень аккаунта, а за депозит сверху дают приветственный бонус.",
        ),
      },
      {
        title: tr(locale, "Use the depth it actually has", "Пользуйтесь его настоящей глубиной"),
        body: tr(
          locale,
          "Over 90% of all HIP-3 open interest sits here, which is why size moves the price less on this book than anywhere else in the RWA segment.",
          "Здесь сидит больше 90% всего открытого интереса HIP-3, поэтому крупный размер двигает цену в этом стакане меньше, чем где-либо ещё в RWA-сегменте.",
        ),
      },
      {
        title: tr(locale, "Know what Events are", "Знайте, что такое Events"),
        body: tr(
          locale,
          "Since 10 September trade.xyz also runs HIP-4 outcome markets — up or down, no leverage, no funding, no liquidation — settled against its own perp prices rather than an outside oracle.",
          "С 10 сентября trade.xyz ведёт ещё и рынки исходов HIP-4 — вверх или вниз, без плеча, фандинга и ликвидаций, — которые рассчитываются по ценам его же перпов, а не по внешнему оракулу.",
        ),
      },
    ],
  });
}

/**
 * Hibachi, written from farmers' own tallies in August and September 2026.
 *
 * The one venue here where resting a limit order is the WRONG move: its points
 * follow taker volume, and the multipliers (a referral code, the boosted FX
 * pairs, the daily streak) decide how far that volume goes.
 */
function hibachi(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "hibachi",
      name: "Hibachi",
      twitterUrl: "https://x.com/hibachi_xyz",
      docsUrl: "https://docs.hibachi.xyz/",
      tradeUrl: "https://hibachi.xyz", // TODO(manual): referral link
      season: "PLAYOFFS (4)",
      // Farmers' own reading: about $0.03 a point on 9 September, against about
      // $0.10 through mid-August. The same figure the home card shows.
      farmEstimate: { value: "$0.03/pt" },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
      pointsProgramAnnounced: true,
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "Hibachi pays for TAKER volume: farmers agreed through August that limit orders earn almost nothing here, so the points come from market orders and the multipliers decide how far they go. One caution belongs on this page — on 1 September $1.5M left a Hibachi vault through an accounting and oracle fault, and the venue went down for maintenance.",
      "Hibachi платит за ТЕЙКЕРСКИЙ объём: в августе фармеры сходились на том, что лимитки здесь почти ничего не дают, поэтому поинты приносят маркет-ордера, а множители решают, насколько далеко они уедут. Одно предупреждение по делу: 1 сентября из вольта Hibachi ушло $1.5M из-за ошибки учёта и оракула, после чего площадка встала на техработы.",
    ),
    priorities: [
      {
        title: tr(locale, "Taker volume", "Тейкерский объём"),
        body: tr(
          locale,
          "One farmer's August tally: $4M of market volume for $1.8k of fees returned about 70,000 points, while limit fills returned next to nothing.",
          "Подсчёт фармера за август: $4M объёма маркетом при $1.8k комиссий дали около 70 000 поинтов, а лимитные исполнения — почти ноль.",
        ),
      },
      {
        title: tr(locale, "Multipliers on the same volume", "Множители на том же объёме"),
        body: tr(
          locale,
          "A referral code adds 50% and takes 5% off fees, the boosted FX pairs paid 1.5x in early September (JPY/USD paid 1.8x in August), and the daily streak carries a standing boost of its own.",
          "Реферальный код добавляет 50% и снимает 5% комиссии, бустнутые FX-пары в начале сентября платили 1.5x (JPY/USD в августе — 1.8x), а ежедневная серия даёт свой постоянный буст.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Trade with market orders", "Торгуйте маркет-ордерами"),
        body: tr(
          locale,
          "This is the one protocol on PerpFarm where the cheaper maker leg is the wrong choice: the points follow the taker side.",
          "Это единственный протокол на PerpFarm, где более дешёвая мейкерская нога — неправильный выбор: поинты идут за тейкерской стороной.",
        ),
      },
      {
        title: tr(locale, "Register with a referral code", "Регистрируйтесь по реферальному коду"),
        body: tr(
          locale,
          "+50% on every point and −5% on fees, on everything you do afterwards. It is the largest free multiplier here.",
          "+50% к каждому поинту и −5% к комиссиям — на всё, что делаете дальше. Самый крупный бесплатный множитель здесь.",
        ),
      },
      {
        title: tr(locale, "Check the boosted pair before the session", "Смотрите бустнутую пару перед сессией"),
        body: tr(
          locale,
          "The multiplier moves week to week — CAD/USD and JPY/USD carried 1.5x in the first week of September — and it applies to volume you were going to trade anyway.",
          "Множитель меняется от недели к неделе — в первую неделю сентября 1.5x давали CAD/USD и JPY/USD — и применяется к объёму, который вы и так собирались сделать.",
        ),
      },
      {
        title: tr(locale, "Claim the daily streak", "Забирайте ежедневную серию"),
        body: tr(
          locale,
          "It costs a click, pays gems, and keeps a standing boost running underneath the volume you farm.",
          "Стоит одного клика, приносит гемы и держит постоянный буст под тем объёмом, который вы фармите.",
        ),
      },
    ],
  });
}

/**
 * Lighter on Robinhood Chain, written from September 2026 farming reports.
 *
 * Lighter publishes no formula. What farmers measured: open interest on the
 * Pre-IPO and RWA books weighs most, an order sent from the Robinhood Wallet
 * app counts double, and the weekly split has lately leaned further toward raw
 * volume and Premium accounts.
 */
function lighterrh(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "lighterrh",
      name: "Lighter RH",
      twitterUrl: "https://x.com/Lighter_xyz",
      docsUrl: "https://apidocs.rh.lighter.xyz/docs/get-started",
      // The referral link, on Lighter's Robinhood Chain app -- a separate
      // deployment from lighter.xyz, with its own books and account.
      tradeUrl: "https://robinhoodchain.lighter.xyz/?referral=DEVILON&source=none",
      season: "1",
      // Farmers' own reading through September: $3.91 a point on the 9th and
      // $3.20 on the 10th, after $4-8 earlier in the month.
      farmEstimate: { value: "$3–4/pt" },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
      pointsProgramAnnounced: true,
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "Lighter does not publish its formula. What farmers measured through September: open interest on the Pre-IPO and RWA books weighs most, an order placed from the Robinhood Wallet app counts double, and the weekly distributions have lately leaned further toward raw volume and Premium accounts. The prices quoted for a point — $20 and up — are arithmetic off the $LIT price and the 11M $LIT pool, not trades: nobody is buying these points OTC.",
      "Lighter не раскрывает формулу. Что намерили фармеры за сентябрь: больше всего весит открытый интерес на Pre-IPO и RWA, ордер из приложения Robinhood Wallet считается вдвойне, а в последних недельных распределениях вес сместился к «сырому» объёму и Premium-аккаунтам. Цены поинта, которые называют ($20 и выше), — это арифметика от курса $LIT и пула в 11M $LIT, а не сделки: на OTC эти поинты никто не покупает.",
    ),
    priorities: [
      {
        title: tr(locale, "Open interest on Pre-IPO and RWA", "Открытый интерес на Pre-IPO и RWA"),
        body: tr(
          locale,
          "Hold past an hour, and a day or two is better. The Pre-IPO contracts (OpenAI, Anthropic) weigh more in the weekly split than the crypto majors.",
          "Держите дольше часа, а лучше сутки-двое. Контракты Pre-IPO (OpenAI, Anthropic) весят в недельном распределении больше, чем крипто-мейджоры.",
        ),
      },
      {
        title: tr(locale, "Volume and the account tier", "Объём и уровень аккаунта"),
        body: tr(
          locale,
          "Since 10 September the weekly split has paid more for raw volume, and a Premium account multiplies what the same activity earns — farmers measured roughly six times.",
          "С 10 сентября недельное распределение стало больше платить за сырой объём, а Premium-аккаунт умножает отдачу от той же активности — фармеры намерили примерно в шесть раз.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Send the order from the Robinhood Wallet app", "Отправляйте ордер из приложения Robinhood Wallet"),
        body: tr(
          locale,
          "It is a 2x multiplier against the web interface. The common setup is to watch the book on a desktop and place the order from the phone.",
          "Это множитель 2x против веб-интерфейса. Обычная схема: следить за стаканом с компьютера, а ордер ставить с телефона.",
        ),
      },
      {
        title: tr(locale, "Hold past an hour on the Pre-IPO book", "Держите дольше часа на Pre-IPO"),
        body: tr(
          locale,
          "Churning in and out earns little. Holding is what moved the cost per point from $5–10 early in September down to about $3.20.",
          "Постоянные входы-выходы дают мало. Именно удержание опустило себестоимость поинта с $5–10 в начале сентября примерно до $3.20.",
        ),
      },
      {
        title: tr(locale, "Hedge it delta-neutral", "Держите дельта-нейтрально"),
        body: tr(
          locale,
          "Against Lighter Core, Variational or RiseX. From 10 September a hedge held on Lighter Core carried a 2.5x boost on this side.",
          "Против Lighter Core, Variational или RiseX. С 10 сентября хедж на Lighter Core давал здесь буст 2.5x.",
        ),
      },
      {
        title: tr(locale, "Move to Premium and enter a referral code", "Перейдите на Premium и введите реферальный код"),
        body: tr(
          locale,
          "Premium changes how much the same volume earns, and the referral code is a standing bonus on top of it.",
          "Premium меняет отдачу от того же объёма, а реферальный код — постоянный бонус сверху.",
        ),
      },
    ],
  });
}

/**
 * TrueNorth is an AI trading agent ("the world's first agentic brokerage",
 * truenorth.xyz), not an exchange: it holds no order book, and the trades its
 * agents place fill on the perp venues it connects -- Hyperliquid and Ondo
 * Perps today. Its docs (docs.truenorth.xyz) cover the analysis app and the MCP
 * connector. The calculator prices the chosen execution book, not a fictional
 * TrueNorth book. Nothing is added on top of it: a zero builder fee is what
 * TrueNorth advertises ("builder fee the whole way: zero", June 2026; "$0
 * builder fee", September 2026), where both books would allow up to 10 bps.
 * This page used to claim the opposite -- that a fee was charged at an
 * unpublished rate -- which was wrong on the venue's own words.
 */
function truenorth(locale: Locale): ProtocolPageConfig {
  const base = pendingProtocol(
    {
      slug: "truenorth",
      name: "TrueNorth",
      twitterUrl: "https://x.com/get_truenorth",
      docsUrl: "https://docs.truenorth.xyz/",
      tradeUrl: "https://truenorth.xyz/ref/C7T2BX",
      season: "0",
      // The same status the home card publishes, so the two cannot disagree.
      farmEstimate: {
        value: tr(locale, "Retro activity", "Ретро-активность"),
        positive: true,
        tip: tr(
          locale,
          "TrueNorth pays TruthSayer Rewards: discretionary USDC payouts with no published formula.",
          "TrueNorth платит TruthSayer Rewards: выплаты в USDC на своё усмотрение, формула не опубликована.",
        ),
      },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
  const written = withGuidance(base, locale, {
    intro: tr(
      locale,
      `TrueNorth is an AI trading agent, not an exchange: it has no order book of its own. Trades placed through its agents fill on Hyperliquid or Ondo Perps, so the calculator prices the book you pick — its fees, spread and funding. It adds nothing of its own on top: a zero builder fee is TrueNorth's own pitch ("builder fee the whole way: zero" in June, "$0 builder fee" in September), where both books would allow up to ${BUILDER_FEE_CAP_BPS} bps. No points season has been announced.`,
      `TrueNorth — это ИИ-агент для торговли, а не биржа: своего стакана у него нет. Сделки через его агентов исполняются на Hyperliquid или Ondo Perps, поэтому калькулятор считает выбранный стакан — его комиссии, спред и фандинг. Сверху он не берёт ничего: нулевой builder fee — это собственный аргумент TrueNorth («builder fee the whole way: zero» в июне, «$0 builder fee» в сентябре), при том что оба стакана разрешают до ${BUILDER_FEE_CAP_BPS} б.п. Сезон поинтов не анонсирован.`,
    ),
    priorities: [
      {
        title: tr(locale, "The book underneath", "Стакан под агентом"),
        body: tr(
          locale,
          "Every fill lands on Hyperliquid or Ondo, so one trade leaves a record on the agent AND on the venue it was routed to. That double record is the actual reason to trade here.",
          "Каждое исполнение уходит на Hyperliquid или Ondo, поэтому одна сделка оставляет след и у агента, И у площадки, куда она ушла. Эта двойная запись и есть смысл торговать здесь.",
        ),
      },
      {
        title: tr(locale, "Early use, no formula", "Ранняя активность без формулы"),
        body: tr(
          locale,
          "No season is announced and nothing about scoring is published; TruthSayer Rewards are discretionary USDC payouts. What is being farmed is the history of using it before the crowd arrives.",
          "Сезон не анонсирован, про подсчёт ничего не опубликовано, а TruthSayer Rewards — выплаты в USDC на усмотрение команды. Фармится именно история использования до прихода толпы.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Connect both books", "Подключите оба стакана"),
        body: tr(
          locale,
          "Hyperliquid for crypto, Ondo for stocks, indices, commodities and FX. The same trade counts on the agent and on the venue.",
          "Hyperliquid — для крипты, Ondo — для акций, индексов, сырья и валют. Одна и та же сделка считается и у агента, и у площадки.",
        ),
      },
      {
        title: tr(locale, "It takes no fee of its own", "Своей комиссии он не берёт"),
        body: tr(
          locale,
          "A zero builder fee is the pitch, so a route through TrueNorth costs exactly what the exchange costs — which is what the calculator above prices, with nothing hidden on top.",
          "Нулевой builder fee — его главный аргумент, поэтому маршрут через TrueNorth стоит ровно столько, сколько стоит биржа: это и считает калькулятор выше, без скрытых надбавок.",
        ),
      },
      {
        title: tr(locale, "Enter its own contests", "Участвуйте в его соревнованиях"),
        body: tr(
          locale,
          "TrueNorth runs trading competitions that pay in USDC, and in August handed out a raffle ticket per $50k of volume.",
          "TrueNorth проводит торговые соревнования с выплатами в USDC, а в августе давал билет розыгрыша за каждые $50k объёма.",
        ),
      },
      {
        title: tr(locale, "Writing about it is paid", "За тексты о нём платят"),
        body: tr(
          locale,
          "Through August it paid $500–1,000 a week for the best TrueNorth posts on X — the one activity on this page that costs nothing but time.",
          "Весь август платили $500–1 000 в неделю за лучшие посты про TrueNorth в X — единственная активность на этой странице, которая не стоит ничего, кроме времени.",
        ),
      },
    ],
  });
  return {
    ...written,
    hedge: {
      ...written.hedge,
      partner: {
        slug: "txflow",
        body: tr(
          locale,
          "Manual two-account route: execute through TrueNorth on Hyperliquid or Ondo, then open the same notional in the opposite direction on TxFlow.",
          "Ручной маршрут на два аккаунта: исполните первую ногу через TrueNorth на Hyperliquid или Ondo, затем откройте такой же номинал в противоположную сторону на TxFlow.",
        ),
        tags: [
          [tr(locale, "Farm retro points", "Ретро-активность"), "ok"],
          [tr(locale, "Manual execution", "Ручное исполнение"), "neutral"],
        ],
      },
    },
    execution: {
      venues: TRUE_NORTH_EXECUTION_VENUES,
      defaultVenue: TRUE_NORTH_DEFAULT_EXECUTION_VENUE,
      builderFeeCapBps: BUILDER_FEE_CAP_BPS,
      feeNote: tr(
        locale,
        `Costs below are the chosen book's own — and that is the whole cost: TrueNorth charges no builder fee, where both books allow up to ${BUILDER_FEE_CAP_BPS} bps. Hyperliquid's book is crypto only — stocks, indices, commodities and FX are on Ondo.`,
        `Ниже — расходы самого стакана, и это вся стоимость: TrueNorth не берёт builder fee, хотя оба стакана разрешают до ${BUILDER_FEE_CAP_BPS} б.п. В стакане Hyperliquid только крипта — акции, индексы, сырьё и валюты есть на Ondo.`,
      ),
    },
  };
}

const BUILDERS: Record<ProtocolSlug, (locale: Locale) => ProtocolPageConfig> = {
  variational,
  txflow,
  qfex,
  risex,
  polymarket,
  entropy,
  tradexyz,
  hibachi,
  lighterrh,
  truenorth,
};

/** Whether this slug has a protocol page at all (the rest get the SOON page). */
export function hasProtocolPage(slug: string): slug is ProtocolSlug {
  return slug in BUILDERS;
}

export function protocolPageConfig(slug: ProtocolSlug, locale: Locale): ProtocolPageConfig {
  return BUILDERS[slug](locale);
}
