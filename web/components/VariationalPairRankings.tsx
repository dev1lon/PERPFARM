"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";
import type { Strategy } from "@/lib/types";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  firstLimitSide: "long" | "short";
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

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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
        <h2 className="text-sm font-medium text-text-primary">
          {tr(locale, "Hedge-cycle calculations", "Расчёты хедж-цикла")}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {data
            ? tr(
              locale,
              `Four $${data.fillNotionalUsd.toLocaleString("en-US")} fills: two LIMIT and two MARKET orders. Each account turns over ${formatUsd(data.accountVolumeUsd, { decimals: 0 })}; the full cycle is ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} across both accounts, with a ${data.holdHours}h hold.`,
              `Четыре филла по ${formatUsd(data.fillNotionalUsd, { decimals: 0 })}: два LIMIT- и два MARKET-ордера. Каждый аккаунт делает ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} объёма; полный цикл — ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} на двух аккаунтах, удержание ${data.holdHours} ч.`
            )
            : tr(locale, "Four fills per cycle: two LIMIT and two MARKET orders. Funding is included from the observed funding history.", "Четыре филла на цикл: два LIMIT- и два MARKET-ордера. Funding включён из доступной истории ставок.")}
        </p>
      </div>

      {!data && !error && <div className="pf-skeleton h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="text-sm text-negative">{tr(locale, "Couldn't load live pair calculations.", "Не удалось загрузить live-расчёты пар.")}</p>}

      {data && (
        <ol className="overflow-hidden rounded-md border border-border">
          {data.pairs.map((pair, index) => {
            const open = expanded === pair.pair;
            const limitLongFirst = pair.firstLimitSide === "long";
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
                    <p className="mt-0.5 text-xs text-text-muted">OI <span className="font-mono-num">{formatCompactUsd(pair.openInterestUsd)}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-num text-sm font-semibold text-text-primary">{formatUsd(pair.cycleCostUsd)}</p>
                    <p className="text-sm text-text-muted">{tr(locale, "full $200k cycle", "полный цикл $200k")}</p>
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border bg-surface-2 px-4 py-3 text-sm text-text-muted sm:grid-cols-2">
                    <p className="font-medium text-text-primary sm:col-span-2">
                      {limitLongFirst
                        ? tr(locale, "Start with LIMIT LONG", "Начинайте с LIMIT LONG")
                        : tr(locale, "Start with LIMIT SHORT", "Начинайте с LIMIT SHORT")}
                    </p>
                    <div>
                      <p className="font-medium text-text-primary">{tr(locale, "Account A · LONG", "Аккаунт A · LONG")}</p>
                      {limitLongFirst ? <>
                        <p className="mt-1">{tr(locale, "Entry: LIMIT buy", "Вход: LIMIT покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                        <p className="mt-1">{tr(locale, "Exit: MARKET sell", "Выход: MARKET продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                      </> : <>
                        <p className="mt-1">{tr(locale, "Entry: MARKET buy", "Вход: MARKET покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                        <p className="mt-1">{tr(locale, "Exit: LIMIT sell", "Выход: LIMIT продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                      </>}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{tr(locale, "Account B · SHORT", "Аккаунт B · SHORT")}</p>
                      {limitLongFirst ? <>
                        <p className="mt-1">{tr(locale, "Entry: MARKET sell", "Вход: MARKET продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                        <p className="mt-1">{tr(locale, "Exit: LIMIT buy", "Выход: LIMIT покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                      </> : <>
                        <p className="mt-1">{tr(locale, "Entry: LIMIT sell", "Вход: LIMIT продажа")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                        <p className="mt-1">{tr(locale, "Exit: MARKET buy", "Выход: MARKET покупка")} {formatUsd(data.fillNotionalUsd, { decimals: 0 })}</p>
                      </>}
                    </div>
                    <div className="border-t border-border pt-3 sm:col-span-2">
                      <p className="font-medium text-text-primary">
                        {tr(locale, "Full-cycle cost", "Стоимость полного цикла")}: <span className="font-mono-num">{formatUsd(pair.cycleCostUsd)}</span>
                      </p>
                      <p className="mt-1">{tr(locale, "Net funding: $0 with equal LONG and SHORT size.", "Net funding: $0 при равном размере LONG и SHORT.")}</p>
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
