"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { EmptyNote } from "@/components/v2/EmptyNote";
import { formatUtcDateTime } from "@/lib/format";

const POLYMARKET_EVENT_URL = "https://polymarket.com/event/variational-fdv-above-one-day-after-launch?r=DEVIL0N#vPCdW9Y";

type FdvMarket = {
  threshold: string;
  probability: number;
  volume: number;
  /** 24h move, in the same units as `probability`. */
  dayChange: number | null;
};

type FdvMarketResponse = {
  asOf: string;
  eventVolume: number | null;
  markets: FdvMarket[];
};

/**
 * The 24h move on one threshold.
 *
 * Shown in the same units as the odds above it -- these ARE percentages, so a
 * move of 11 is 44% today against 33% yesterday. A flat market gets nothing at
 * all rather than a grey zero, which would read as a reading rather than as
 * "nothing happened".
 */
function DayChange({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono-num text-[11px] font-semibold ${up ? "text-positive" : "text-negative"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

function compactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Prediction-market FDV expectations.
 *
 * Part of the reference protocol page, so it renders on every protocol: where
 * no public market exists yet the section states that, rather than being
 * dropped and leaving a differently-shaped page.
 */
export function FdvMarketsV2({ venueSlug = "variational" }: { venueSlug?: "variational" | "txflow" }) {
  const locale = useLocale();
  const [data, setData] = useState<FdvMarketResponse | null>(null);
  const [error, setError] = useState(false);
  // Only Variational has a listed Polymarket event today.
  const hasMarket = venueSlug === "variational";

  useEffect(() => {
    if (!hasMarket) return;
    let active = true;
    const load = () => {
      fetch(`/api/venues/${venueSlug}/fdv-market`)
        .then((response) => (response.ok ? response.json() as Promise<FdvMarketResponse> : Promise.reject(new Error("failed"))))
        .then((response) => {
          if (!active) return;
          setData(response);
          setError(false);
        })
        .catch(() => active && setError(true));
    };
    load();
    const refresh = window.setInterval(load, 60 * 60 * 1_000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, [venueSlug, hasMarket]);

  return (
    <section className="mt-11">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.018em] text-text-primary">
            {tr(locale, "Market-implied FDV", "Рыночные ожидания FDV")}
          </h2>
          <p className="pt-1.5 text-[14px] text-text-muted">
            {hasMarket
              ? tr(locale, "Chance that Variational exceeds each FDV threshold one day after launch.", "Вероятность того, что FDV Variational превысит каждый порог через день после запуска.")
              : tr(locale, "Probability markets for this protocol's post-launch FDV.", "Вероятностные рынки для FDV этого протокола после запуска.")}
          </p>
        </div>
        {hasMarket && (
          <a
            href={POLYMARKET_EVENT_URL}
            target="_blank"
            rel="noreferrer"
            className="pf-transition text-[13px] font-semibold text-accent underline decoration-accent/70 underline-offset-4 hover:text-accent-hover"
          >
            {tr(locale, "View on Polymarket ↗", "Открыть Polymarket ↗")}
          </a>
        )}
      </div>

      <div className="rounded-[18px] border border-border bg-surface-1 p-4 sm:p-5">
        {/* The empty states match the loading skeleton's height, so this panel
            does not jump or collapse depending on which state it lands in. */}
        {!hasMarket && (
          <EmptyNote className="min-h-[148px] py-6">
            {tr(locale, "No public FDV prediction market is available for this protocol yet.", "Публичного prediction market по FDV этого протокола пока нет.")}
          </EmptyNote>
        )}
        {hasMarket && !data && !error && <div className="pf-skeleton h-[148px] rounded-xl border border-border bg-surface-2" />}
        {error && (
          <EmptyNote className="min-h-[148px] py-6">
            {tr(locale, "Polymarket FDV data is unavailable right now.", "Данные Polymarket по FDV сейчас недоступны.")}
          </EmptyNote>
        )}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {data.markets.map((market) => (
                <div key={market.threshold} className="rounded-xl border border-border bg-surface-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono-num text-[13px] text-text-muted">{market.threshold}</div>
                    <DayChange value={market.dayChange} />
                  </div>
                  <div className="pt-2 font-mono-num text-[24px] leading-none text-text-primary">{market.probability}%</div>
                  <div className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-positive">{tr(locale, "Yes", "Да")}</div>
                  <div className="pt-3 text-[11px] text-text-muted">
                    {tr(locale, "Volume", "Объём")} <span className="font-mono-num text-text-primary">{compactUsd(market.volume)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 text-[12px] text-text-dim">
              {tr(locale, "Polymarket · refreshes hourly · change over 24h", "Polymarket · обновляется каждый час · изменение за 24ч")}
              {" · "}
              <span className="font-mono-num text-text-muted">
                {formatUtcDateTime(data.asOf)}
              </span>
              {" · "}
              {tr(locale, "Total event volume", "Общий объём события")} <span className="font-mono-num text-text-muted">{compactUsd(data.eventVolume)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
