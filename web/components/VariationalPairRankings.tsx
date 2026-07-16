"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  executionBps: number;
  estimatedRoundTripCostUsd: number;
  estimatedCostPerPointUsd: number;
  holdHours: number;
}

interface RankingResponse {
  asOf: string;
  notionalUsd: number;
  referralBoostPct: number;
  pairs: PairRanking[];
}

export function VariationalPairRankings() {
  const locale = useLocale();
  const [data, setData] = useState<RankingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/venues/variational/pair-rankings")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "request failed");
        return response.json() as Promise<RankingResponse>;
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "request failed");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">
          {tr(locale, "10 pair calculations — cheapest to most expensive", "Расчёты 10 пар — от дешёвой к дорогой")}
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          {tr(
            locale,
            "Live Variational quotes, $10,000 notional and the +16% referral-boost assumption. The model ranks execution cost and medium-OI fit; it is not a published point-emission formula.",
            "Live-котировки Variational, номинал $10 000 и допущение о +16% referral boost. Модель ранжирует стоимость исполнения и соответствие medium OI; это не опубликованная формула эмиссии поинтов."
          )}
        </p>
      </div>

      {!data && !error && <div className="pf-skeleton h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="text-sm text-negative">{tr(locale, "Couldn’t load live pair calculations.", "Не удалось загрузить live-расчёты пар.")}</p>}

      {data && (
        <ol className="overflow-hidden rounded-md border border-border">
          {data.pairs.map((pair, index) => (
            <li key={pair.pair} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
              <span className="font-mono-num text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="font-mono-num text-sm font-medium text-text-primary">{pair.pair}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  OI {formatUsd(pair.openInterestUsd, { decimals: 0 })} · {pair.executionBps} bps · {pair.holdHours}h
                  {tr(locale, " hold", " удержание")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono-num text-sm font-semibold text-text-primary">~${pair.estimatedCostPerPointUsd}/pt</p>
                <p className="text-xs text-text-muted">{formatUsd(pair.estimatedRoundTripCostUsd)} {tr(locale, "round trip", "круг")}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {data && (
        <p className="text-xs text-text-muted">
          {tr(locale, "Snapshot", "Снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")} · {tr(locale, "referral assumption", "допущение referral")}: +{data.referralBoostPct}%
        </p>
      )}
    </section>
  );
}
