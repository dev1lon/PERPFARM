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
  limitLongCycleCostUsd: number;
  limitShortCycleCostUsd: number;
  firstLimitSide: "long" | "short";
  recommendedLimitSide: "long" | "short" | "either";
  marketLegCostUsd: number;
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
        <h2 className="text-sm font-medium text-text-primary">{tr(locale, "Limit-first hedge-cycle calculations", "Расчёты хедж-цикла с limit-первой ногой")}</h2>
        <p className="mt-1 text-sm text-text-muted">
          {data
            ? tr(
              locale,
              `Four $${data.fillNotionalUsd.toLocaleString("en-US")} fills: two passive limits and two immediate market/RFQ hedges. Each account turns over ${formatUsd(data.accountVolumeUsd, { decimals: 0 })}; the full cycle is ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} across both accounts, with a ${data.holdHours}h hold.`,
              `Четыре филла по ${formatUsd(data.fillNotionalUsd, { decimals: 0 })}: два пассивных limit и два немедленных market/RFQ-хеджа. Каждый аккаунт делает ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} объёма; полный цикл — ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} на двух аккаунтах, удержание ${data.holdHours} ч.`
            )
            : tr(locale, "Four fills per cycle: two passive limits and two market/RFQ hedge fills. Funding is included from the observed funding history.", "Четыре филла на цикл: два пассивных limit и два market/RFQ-хеджа. Funding включён из доступной истории ставок.")}
        </p>
      </div>

      {!data && !error && <div className="pf-skeleton h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="text-sm text-negative">{tr(locale, "Couldn’t load live pair calculations.", "Не удалось загрузить live-расчёты пар.")}</p>}

      {data && (
        <ol className="overflow-hidden rounded-md border border-border">
          {data.pairs.map((pair, index) => {
            const open = expanded === pair.pair;
            const limitLongFirst = pair.firstLimitSide === "long";
            const preferredLimit = pair.recommendedLimitSide === "either"
              ? tr(locale, "Either side — current public quotes are equal", "Любая сторона — текущие публичные котировки равны")
              : pair.recommendedLimitSide === "long"
                ? tr(locale, "LONG", "LONG")
                : tr(locale, "SHORT", "SHORT");
            return (
              <li key={pair.pair} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : pair.pair)}
                  aria-expanded={open}
                  className="pf-transition grid w-full grid-cols-[2.25rem_1fr_auto] items-center gap-3 px-3 py-3 text-left hover:bg-surface-hover"
                >
                  <span className="font-mono-num text-sm text-text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="font-mono-num text-sm font-medium text-text-primary">{pair.pair}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-num text-sm font-semibold text-text-primary">{formatUsd(pair.cycleCostUsd)}</p>
                    <p className="text-sm text-text-muted">{tr(locale, "full $200k cycle", "полный цикл $200k")}</p>
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border bg-surface-2 px-4 py-3 text-sm text-text-muted sm:grid-cols-2">
                    <div className="rounded-md border border-border bg-surface-1 p-3 sm:col-span-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <p>{tr(locale, "Limit LONG first", "Сначала limit LONG")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.limitLongCycleCostUsd)}</span> {tr(locale, "market/RFQ cost", "стоимость market/RFQ")}</p>
                        <p>{tr(locale, "Limit SHORT first", "Сначала limit SHORT")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.limitShortCycleCostUsd)}</span> {tr(locale, "market/RFQ cost", "стоимость market/RFQ")}</p>
                      </div>
                      <p className="mt-2 font-medium text-text-primary">{tr(locale, "Recommended passive first leg", "Рекомендуемая пассивная первая нога")}: {preferredLimit}.</p>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{tr(locale, "Account A · LONG", "Аккаунт A · LONG")}</p>
                      {limitLongFirst ? <>
                        <p className="mt-1">{tr(locale, "Entry: LIMIT buy", "Вход: LIMIT покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — {tr(locale, "wait for the target price", "ждать целевую цену")}</p>
                        <p className="mt-1">{tr(locale, "Exit: MARKET sell", "Выход: MARKET продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.sellCostUsd)}</span> · {pair.sellBps} bps</p>
                      </> : <>
                        <p className="mt-1">{tr(locale, "Entry: MARKET buy", "Вход: MARKET покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.buyCostUsd)}</span> · {pair.buyBps} bps</p>
                        <p className="mt-1">{tr(locale, "Exit: LIMIT sell", "Выход: LIMIT продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — {tr(locale, "wait for the target price", "ждать целевую цену")}</p>
                      </>}
                      <p className="mt-1">{tr(locale, "Funding", "Funding")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.longFundingUsd)}</span></p>
                      <p className="mt-1 font-medium text-text-primary">{tr(locale, "Account total", "Итого аккаунта")}: {formatUsd(pair.longAccountTotalUsd)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{tr(locale, "Account B · SHORT", "Аккаунт B · SHORT")}</p>
                      {limitLongFirst ? <>
                        <p className="mt-1">{tr(locale, "Entry: MARKET sell", "Вход: MARKET продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.sellCostUsd)}</span> · {pair.sellBps} bps</p>
                        <p className="mt-1">{tr(locale, "Exit: LIMIT buy", "Выход: LIMIT покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — {tr(locale, "wait for the target price", "ждать целевую цену")}</p>
                      </> : <>
                        <p className="mt-1">{tr(locale, "Entry: LIMIT sell", "Вход: LIMIT продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — {tr(locale, "wait for the target price", "ждать целевую цену")}</p>
                        <p className="mt-1">{tr(locale, "Exit: MARKET buy", "Выход: MARKET покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })} — <span className="font-mono-num text-text-primary">{formatUsd(pair.buyCostUsd)}</span> · {pair.buyBps} bps</p>
                      </>}
                      <p className="mt-1">{tr(locale, "Funding", "Funding")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.shortFundingUsd)}</span></p>
                      <p className="mt-1 font-medium text-text-primary">{tr(locale, "Account total", "Итого аккаунта")}: {formatUsd(pair.shortAccountTotalUsd)}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p>{tr(locale, "Cycle total", "Итого цикл")}: {formatUsd(pair.longAccountTotalUsd)} + {formatUsd(pair.shortAccountTotalUsd)} = <span className="font-mono-num font-medium text-text-primary">{formatUsd(pair.cycleCostUsd)}</span>.</p>
                      <p className="mt-2 text-text-primary">{tr(locale, "How to execute", "Как исполнять")}</p>
                      <p className="mt-1">{tr(locale, "RFQ means request for quote: Omni has no order book and OLP is the actual RFQ maker. Here a LIMIT is a passive user order that waits until OLP’s quote reaches your price.", "RFQ — это запрос котировки: в Omni нет стакана, а реальный RFQ-maker — OLP. LIMIT здесь — пассивная заявка пользователя, которая ждёт, пока котировка OLP дойдёт до вашей цены.")}</p>
                      <p className="mt-1">{tr(locale, "1. Place the recommended LIMIT first. 2. Only after it fills in full, immediately open the opposite MARKET/RFQ hedge with a slippage limit. 3. At exit, place the reduce-only LIMIT shown above; after it fills, market-close the other leg.", "1. Сначала поставьте рекомендуемый LIMIT. 2. Только после полного исполнения сразу откройте противоположный MARKET/RFQ-хедж с лимитом проскальзывания. 3. На выходе поставьте показанный reduce-only LIMIT; после его исполнения закройте вторую ногу market-ордером.")}</p>
                      <p className="mt-1">{tr(locale, "The calculation includes the two market/RFQ legs at the live public $50k quote. A limit price and whether it fills are under your control, so they are not guessed as a cost.", "Расчёт включает две market/RFQ-ноги по live-публичной котировке на $50k. Цену и факт исполнения limit-заявки контролируете вы, поэтому сайт не угадывает их как расход.")}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {data && <p className="text-sm text-text-muted">{tr(locale, "Snapshot", "Снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</p>}
    </section>
  );
}
