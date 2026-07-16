"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";
import type { Strategy } from "@/lib/types";

interface PairRanking {
  pair: string;
  openInterestUsd: number;
  executionBps: number;
  longCostUsd: number;
  shortCostUsd: number;
  costPer100kUsd: number;
}

interface RankingResponse {
  asOf: string;
  totalVolumeUsd: number;
  fillNotionalUsd: number;
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
        <h2 className="text-sm font-medium text-text-primary">
          {tr(locale, "10 cheapest pair calculations", "Расчёты 10 самых дешёвых пар")}
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          {tr(
            locale,
            "Costs are normalized to $100,000 total traded volume: $25,000 per fill × long entry/exit and short entry/exit. Fees, spread and RFQ quote impact are included; equal long/short funding nets to $0.",
            "Затраты приведены к общему объёму $100 000: по $25 000 на каждый из четырёх филлов — вход/выход long и вход/выход short. Учтены комиссии, спред и RFQ impact; funding для равных long/short взаимно сокращается до $0."
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
                    <p className="mt-0.5 text-xs text-text-muted">OI {formatUsd(pair.openInterestUsd, { decimals: 0 })} · {pair.executionBps} bps</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-num text-sm font-semibold text-text-primary">{formatUsd(pair.costPer100kUsd)}</p>
                    <p className="text-xs text-text-muted">{tr(locale, "per $100k volume", "за $100k объёма")}</p>
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border bg-surface-2 px-4 py-3 text-xs text-text-muted sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-text-primary">LONG · Variational</p>
                      <p className="mt-1">{tr(locale, "Entry + exit cost", "Стоимость входа + выхода")}: {formatUsd(pair.longCostUsd)} · {formatUsd(data.fillNotionalUsd, { decimals: 0 })} {tr(locale, "per fill", "на филл")}</p>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">SHORT · Variational</p>
                      <p className="mt-1">{tr(locale, "Entry + exit cost", "Стоимость входа + выхода")}: {formatUsd(pair.shortCostUsd)} · {formatUsd(data.fillNotionalUsd, { decimals: 0 })} {tr(locale, "per fill", "на филл")}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p>{tr(locale, "Calculation", "Расчёт")}: {formatUsd(pair.longCostUsd)} + {formatUsd(pair.shortCostUsd)} = <span className="font-mono-num font-medium text-text-primary">{formatUsd(pair.costPer100kUsd)}</span>.</p>
                      <p className="mt-1">{tr(locale, "Included: maker/taker fees (0 bps), half-spread, RFQ quote-curve impact from the public $1k/$100k buckets, and equal long/short funding (net $0).", "Учтено: maker/taker комиссии (0 bps), половина спреда, impact RFQ-кривой из публичных бакетов $1k/$100k и равный funding long/short (итог $0).")}</p>
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
