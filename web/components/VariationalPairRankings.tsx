"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";
import type { Strategy } from "@/lib/types";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  longExecutionBps: number;
  shortExecutionBps: number;
  longCostUsd: number;
  shortCostUsd: number;
  averageCostUsd: number;
}

interface RankingResponse {
  asOf: string;
  executionNotionalUsd: number;
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
        <h2 className="text-sm font-medium text-text-primary">{tr(locale, "Pair execution calculations", "Расчёты исполнения по парам")}</h2>
        <p className="mt-1 text-xs text-text-muted">
          {tr(
            locale,
            "One $100,000 entry per direction. LONG is the executable buy quote; SHORT is the executable sell quote. This is the same one-way execution-cost basis as PerpDexList.",
            "По одному входу на $100 000 в каждую сторону. LONG — исполнимая котировка на покупку; SHORT — на продажу. Это та же база one-way execution cost, что и в PerpDexList."
          )}
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
                    <p className="font-mono-num text-sm font-semibold text-text-primary">L {formatUsd(pair.longCostUsd)} · S {formatUsd(pair.shortCostUsd)}</p>
                    <p className="text-xs text-text-muted">{tr(locale, "each / $100k entry", "каждый / вход $100k")}</p>
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border bg-surface-2 px-4 py-3 text-xs text-text-muted sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-text-primary">LONG · Variational</p>
                      <p className="mt-1">{tr(locale, "Buy entry", "Вход на покупку")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.longCostUsd)}</span> · {pair.longExecutionBps} bps</p>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">SHORT · Variational</p>
                      <p className="mt-1">{tr(locale, "Sell entry", "Вход на продажу")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.shortCostUsd)}</span> · {pair.shortExecutionBps} bps</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p>{tr(locale, "Average one-way entry cost", "Средняя стоимость одного входа")}: <span className="font-mono-num font-medium text-text-primary">{formatUsd(pair.averageCostUsd)}</span> {tr(locale, "per $100k", "на $100k")}.</p>
                      <p className="mt-1">{tr(locale, "Included: 0 bps trading fee and the live public RFQ quote for this size (base spread + quote impact). OI is shown for pair selection. Exit, funding and point emissions are separate: they depend on the chosen holding period and are not part of a one-way execution cost.", "Учтено: торговая комиссия 0 bps и live-публичная RFQ-котировка для этого размера (базовый спред + impact котировки). OI показан для выбора пары. Выход, funding и эмиссия поинтов считаются отдельно: они зависят от выбранного срока удержания и не входят в цену одного входа.")}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {data && <p className="text-xs text-text-muted">{tr(locale, "Snapshot", "Снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")} · {tr(locale, "RFQ size", "Размер RFQ")} {formatUsd(data.executionNotionalUsd, { decimals: 0 })}</p>}
    </section>
  );
}
