"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatPct, formatUsd } from "@/lib/format";
import type { Strategy } from "@/lib/types";

type FundingSource = "seven_day_mean" | "partial_history" | "current_rate";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  buyBps: number;
  sellBps: number;
  buyCostUsd: number;
  sellCostUsd: number;
  accountExecutionCostUsd: number;
  longFundingUsd: number | null;
  shortFundingUsd: number | null;
  longAccountTotalUsd: number;
  shortAccountTotalUsd: number;
  cycleCostUsd: number;
  fundingAnnualizedRate: number | null;
  fundingSource: FundingSource;
  fundingObservedHours: number;
  fundingObservations: number;
}

interface RankingResponse {
  asOf: string;
  fillNotionalUsd: number;
  accountVolumeUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  pairs: PairRanking[];
}

function fundingWindow(locale: "en" | "ru", pair: PairRanking) {
  if (pair.fundingSource === "seven_day_mean") {
    return tr(locale, "7-day mean", "среднее за 7 дней");
  }
  if (pair.fundingSource === "partial_history") {
    return tr(locale, `${pair.fundingObservedHours}h observed`, `наблюдение ${pair.fundingObservedHours} ч`);
  }
  return tr(locale, "current rate only — history is collecting", "только текущая ставка — история собирается");
}

export function VariationalPairRankings({ strategy }: { strategy: Strategy }) {
  const locale = useLocale();
  const [data, setData] = useState<RankingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/venues/variational/pair-rankings?strategy=${strategy}`)
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
  }, [strategy]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">{tr(locale, "Full hedge-cycle calculations", "Расчёты полного хедж-цикла")}</h2>
        <p className="mt-1 text-xs text-text-muted">
          {data
            ? tr(
              locale,
              `Four $${data.fillNotionalUsd.toLocaleString("en-US")} fills: long entry + exit and short entry + exit. Each account turns over ${formatUsd(data.accountVolumeUsd, { decimals: 0 })}; the full cycle is ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} across both accounts, with a ${data.holdHours}h hold.`,
              `Четыре филла по ${formatUsd(data.fillNotionalUsd, { decimals: 0 })}: вход + выход long и вход + выход short. Каждый аккаунт делает ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} объёма; полный цикл — ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} на двух аккаунтах, удержание ${data.holdHours} ч.`
            )
            : tr(locale, "Four fills per cycle: long entry + exit and short entry + exit. Funding is included from the observed funding history.", "Четыре филла на цикл: вход + выход long и вход + выход short. Funding включён из доступной истории ставок.")}
        </p>
      </div>

      {!data && !error && <div className="pf-skeleton h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="text-sm text-negative">{tr(locale, "Couldn’t load live pair calculations.", "Не удалось загрузить live-расчёты пар.")}</p>}

      {data && (
        <ol className="overflow-hidden rounded-md border border-border">
          {data.pairs.map((pair, index) => {
            const open = expanded === pair.pair;
            return (
              <li key={pair.pair} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : pair.pair)}
                  aria-expanded={open}
                  className="pf-transition grid w-full grid-cols-[2.25rem_1fr_auto] items-center gap-3 px-3 py-3 text-left hover:bg-surface-hover"
                >
                  <span className="font-mono-num text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="font-mono-num text-sm font-medium text-text-primary">{pair.pair}</p>
                    <p className="mt-0.5 text-xs text-text-muted">OI {formatUsd(pair.openInterestUsd, { decimals: 0 })}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-num text-sm font-semibold text-text-primary">{formatUsd(pair.cycleCostUsd)}</p>
                    <p className="text-xs text-text-muted">{tr(locale, "full $200k cycle", "полный цикл $200k")}</p>
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border bg-surface-2 px-4 py-3 text-xs text-text-muted sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-text-primary">{tr(locale, "Account A · LONG", "Аккаунт A · LONG")}</p>
                      <p className="mt-1">{tr(locale, "Entry: buy", "Вход: покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.buyCostUsd)}</span> · {pair.buyBps} bps</p>
                      <p className="mt-1">{tr(locale, "Exit: sell", "Выход: продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.sellCostUsd)}</span> · {pair.sellBps} bps</p>
                      <p className="mt-1">{tr(locale, "Funding", "Funding")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.longFundingUsd)}</span></p>
                      <p className="mt-1 font-medium text-text-primary">{tr(locale, "Account total", "Итого аккаунта")}: {formatUsd(pair.longAccountTotalUsd)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{tr(locale, "Account B · SHORT", "Аккаунт B · SHORT")}</p>
                      <p className="mt-1">{tr(locale, "Entry: sell", "Вход: продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.sellCostUsd)}</span> · {pair.sellBps} bps</p>
                      <p className="mt-1">{tr(locale, "Exit: buy", "Выход: покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.buyCostUsd)}</span> · {pair.buyBps} bps</p>
                      <p className="mt-1">{tr(locale, "Funding", "Funding")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.shortFundingUsd)}</span></p>
                      <p className="mt-1 font-medium text-text-primary">{tr(locale, "Account total", "Итого аккаунта")}: {formatUsd(pair.shortAccountTotalUsd)}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p>{tr(locale, "Cycle total", "Итого цикл")}: {formatUsd(pair.longAccountTotalUsd)} + {formatUsd(pair.shortAccountTotalUsd)} = <span className="font-mono-num font-medium text-text-primary">{formatUsd(pair.cycleCostUsd)}</span>.</p>
                      <p className="mt-1">{tr(locale, "Funding rate", "Ставка funding")}: {formatPct(pair.fundingAnnualizedRate, 2)} {tr(locale, "annualized", "годовых")} · {fundingWindow(locale, pair)}. {tr(locale, "At equal long/short size on the same Variational market, one account’s funding payment is the other account’s credit, so net funding is $0; both legs are shown for transparency.", "При равном long/short на одном рынке Variational funding, уплаченный одним аккаунтом, получает другой, поэтому net funding = $0; обе ноги показаны для прозрачности.")}</p>
                      <p className="mt-1">{tr(locale, "Execution uses live public RFQ quotes at $50k, including base spread and quote impact. The future exit quote cannot be known, so the current quote is used as the exit estimate.", "Исполнение использует live-публичные RFQ-котировки на $50k, включая базовый спред и impact котировки. Будущую котировку выхода узнать нельзя, поэтому для оценки выхода используется текущая котировка.")}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {data && <p className="text-xs text-text-muted">{tr(locale, "Snapshot", "Снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</p>}
    </section>
  );
}
