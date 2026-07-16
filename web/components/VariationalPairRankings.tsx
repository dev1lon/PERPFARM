"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";
import type { Strategy } from "@/lib/types";

interface PairRanking {
  pair: string;
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
}

interface RankingResponse {
  asOf: string;
  fillNotionalUsd: number;
  accountVolumeUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  pairs: PairRanking[];
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
                      <p className="mt-2 text-text-primary">{tr(locale, "How to execute", "Как исполнять")}</p>
                      <p className="mt-1">{tr(locale, "Use market / RFQ for both entries and both exits, with a slippage limit enabled. This is the execution used in the calculation.", "Используйте market / RFQ для обоих входов и выходов с включённым лимитом проскальзывания. Именно такое исполнение заложено в расчёт.")}</p>
                      <p className="mt-1">{tr(locale, "Use a limit order only if you are willing to wait for a better quote; it is not included here because one hedge leg may not fill.", "Лимитную заявку используйте только если готовы ждать лучшую котировку: она не входит в расчёт, потому что одна из ног хеджа может не исполниться.")}</p>
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
