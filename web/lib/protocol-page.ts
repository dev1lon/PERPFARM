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
  /** One card per hand-placed hedge, in the order they should be read. */
  hedge: { intro: string; partners: HedgePartnerCard[] };
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
      partners: [{
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
      }],
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
      partners: [{
        slug: "qfex",
        body: tr(
          locale,
          "TradFi only, no crypto at all. Early stage, no points yet.",
          "Только TradFi, крипты нет вовсе. Ранняя стадия, поинтов пока нет.",
        ),
        tags: [
          [tr(locale, "Retro points", "Ретро-поинты"), "ok"],
          [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
        ],
      }, {
        slug: "entropy",
        body: tr(
          locale,
          "A HIP-3 perp dex with no points, its own mechanics, and retroactivity.",
          "HIP-3 perp dex без поинтов, с уникальной механикой и ретроактивностью.",
        ),
        tags: [
          [tr(locale, "Retro points", "Ретро-поинты"), "ok"],
          [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
        ],
      }],
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
  /** The hand-placed hedge card, once someone has written it. Without it the
   *  page keeps the pending default, which names Variational and carries a
   *  TODO -- a placeholder, not a judgement about this protocol's partner. */
  partners?: HedgePartnerCard[];
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
    hedge: written.partners ? { ...base.hedge, partners: written.partners } : base.hedge,
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
      partners: [{
        slug: protocol.hedgePartnerSlug,
        // TODO(manual): why this partner, in one sentence.
        body: tr(
          locale,
          "The deepest book among the protocols PerpFarm prices, so the hedge leg is the cheapest half of the route to cross.",
          "Самый глубокий стакан среди протоколов, которые считает PerpFarm, — значит хедж-нога дешевле всего в пересечении.",
        ),
        // TODO(manual): the real reason for this partner, and its tags.
        tags: [[tr(locale, "Deepest book", "Самый глубокий стакан"), "neutral"]],
      }],
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
      farmEstimate: {
        value: tr(locale, "Retro points", "Ретро-поинты"),
        positive: true,
        // Not the shared "nothing announced" note: QFEX's team has said it is
        // recording activity, which is a different claim from ours about when
        // it pays out. The two are kept apart in one sentence each.
        tip: tr(
          locale,
          "The team has confirmed it records activity for a retroactive award. No formula is published; PerpFarm expects the programme in October or November — our view, not an official claim.",
          "Команда подтвердила, что записывает активность под ретро-начисление. Формулы нет; программу PerpFarm ожидает в октябре-ноябре — это наше мнение, а не заявление протокола.",
        ),
      },
      otcPointPrice: "TBA",
      hedgePartnerSlug: "variational",
    },
    locale,
  );
  return withGuidance(base, locale, {
    intro: tr(
      locale,
      "The team has confirmed it is recording activity for a retroactive award. Nothing is paid out yet; PerpFarm expects the programme in October or November.",
      "Команда подтвердила, что активность записывается под ретро-начисление. Выплат пока нет; программу PerpFarm ожидает в октябре-ноябре.",
    ),
    priorities: [
      {
        title: tr(locale, "Eligible volume", "Подходящий объём"),
        body: tr(
          locale,
          "PerpFarm's view is to favour TradFi, where the protocol is focused, while building natural volume on the top markets.",
          "По мнению PerpFarm, стоит делать упор на TradFi — это фокус протокола — и набирать естественный объём в топовых рынках.",
        ),
      },
      {
        title: tr(locale, "Hold 2–4 hours, keep activity organic", "Держите 2–4 часа, активность органичная"),
        body: tr(
          locale,
          "There is no points programme yet, so the criterion is volume — and it has to be organic, without wash trading.",
          "Поинт-программы ещё нет, поэтому главный критерий — объём. Но объём должен быть органичным, без wash trading.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Register with an invite code", "Регистрируйтесь по инвайт-коду"),
        body: tr(
          locale,
          "The book is invite-only, and a code takes another 10% off trading fees.",
          "Вход только по приглашению, а код снимает ещё 10% с торговых комиссий.",
        ),
      },
      {
        title: tr(locale, "Trade the pairs in Growth Mode", "Торгуйте пары в Growth Mode"),
        body: tr(
          locale,
          "A market QFEX puts in Growth Mode is charged at tier 1 — 0 bps maker and 0.6–1.5 taker — against 5/10 on an ordinary equity. Which markets are in it changes, so the rate printed on each route below is the one that route was actually charged.",
          "Рынок, который QFEX ставит в Growth Mode, идёт по тиру 1 — 0 bps maker и 0.6–1.5 taker — против 5/10 на обычной акции. Состав меняется, поэтому на каждом маршруте ниже напечатана та ставка, по которой он и посчитан.",
        ),
      },
      {
        title: tr(locale, "Leave feedback", "Оставляйте фидбек"),
        body: tr(
          locale,
          "The team follows feedback closely and pays for it. The chat on the site and the Discord are where it lands.",
          "Команда внимательно следит за фидбеком и вознаграждает за него. Писать — в чат на сайте и в Discord.",
        ),
      },
      {
        title: tr(locale, "Earlier volume is worth more", "Ранний объём стоит дороже"),
        body: tr(
          locale,
          "Do the maximum organic activity before the points programme starts: early activity has always been rewarded better than the same volume once the points are running.",
          "Сделайте максимальную органическую активность до начала поинт-программы: ранняя активность всегда награждалась лучше, чем тот же объём, когда поинты уже активны.",
        ),
      },
    ],
    partners: [{
      slug: "txflow",
      body: tr(
        locale,
        "A perp dex leaning TradFi, no points yet, with retroactivity confirmed.",
        "Perp dex с уклоном в TradFi, без поинтов, ретроактивность подтверждена.",
      ),
      tags: [
        [tr(locale, "Retro points", "Ретро-поинты"), "ok"],
        [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
      ],
    }, {
      slug: "entropy",
      body: tr(
        locale,
        "A HIP-3 perp dex with no points, its own mechanics, and retroactivity.",
        "HIP-3 perp dex без поинтов, с уникальной механикой и ретроактивностью.",
      ),
      tags: [
        [tr(locale, "Retro points", "Ретро-поинты"), "ok"],
        [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
      ],
    }],
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
      "Points are not live yet, so what matters is which markets will count when they are.",
      "Поинтов пока нет, поэтому важно другое — какие рынки зачтут, когда они появятся.",
    ),
    priorities: [
      {
        title: tr(locale, "Only the io: pairs", "Только пары io:"),
        body: tr(
          locale,
          "Retroactive credit is for Entropy's own contracts — io:ANTH, io:OAI, io:SNDK. Hyperliquid's native pairs sit on the same screen and do not count as Entropy activity, which is the one mistake that wastes a whole month here.",
          "Ретро-зачёт идёт за собственные контракты Entropy — io:ANTH, io:OAI, io:SNDK. Нативные пары Hyperliquid лежат в том же окне и активностью Entropy не считаются: именно эта ошибка стоит впустую потраченного месяца.",
        ),
      },
      {
        title: tr(locale, "Hold 1–2 days, by report", "Удержание 1–2 дня, по слухам"),
        body: tr(
          locale,
          "No formula is published. Farmers who asked in September were told open interest will count beside volume, so the field's answer is a pre-IPO position left open a day or two rather than turnover.",
          "Формулы нет. Тем, кто спрашивал в сентябре, отвечали, что вместе с объёмом будет считаться открытый интерес, — поэтому общий ответ такой: позиция по pre-IPO на сутки-двое, а не оборот.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Rest maker orders at 0.003%", "Стойте мейкером под 0.003%"),
        body: tr(
          locale,
          "Maker is 0.003% against 0.009% taker — about $3 per $100k on the passive side, before the rebate below.",
          "Мейкер — 0.003% против 0.009% тейкера: около $3 на $100k пассивной стороной, ещё до ребейта ниже.",
        ),
      },
      {
        title: tr(locale, "Anthropic is the deepest book", "Самый глубокий стакан — Anthropic"),
        body: tr(
          locale,
          "It held $19–25M of open interest in September, more than anywhere else for that asset, which is why size fills there without moving the price.",
          "В сентябре в нём было $19–25M открытого интереса — больше, чем где-либо ещё по этому активу, поэтому крупный размер входит без сдвига цены.",
        ),
      },
      {
        title: tr(locale, "Claim the 20–50% fee rebate", "Заберите возврат комиссий 20–50%"),
        body: tr(
          locale,
          "The referral programme returns a fifth to a half of Entropy's share of your fees — on a venue with no points yet, that is the only certain payout.",
          "Реферальная программа возвращает от пятой части до половины платформенной доли ваших комиссий — на площадке без поинтов это единственная гарантированная выплата.",
        ),
      },
      {
        title: tr(locale, "Expect a regional block", "Ждите региональной блокировки"),
        body: tr(
          locale,
          "EU and US addresses were refused in August; farmers registered and deposited through Asian exits instead.",
          "В августе адреса из ЕС и США не пускали; регистрировались и заносили депозит через азиатские выходы.",
        ),
      },
    ],
    partners: [
      {
        slug: "qfex",
        body: tr(
          locale,
          "TradFi only, no crypto at all. Early stage, no points yet.",
          "Только TradFi, крипты нет вовсе. Ранняя стадия, поинтов пока нет.",
        ),
        tags: [
          [tr(locale, "Retro points", "Ретро-поинты"), "ok"],
          [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
        ],
      },
      {
        slug: "txflow",
        body: tr(
          locale,
          "A perp dex leaning TradFi, no points yet, with retroactivity confirmed.",
          "Perp dex с уклоном в TradFi, без поинтов, ретроактивность подтверждена.",
        ),
        tags: [
          [tr(locale, "Retro points", "Ретро-поинты"), "ok"],
          [tr(locale, "Higher cost", "Дороже исполнение"), "warn"],
        ],
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
      "Hold time drives the points; volume follows it rather than the other way round.",
      "Поинты двигает время в позиции; объём идёт следом, а не наоборот.",
    ),
    priorities: [
      {
        title: tr(locale, "One position, 24–48h hold", "Одна позиция, удержание 24–48ч"),
        body: tr(
          locale,
          "The award is linear in time: the same $10k paid twelve times more at twelve hours than at one. Keep one delta-neutral position open for a day or two instead of cycling it, and add the second leg elsewhere rather than closing this one.",
          "Начисление линейно по времени: те же $10k за 12 часов дали в 12 раз больше, чем за час. Держите одну дельта-нейтральную позицию сутки-двое, а не перезаходите, и вторую ногу открывайте на другой площадке, а не закрывайте эту.",
        ),
      },
      {
        title: tr(locale, "Volume, a third of the score", "Объём — треть счёта"),
        body: tr(
          locale,
          "A tournament scores volume, open interest and PnL as an equal third each, so turnover matters but never pays for itself: $1.04M of it cost $220 in fees for 87.8 points. Build it as a by-product of the position above, not as a target.",
          "В турнире объём, открытый интерес и PnL весят по трети, поэтому оборот важен, но сам себя не отбивает: $1.04M дали 87.8 поинта при $220 комиссий. Набирайте его как побочный эффект позиции выше, а не как цель.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Enter with passive LIMIT orders", "Заходите пассивными LIMIT-ордерами"),
        body: tr(
          locale,
          "Maker fills are the difference between $0.43 and $1.80 a point — the same spread farmers reported across September and late August.",
          "Мейкерские исполнения — это разница между $0.43 и $1.80 за поинт: именно такой разброс фармеры показывали в сентябре и в конце августа.",
        ),
      },
      {
        title: tr(locale, "Skip SOL, take BTC, ETH or HYPE", "Не берите SOL — берите BTC, ETH или HYPE"),
        body: tr(
          locale,
          "A SOL pair cut the award by about 17% in August's measurements; the majors above were the pairs farmers were pointed to instead.",
          "Пара по SOL в августовских замерах срезала начисление примерно на 17%; вместо неё советовали как раз мейджоры выше.",
        ),
      },
      {
        title: tr(locale, "Put the other leg where it also earns", "Вторую ногу ставьте туда, где тоже платят"),
        body: tr(
          locale,
          "Lighter RH, Variational and Ondo all list the same RWA pairs — gold, oil, SPY, QQQ — so the hedge farms a second programme instead of only cancelling risk.",
          "Lighter RH, Variational и Ondo торгуют те же RWA-пары — золото, нефть, SPY, QQQ, — поэтому хедж фармит вторую программу, а не только гасит риск.",
        ),
      },
      {
        title: tr(locale, "Stack the referral with the season's boost", "Складывайте реферал с сезонным бустом"),
        body: tr(
          locale,
          "A link carries a standing +12.5% to +20%; on top of that RiseX ran +20% on RWA pairs through late August and a $34,000 USDC competition into 18 September.",
          "Ссылка даёт постоянные +12.5%…+20%; сверху RiseX давал +20% за RWA-пары во второй половине августа и проводил соревнование на $34 000 USDC до 18 сентября.",
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
      "There is no points programme and no token pledge — the only thing paid here is liquidity.",
      "Программы поинтов нет и токен не обещан — платят здесь только за ликвидность.",
    ),
    priorities: [
      {
        title: tr(locale, "Resting liquidity, not turnover", "Стоять в стакане, а не крутить оборот"),
        body: tr(
          locale,
          "$75,000 a day goes to market makers, and that is the only activity this venue pays for. It also pushed the taker delay from 50 ms to 150 ms on 3 September, which makes the other side of the book worse still.",
          "Маркет-мейкерам раздают $75 000 в день — это единственная активность, за которую здесь платят. Плюс 3 сентября задержку тейкера подняли с 50 мс до 150 мс, что делает другую сторону стакана ещё хуже.",
        ),
      },
      {
        title: tr(locale, "A drop nobody promised", "Дроп, которого никто не обещал"),
        body: tr(
          locale,
          "The company raised at $21B and lives on the fees it already collects, so a drop is an option nobody has offered. Leave a record if you want that option, but do not spend for it — the rewards above are paid in cash today.",
          "Компания подняла раунд по $21B и живёт на комиссиях, которые уже собирает, так что дроп — опция, которую никто не предлагал. Оставляйте след, если хотите её иметь, но не тратьтесь ради неё: награды выше платят деньгами уже сегодня.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Take the joining promo once", "Возьмите стартовое промо один раз"),
        body: tr(
          locale,
          "Early September paid $10 USDC for a $20 deposit, a $20 prediction and $2,000 of perp volume — an account opened for free.",
          "В начале сентября за депозит $20, ставку на $20 и $2 000 объёма на перпах платили $10 USDC — аккаунт открывается бесплатно.",
        ),
      },
      {
        title: tr(locale, "Let other people's takers fill you", "Пусть вас исполняют чужие тейкеры"),
        body: tr(
          locale,
          "Orders resting a tick either side of the market built volume at almost no cost in August's reports, and sometimes closed slightly positive.",
          "Ордера, стоящие в тик от рынка, в августовских отчётах набирали объём почти без затрат, а иногда закрывались с небольшим плюсом.",
        ),
      },
      {
        title: tr(locale, "Leave a clean fingerprint", "Оставляйте чистый отпечаток"),
        body: tr(
          locale,
          "The beta was a few thousand accounts, so a month of volume pushed through one session is exactly what a review looks for.",
          "В бете было несколько тысяч аккаунтов, поэтому месячный объём, продавленный за одну сессию, — ровно то, что ищут при разборе.",
        ),
      },
      {
        title: tr(locale, "$100k was the beta's bar", "Планка беты — $100k"),
        body: tr(
          locale,
          "While access ran on invite codes farmers aimed past $100,000 of volume to stand out among 7,000–11,000 accounts.",
          "Пока вход шёл по инвайт-кодам, фармеры целились за $100 000 объёма, чтобы выделиться среди 7 000–11 000 аккаунтов.",
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
      "No points programme is announced, so the only thing left to optimise is what the volume costs.",
      "Программа поинтов не анонсирована, поэтому оптимизировать остаётся одно — во что обходится объём.",
    ),
    priorities: [
      {
        title: tr(locale, "Indices over metals", "Индексы вместо металлов"),
        body: tr(
          locale,
          "The market decides the bill here: $1M traded cost about $150 on the US100 index and about $1,100 in gold in early September. Pick the pair off the table below before trading size — nothing else on this page moves the cost that much.",
          "Счёт здесь определяет рынок: в начале сентября $1M стоил около $150 по индексу US100 и около $1 100 по золоту. Выбирайте пару по таблице ниже, прежде чем торговать объёмом, — больше ничто на этой странице так не меняет стоимость.",
        ),
      },
      {
        title: tr(locale, "Recorded activity, no formula", "Активность пишется, формулы нет"),
        body: tr(
          locale,
          "The venue records what you traded and says nothing about how it would count it. The one published effect of volume is the account tier, which lifts past $100k — so there is no target to chase beyond trading where it is cheap.",
          "Площадка записывает, что вы торговали, и молчит о том, как это зачтёт. Единственный опубликованный эффект объёма — уровень аккаунта после $100k, так что гнаться больше не за чем: торгуйте там, где дешевле.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Deposit, then pass $100k", "Занесите депозит, потом пройдите $100k"),
        body: tr(
          locale,
          "A deposit carries a welcome bonus, and volume past $100,000 lifts the account tier — the two published perks of the venue.",
          "За депозит дают приветственный бонус, а объём выше $100 000 поднимает уровень аккаунта — две опубликованные выгоды площадки.",
        ),
      },
      {
        title: tr(locale, "Scan funding against Variational", "Сканируйте фандинг против Variational"),
        body: tr(
          locale,
          "Funding scanners cover this venue, and a paired position against Variational was August's standard way to make the volume pay for itself.",
          "Сканеры фандинга покрывают эту площадку, и связка против Variational была в августе стандартным способом заставить объём себя отбить.",
        ),
      },
      {
        title: tr(locale, "Use the depth nobody else has", "Пользуйтесь глубиной, которой нет у других"),
        body: tr(
          locale,
          "Over 90% of all HIP-3 open interest sits in this book, so size moves the price less here than on any other RWA venue.",
          "В этом стакане больше 90% всего открытого интереса HIP-3, поэтому крупный размер двигает цену здесь меньше, чем на любой другой RWA-площадке.",
        ),
      },
      {
        title: tr(locale, "Events are a separate product", "Events — отдельный продукт"),
        body: tr(
          locale,
          "Since 10 September it also runs HIP-4 outcome markets — up or down, no leverage, no funding, no liquidation — settled against its own perp prices, so the calculator below does not cover them.",
          "С 10 сентября здесь ещё и рынки исходов HIP-4 — вверх или вниз, без плеча, фандинга и ликвидаций, — они считаются по ценам его же перпов, поэтому калькулятор ниже их не покрывает.",
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
      "Taker volume drives the points here, so the usual instinct to rest a limit order is the wrong one.",
      "Поинты здесь двигает тейкерский объём, поэтому привычка ставить лимитку — здесь ошибка.",
    ),
    priorities: [
      {
        title: tr(locale, "MARKET orders, taker volume", "MARKET-ордера, тейкерский объём"),
        body: tr(
          locale,
          "One farmer's August tally puts a scale on it: $4M of market volume and $1.8k of fees returned about 70,000 points, where limit fills of the same size returned next to nothing.",
          "Масштаб виден по августовскому подсчёту фармера: $4M объёма маркетом при $1.8k комиссий дали около 70 000 поинтов, а лимитные исполнения того же размера — почти ноль.",
        ),
      },
      {
        title: tr(locale, "The week's multiplier", "Множитель недели"),
        body: tr(
          locale,
          "Referral (+50%, and −5% on fees) and the boosted FX pair (1.5x on CAD/USD and JPY/USD in early September, 1.8x on JPY/USD in August) apply to volume you were trading anyway — check both before the session, not after.",
          "Реферал (+50% и −5% к комиссиям) и бустнутая FX-пара (1.5x на CAD/USD и JPY/USD в начале сентября, 1.8x на JPY/USD в августе) действуют на объём, который вы и так делаете, — смотрите их до сессии, а не после.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Claim the daily streak", "Забирайте ежедневную серию"),
        body: tr(
          locale,
          "One click a day pays gems and keeps a standing boost running under everything else you do.",
          "Один клик в день приносит гемы и держит постоянный буст под всем остальным, что вы делаете.",
        ),
      },
      {
        title: tr(locale, "Refer yourself for the rebate", "Сделайте самореферал ради ребейта"),
        body: tr(
          locale,
          "A self-referral returned part of the fees and extra points in August's reports — the cheapest way to soften a taker-only programme.",
          "Самореферал в августовских отчётах возвращал часть комиссий и добавлял поинты — самый дешёвый способ смягчить программу, где платят только за тейкера.",
        ),
      },
      {
        title: tr(locale, "Weigh the vaults against the risk", "Вольты — только с оглядкой на риск"),
        body: tr(
          locale,
          "FLP paid about 20% APY plus points, but the cap filled on 10 August and on 1 September $1.5M left a vault through an accounting and oracle fault.",
          "FLP платил около 20% годовых плюс поинты, но 10 августа лимит закрылся, а 1 сентября из вольта ушло $1.5M из-за ошибки учёта и оракула.",
        ),
      },
      {
        title: tr(locale, "Remember this is the last season", "Помните, что сезон последний"),
        body: tr(
          locale,
          "Playoffs is the final season before Arc's mainnet, $HIB and $HEAT premarkets opened on 26 August, and the drop is under 25% of supply weighted by volume, activity and vaults.",
          "Playoffs — финальный сезон перед мейннетом Arc, премаркеты $HIB и $HEAT открылись 26 августа, а на дроп идёт меньше 25% сапплая с весами по объёму, активности и вольтам.",
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
      "Lighter publishes no formula; this is what farmers measured through September.",
      "Формулу Lighter не публикует — это то, что фармеры намерили за сентябрь.",
    ),
    priorities: [
      {
        title: tr(locale, "Phone order, 1h+ hold", "Ордер с телефона, удержание от часа"),
        body: tr(
          locale,
          "An order sent from the Robinhood Wallet app counts double against the web interface, and open interest only starts weighing properly past an hour — a day or two is what moved farmers from $5–10 a point to about $3.20.",
          "Ордер из приложения Robinhood Wallet считается вдвое против веба, а открытый интерес начинает весить только после часа: сутки-двое и опустили фармеров с $5–10 за поинт примерно до $3.20.",
        ),
      },
      {
        title: tr(locale, "Premium tier and volume", "Premium-тир и объём"),
        body: tr(
          locale,
          "Since 10 September the weekly split has paid more for raw volume, and the same activity on a Premium account returned roughly six times as much in farmers' measurements. A standard account is simply a worse rate for the same fees.",
          "С 10 сентября недельное распределение больше платит за сырой объём, а та же активность на Premium-аккаунте по замерам фармеров давала примерно в шесть раз больше. Standard — просто худший курс за те же комиссии.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Trade Pre-IPO, not the majors", "Торгуйте Pre-IPO, а не мейджоры"),
        body: tr(
          locale,
          "OpenAI and Anthropic weigh more in the weekly split than BTC or ETH — Lighter's own team pointed farmers at those books in late August.",
          "OpenAI и Anthropic весят в недельном распределении больше, чем BTC или ETH, — на эти стаканы в конце августа указывала сама команда Lighter.",
        ),
      },
      {
        title: tr(locale, "Hedge on Lighter Core for 2.5x", "Хеджируйте на Lighter Core ради 2.5x"),
        body: tr(
          locale,
          "From 10 September a long held here against a short on Lighter Core carried a 2.5x boost on this side of the trade.",
          "С 10 сентября лонг здесь против шорта на Lighter Core давал буст 2.5x на этой стороне сделки.",
        ),
      },
      {
        title: tr(locale, "Watch the weekly dilution", "Следите за размытием недели"),
        body: tr(
          locale,
          "A point cost $7.1–10k of volume in early September and $19.9k by the 10th as the field grew — re-check the rate before scaling size up.",
          "В начале сентября поинт стоил $7.1–10k объёма, а к 10-му — уже $19.9k из-за притока участников; пересчитывайте курс, прежде чем наращивать размер.",
        ),
      },
      {
        title: tr(locale, "Don't price the point off $LIT", "Не считайте цену поинта от $LIT"),
        body: tr(
          locale,
          "The $20–50 figures going around are arithmetic off the $LIT price and the 11M $LIT pool. Nobody is buying these points OTC, so that is a hope, not a bid.",
          "Ходящие $20–50 — это арифметика от курса $LIT и пула в 11M $LIT. На OTC эти поинты никто не покупает, так что это надежда, а не заявка.",
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
        value: tr(locale, "Retro points", "Ретро-поинты"),
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
      "An agent, not an exchange: it holds no book of its own, and every fill lands on Hyperliquid or Ondo.",
      "Это агент, а не биржа: своего стакана у него нет, и каждое исполнение уходит на Hyperliquid или Ondo.",
    ),
    priorities: [
      {
        title: tr(locale, "Two records per trade", "Две записи за одну сделку"),
        body: tr(
          locale,
          "One position is therefore logged twice — by TrueNorth and by the venue it was routed to. Connect both accounts, and the choice of book becomes the choice of which second programme you are farming.",
          "Одну позицию поэтому записывают дважды — и TrueNorth, и площадка, куда она ушла. Подключите оба аккаунта, и выбор стакана станет выбором второй программы, которую вы фармите.",
        ),
      },
      {
        title: tr(locale, "Free to use, nothing published", "Бесплатно, но правил нет"),
        body: tr(
          locale,
          "Nothing about scoring is published, so there is no formula to optimise against. What makes being here early cheap is that TrueNorth charges no builder fee: a route costs the exchange's own fees and not a basis point more.",
          "Правил подсчёта нет — оптимизировать не под что. Ранняя активность дешёвая по другой причине: builder fee TrueNorth не берёт, маршрут стоит ровно биржевых комиссий и ни базисного пункта сверху.",
        ),
      },
    ],
    tips: [
      {
        title: tr(locale, "Route crypto to HL, the rest to Ondo", "Крипту — на HL, остальное — на Ondo"),
        body: tr(
          locale,
          "Hyperliquid's book is crypto only. Stocks, indices, commodities and FX exist on the Ondo side, so the asset you want decides which account the trade should use.",
          "В стакане Hyperliquid только крипта. Акции, индексы, сырьё и валюты есть на стороне Ondo, поэтому нужный актив и определяет, через какой аккаунт вести сделку.",
        ),
      },
      {
        title: tr(locale, "Check the bill against the venue", "Сверяйте счёт с самой площадкой"),
        body: tr(
          locale,
          "A zero builder fee means a route should cost exactly what the exchange costs — the calculator above prices that, so a larger bill means something else changed.",
          "Нулевой builder fee значит, что маршрут должен стоить ровно как биржа, — калькулятор выше это и считает, так что счёт больше означает, что изменилось что-то ещё.",
        ),
      },
      {
        title: tr(locale, "Enter the contests it runs", "Участвуйте в его соревнованиях"),
        body: tr(
          locale,
          "TrueNorth pays out its own trading competitions in USDC, and August's raffle handed a ticket per $50k of volume.",
          "TrueNorth платит по своим торговым соревнованиям в USDC, а в августовском розыгрыше давал билет за каждые $50k объёма.",
        ),
      },
      {
        title: tr(locale, "Writing about it is paid too", "За тексты о нём тоже платят"),
        body: tr(
          locale,
          "Through August it paid $500–1,000 a week for the best TrueNorth posts on X — the only line on this page that costs nothing but time.",
          "Весь август платили $500–1 000 в неделю за лучшие посты про TrueNorth в X — единственный пункт на этой странице, который не стоит ничего, кроме времени.",
        ),
      },
    ],
  });
  return {
    ...written,
    hedge: {
      ...written.hedge,
      partners: [{
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
      }],
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
