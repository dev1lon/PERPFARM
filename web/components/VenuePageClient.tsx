"use client";

import { useState } from "react";
import { PerpIdentity } from "@/components/PerpIdentity";
import { VariationalPairRankings } from "@/components/VariationalPairRankings";
import { VenueWizard } from "@/components/VenueWizard";
import { tr, useLocale } from "@/components/LocaleProvider";
import { brandBg, brandBgTone } from "@/lib/brand";
import { daysUntil, formatBps } from "@/lib/format";
import type { VenueDetail, VenueSummary } from "@/lib/types";

const TIERS = [
  ["Iron", "$0", "+0%"],
  ["Bronze", "$1M", "+0.5%"],
  ["Silver", "$5M", "+1%"],
  ["Gold", "$25M", "+2%"],
  ["Platinum", "$100M", "+3%"],
  ["Diamond", "$750M", "+4%"],
  ["Infinity", "$2.5B", "+5%"],
] as const;

function VariationalRewards() {
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">{tr(locale, "Rewards & points", "Награды и поинты")}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {tr(
            locale,
            "Points are distributed every Friday at 00:00 UTC for the previous week. Variational does not publish points per $1 of volume, so PerpFarm shows planning estimates instead of a fabricated rate.",
            "Поинты распределяются каждую пятницу в 00:00 UTC за предыдущую неделю. Variational не публикует поинты за $1 объёма, поэтому PerpFarm показывает плановые оценки, а не выдуманную ставку."
          )}
        </p>
      </div>

      <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-4 text-sm text-text-muted sm:grid-cols-2">
        <p>
          <span className="font-medium text-text-primary">{tr(locale, "Reward tiers", "Reward tiers")}: </span>
          {tr(
            locale,
            "a 30-day tier adds a +0% to +5% boost to earned points.",
            "30-дневный tier добавляет +0%–+5% к полученным поинтам."
          )}
        </p>
        <p>
          <span className="font-medium text-text-primary">{tr(locale, "Referral", "Реферальная ссылка")}: </span>
          {tr(
            locale,
            "create the account through a referral link before the first trade; the current campaign claim is +16% points. Confirm the boost on the signup screen.",
            "создавайте аккаунт по реферальной ссылке до первой сделки; заявленный текущий бонус кампании — +16% к поинтам. Подтвердите бонус на экране регистрации."
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="bg-surface-2 text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{tr(locale, "Tier", "Tier")}</th>
              <th className="px-3 py-2 font-medium">{tr(locale, "30-day volume to unlock", "Объём за 30 дней")}</th>
              <th className="px-3 py-2 font-medium">{tr(locale, "Points boost", "Буст поинтов")}</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map(([tier, volume, boost]) => (
              <tr key={tier} className="border-t border-border text-text-muted">
                <td className="px-3 py-2 font-medium text-text-primary">{tier}</td>
                <td className="px-3 py-2 font-mono-num">{volume}</td>
                <td className="px-3 py-2 font-mono-num">{boost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted">
        {tr(
          locale,
          "Tier volume = personal volume + 0.2 × referred volume. Separately, referrals earn the inviter 1 point for every 10 points earned by referred users.",
          "Объём для tier = личный объём + 0,2 × объём рефералов. Отдельно пригласивший получает 1 поинт за каждые 10 поинтов рефералов."
        )}
      </p>
    </section>
  );
}

function CompetitionPanel() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="pf-transition flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-surface-hover"
      >
        <span>
          <span className="block text-sm font-medium text-text-primary">{tr(locale, "Trading competition", "Торговый конкурс")}</span>
          <span className="mt-1 block text-xs text-text-muted">
            {tr(locale, "Inactive — expand for rules and the 20,000-point distribution", "Неактивен — разверните правила и раздачу 20 000 поинтов")}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="rounded-sm bg-surface-2 px-2 py-1 font-mono-num text-xs text-text-muted">INACTIVE</span>
          <span className="text-text-muted" aria-hidden>{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          <p className="text-sm text-text-muted">
            {tr(
              locale,
              "The latest RWA competition ended on July 13. Variational distributed an additional 20,000 points to competitors proportional to TradFi-market volume; those points and the $20,000 USDC prize pool are excluded from the base cost-per-point estimate.",
              "Последний RWA-конкурс завершился 13 июля. Variational отдельно распределил 20 000 поинтов между участниками пропорционально объёму рынков TradFi; эти поинты и призовой пул $20 000 USDC не входят в базовую оценку цены поинта."
            )}
          </p>
          <p className="text-xs text-text-muted">
            {tr(
              locale,
              "The latest leaderboard required $250k of TradFi notional and KYC for prizes. Read the current rules before treating any competition volume as eligible.",
              "В последнем лидерборде требовалось $250k номинала TradFi и KYC для призов. Проверяйте актуальные правила до учёта конкурсного объёма."
            )}
          </p>
          <div className="flex flex-wrap gap-4 text-xs">
            <a href="https://docs.variational.io/omni/trading-competition" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
              {tr(locale, "Competition rules ↗", "Правила конкурса ↗")}
            </a>
            <a href="https://x.com/variational_io/status/2077147392764510582" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
              {tr(locale, "20,000-point announcement ↗", "Анонс 20 000 поинтов ↗")}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

export function VenuePageClient({
  venue,
  otherVenues,
  ready,
}: {
  venue: VenueDetail;
  otherVenues: VenueSummary[];
  ready: boolean;
}) {
  const locale = useLocale();
  const isVariational = venue.slug === "variational";
  const pageBg = brandBg(venue.slug);
  const branded = pageBg !== undefined;
  const lightBg = branded && brandBgTone(venue.slug) === "light";
  const onBgLink = branded
    ? lightBg
      ? "text-[#454e64] hover:text-[#0b1220]"
      : "text-[#aab2c5] hover:text-white"
    : "text-text-muted hover:text-accent";
  const seasonName = venue.meta?.seasonName ?? (isVariational ? "Season 1" : null);
  const seasonDays = daysUntil(venue.meta?.seasonEndDate ?? null);
  const makerBps = venue.currentFees?.makerBps ?? (isVariational ? 0 : null);
  const takerBps = venue.currentFees?.takerBps ?? (isVariational ? 0 : null);

  return (
    <div className="relative min-h-screen">
      {pageBg && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: pageBg }} />}
      <div className="relative mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1>
              <PerpIdentity slug={venue.slug} name={venue.name} markPx={38} namePx={22} nameClassName="text-2xl" />
            </h1>
            {ready && seasonName && (
              <div className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-right">
                <div className="text-[10px] uppercase tracking-wide text-text-muted">{tr(locale, "Season", "Сезон")}</div>
                <div className="font-mono-num text-sm font-semibold text-text-primary">
                  {seasonDays !== null ? tr(locale, `${seasonDays}d left`, `осталось ${seasonDays} д.`) : seasonName}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {venue.meta?.referralLink && <a href={venue.meta.referralLink} target="_blank" rel="noreferrer" className={`pf-transition ${onBgLink}`}>{tr(locale, "App ↗", "Приложение ↗")}</a>}
            {venue.meta?.twitterUrl && <a href={venue.meta.twitterUrl} target="_blank" rel="noreferrer" className={`pf-transition ${onBgLink}`}>Twitter ↗</a>}
            {venue.meta?.docsUrl && <a href={venue.meta.docsUrl} target="_blank" rel="noreferrer" className={`pf-transition ${onBgLink}`}>Docs ↗</a>}
          </div>
        </div>

        {!ready ? (
          <section className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-1 p-6 text-center">
            <p className="font-mono-num text-5xl font-semibold tracking-[0.22em] text-text-primary">SOON</p>
            <p className="max-w-sm text-sm text-text-muted">
              {tr(locale, "We are verifying this perp-dex before publishing routes, fees, or point estimates.", "Мы проверяем этот perp-dex перед публикацией маршрутов, комиссий и оценок поинтов.")}
            </p>
          </section>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface-1 p-5">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">{tr(locale, "Points per $1 volume", "Поинтов за $1 объёма")}</span>
                <span className="font-mono-num text-xl font-light text-text-primary">
                  {venue.pointsProgram?.pointsPerUsdVolumeEstimate ?? (isVariational ? tr(locale, "not public", "не опубликовано") : "n/a")}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">{tr(locale, "Maker fee", "Maker-комиссия")}</span>
                <span className="font-mono-num text-xl font-light text-text-primary">{formatBps(makerBps)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">{tr(locale, "Taker fee", "Taker-комиссия")}</span>
                <span className="font-mono-num text-xl font-light text-text-primary">{formatBps(takerBps)}</span>
              </div>
            </div>

            {isVariational ? (
              <>
                <VariationalRewards />
                <section className="grid gap-4 rounded-lg border border-border bg-surface-1 p-5 sm:grid-cols-4">
                  <div className="sm:col-span-3">
                    <h2 className="text-sm font-medium text-text-primary">{tr(locale, "PerpFarm planning estimate", "Плановая оценка PerpFarm")}</h2>
                    <p className="mt-1 text-sm text-text-muted">{tr(locale, "Manual estimate based on observed execution data; not a published point-emission formula.", "Ручная оценка на основе наблюдаемого исполнения; это не опубликованная формула эмиссии поинтов.")}</p>
                  </div>
                  <div className="rounded-md border border-border bg-surface-2 p-3">
                    <p className="text-xs text-text-muted">{tr(locale, "OTC point price", "OTC-цена поинта")}</p>
                    <p className="mt-1 font-mono-num text-xl text-text-primary">$21</p>
                    <p className="mt-1 text-[11px] text-text-muted">{tr(locale, "current manual quote", "текущая ручная котировка")}</p>
                  </div>
                  <div>
                    <p className="font-mono-num text-xl text-text-primary">$5–7 / pt</p>
                    <p className="text-xs text-text-muted">{tr(locale, "medium OI, 12–24h hold", "medium OI, удержание 12–24 ч")}</p>
                  </div>
                  <div>
                    <p className="font-mono-num text-xl text-text-primary">~$11 / pt</p>
                    <p className="text-xs text-text-muted">{tr(locale, "XAU, 1–2h hold", "XAU, удержание 1–2 ч")}</p>
                  </div>
                  <div>
                    <p className="font-mono-num text-xl text-text-primary">0 bps</p>
                    <p className="text-xs text-text-muted">{tr(locale, "maker and taker fee", "maker и taker комиссия")}</p>
                  </div>
                </section>
                <VariationalPairRankings />
                <CompetitionPanel />
              </>
            ) : null}

            <VenueWizard venueSlug={venue.slug} otherVenues={otherVenues} />
          </>
        )}
      </div>
    </div>
  );
}
