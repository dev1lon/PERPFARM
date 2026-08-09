"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd, formatUtcDateTime } from "@/lib/format";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  volume24hUsd: number;
  competitionEligible: boolean;
  firstLimitSide: "long" | "short";
  cycleCostUsd: number;
}

interface Band {
  key: "high" | "medium" | "low" | "all";
  oiRangeUsd: [number, number];
  pairs: PairRanking[];
}

interface RankingResponse {
  asOf: string;
  fillNotionalUsd: number;
  accountVolumeUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  minVolumeUsd: number;
  competition: { active: boolean; name: string };
  grouped: boolean;
  bands: Band[];
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function bandTitle(locale: "en" | "ru", key: Band["key"]): string {
  if (key === "high") return tr(locale, "High OI", "Высокий OI");
  if (key === "medium") return tr(locale, "Medium OI", "Средний OI");
  if (key === "low") return tr(locale, "Low OI", "Низкий OI");
  return tr(locale, "All liquid pairs", "Все ликвидные пары");
}

export function VariationalPairRankings({
  accountVolumeUsd,
  tradfiOnly = false,
}: {
  accountVolumeUsd: number;
  tradfiOnly?: boolean;
}) {
  const locale = useLocale();
  const [data, setData] = useState<RankingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/venues/variational/pair-rankings?accountVolumeUsd=${accountVolumeUsd}&tradfiOnly=${tradfiOnly}`)
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
  }, [accountVolumeUsd, tradfiOnly]);

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
              `Four $${data.fillNotionalUsd.toLocaleString("en-US")} fills: two LIMIT and two MARKET orders. Each account turns over ${formatUsd(data.accountVolumeUsd, { decimals: 0 })}; the full cycle is ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} across both accounts, with a ${data.holdHours}h hold. Pairs under ${formatUsd(data.minVolumeUsd, { decimals: 0 })} of 24h volume are dropped as dead.`,
              `Четыре филла по ${formatUsd(data.fillNotionalUsd, { decimals: 0 })}: два LIMIT- и два MARKET-ордера. Каждый аккаунт делает ${formatUsd(data.accountVolumeUsd, { decimals: 0 })} объёма; полный цикл — ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} на двух аккаунтах, удержание ${data.holdHours} ч. Пары с объёмом меньше ${formatUsd(data.minVolumeUsd, { decimals: 0 })} за 24 ч отбрасываются как мёртвые.`
            )
            : tr(locale, "Four fills per cycle: two LIMIT and two MARKET orders. Pairs are grouped by open interest and ranked by execution cost.", "Четыре филла на цикл: два LIMIT- и два MARKET-ордера. Пары сгруппированы по open interest и отранжированы по стоимости исполнения.")}
        </p>
      </div>

      {data?.competition.active && (
        <div className="rounded-md border border-accent/35 bg-accent/10 px-3 py-2 text-sm leading-5 text-text-primary">
          <span className="font-medium text-accent">{tr(locale, "Trading competition", "Торговый конкурс")}</span>{" "}
          {tr(locale, "is active — eligible TradFi pairs are marked with a badge so their volume counts toward the competition score.", "активен — eligible TradFi-пары помечены бейджем; их объём идёт в зачёт конкурса.")}
        </div>
      )}

      {!data && !error && <div className="pf-skeleton h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="text-sm text-negative">{tr(locale, "Couldn't load pair calculations.", "Не удалось загрузить расчёты пар.")}</p>}

      {data && data.bands.map((band) => (
        <div key={band.key} className="flex flex-col gap-2">
          {data.grouped && (
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-text-primary">{bandTitle(locale, band.key)}</h3>
              <span className="text-xs text-text-muted">
                OI {formatCompactUsd(band.oiRangeUsd[0])}–{formatCompactUsd(band.oiRangeUsd[1])}
              </span>
            </div>
          )}
          {band.pairs.length === 0 ? (
            <p className="rounded-md border border-border px-3 py-3 text-sm text-text-muted">
              {tr(locale, "No liquid pairs in this band.", "Нет ликвидных пар в этой группе.")}
            </p>
          ) : (
            <ol className="overflow-hidden rounded-md border border-border">
              {band.pairs.map((pair, index) => {
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                          <span>OI <span className="font-mono-num">{formatCompactUsd(pair.openInterestUsd)}</span></span>
                          <span>{tr(locale, "Vol", "Объём")} <span className="font-mono-num">{formatCompactUsd(pair.volume24hUsd)}</span></span>
                          {pair.competitionEligible && (
                            <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-medium text-emerald-400">
                              {tr(locale, "Competition eligible", "Eligible для конкурса")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono-num text-sm font-semibold text-text-primary">{formatUsd(pair.cycleCostUsd)}</p>
                        <p className="text-sm text-text-muted">{tr(locale, `full ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })} cycle`, `полный цикл ${formatUsd(data.totalCycleVolumeUsd, { decimals: 0 })}`)}</p>
                      </div>
                    </button>
                    {open && (
                      <div className="grid gap-3 border-t border-border bg-surface-2 px-4 py-3 text-sm text-text-muted sm:grid-cols-2">
                        <p className="font-medium text-text-primary sm:col-span-2">
                          {tr(locale, "Example hedge sequence", "Пример последовательности хеджа")}
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
        </div>
      ))}

      {data && <p className="text-sm text-text-muted">{tr(locale, "Snapshot", "Снимок")} {formatUtcDateTime(data.asOf)}</p>}
    </section>
  );
}
