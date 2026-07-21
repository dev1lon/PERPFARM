"use client";

import { useEffect, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { formatUsd } from "@/lib/format";

interface CrossPair {
  pair: string;
  oiAUsd: number;
  oiBUsd: number;
  volume24hMinUsd: number;
  longVenue: string;
  shortVenue: string;
  execCostUsd: number;
  fundingUsd: number;
  cycleCostUsd: number;
}

interface Band {
  key: "high" | "medium" | "low" | "all";
  oiRangeUsd: [number, number];
  pairs: CrossPair[];
}

interface CrossResponse {
  asOf: string;
  venueA: string;
  venueB: string;
  accountVolumeUsd: number;
  fillNotionalUsd: number;
  totalCycleVolumeUsd: number;
  holdHours: number;
  minVolumeUsd: number;
  grouped: boolean;
  bands: Band[];
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function bandTitle(locale: "en" | "ru", key: Band["key"]): string {
  if (key === "high") return tr(locale, "High OI", "Высокий OI");
  if (key === "medium") return tr(locale, "Medium OI", "Средний OI");
  if (key === "low") return tr(locale, "Low OI", "Низкий OI");
  return tr(locale, "All liquid pairs", "Все ликвидные пары");
}

export function CrossPairRankings({
  venueSlug,
  hedgeSlug,
  homeName,
  hedgeName,
  accountVolumeUsd,
}: {
  venueSlug: string;
  hedgeSlug: string;
  homeName: string;
  hedgeName: string;
  accountVolumeUsd: number;
}) {
  const locale = useLocale();
  const [data, setData] = useState<CrossResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/venues/${venueSlug}/cross-rankings?hedge=${encodeURIComponent(hedgeSlug)}&accountVolumeUsd=${accountVolumeUsd}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "request failed");
        return response.json() as Promise<CrossResponse>;
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
  }, [venueSlug, hedgeSlug, accountVolumeUsd]);

  const nameOf = (slug: string): string => (slug === venueSlug ? homeName : slug === hedgeSlug ? hedgeName : slug);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">
          {tr(locale, `Hedge ${homeName} × ${hedgeName}`, `Хедж ${homeName} × ${hedgeName}`)}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {data
            ? tr(
              locale,
              `Delta-neutral across two protocols: open + close on each side (four taker fills). Each account turns over ${formatUsd(data.accountVolumeUsd, { decimals: 0 })}, ${data.holdHours}h hold. Cost = fees + spread + impact on both books, plus the funding delta (which can be income). Only pairs listed on both, over ${formatUsd(data.minVolumeUsd, { decimals: 0 })} 24h volume; grouped by the smaller of the two OIs.`,
              `Дельта-нейтрально на двух протоколах: открытие + закрытие на каждой стороне (четыре taker-филла). Каждый аккаунт делает ${formatUsd(data.accountVolumeUsd, { decimals: 0 })}, удержание ${data.holdHours} ч. Стоимость = комиссии + спред + impact на обеих книгах, плюс дельта funding (может быть доходом). Только пары, листнутые на обеих биржах, с объёмом от ${formatUsd(data.minVolumeUsd, { decimals: 0 })} за 24 ч; группировка по меньшему из двух OI.`
            )
            : tr(locale, "Computing cross-protocol execution cost from the latest snapshots.", "Считаем стоимость исполнения между протоколами из последних снапшотов.")}
        </p>
      </div>

      {!data && !error && <div className="pf-skeleton h-72 rounded-md border border-border bg-surface-2" />}
      {error && <p className="text-sm text-negative">{tr(locale, "Couldn't load cross-protocol pairs.", "Не удалось загрузить кросс-протокольные пары.")}</p>}

      {data && data.bands.map((band) => (
        <div key={band.key} className="flex flex-col gap-2">
          {data.grouped && (
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-text-primary">{bandTitle(locale, band.key)}</h3>
              <span className="text-xs text-text-muted">OI {formatCompactUsd(band.oiRangeUsd[0])}–{formatCompactUsd(band.oiRangeUsd[1])}</span>
            </div>
          )}
          {band.pairs.length === 0 ? (
            <p className="rounded-md border border-border px-3 py-3 text-sm text-text-muted">{tr(locale, "No liquid pairs in this band.", "Нет ликвидных пар в этой группе.")}</p>
          ) : (
            <ol className="overflow-hidden rounded-md border border-border">
              {band.pairs.map((pair, index) => {
                const open = expanded === pair.pair;
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
                          <span>{tr(locale, "long", "лонг")} <span className="font-medium text-text-primary">{nameOf(pair.longVenue)}</span></span>
                          <span>{tr(locale, "short", "шорт")} <span className="font-medium text-text-primary">{nameOf(pair.shortVenue)}</span></span>
                          {pair.fundingUsd < 0 && (
                            <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-medium text-emerald-400">
                              {tr(locale, "funding +", "funding +")}{formatUsd(-pair.fundingUsd)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono-num text-sm font-semibold text-text-primary">{formatUsd(pair.cycleCostUsd)}</p>
                        <p className="text-sm text-text-muted">{tr(locale, "full cycle", "полный цикл")}</p>
                      </div>
                    </button>
                    {open && (
                      <div className="grid gap-2 border-t border-border bg-surface-2 px-4 py-3 text-sm text-text-muted sm:grid-cols-2">
                        <p className="font-medium text-text-primary sm:col-span-2">
                          {tr(locale, `Long ${nameOf(pair.longVenue)}, short ${nameOf(pair.shortVenue)}`, `Лонг ${nameOf(pair.longVenue)}, шорт ${nameOf(pair.shortVenue)}`)}
                        </p>
                        <p>{tr(locale, "Execution", "Исполнение")} (fees + spread + impact): <span className="font-mono-num text-text-primary">{formatUsd(pair.execCostUsd)}</span></p>
                        <p>{tr(locale, "Funding delta", "Дельта funding")}: <span className="font-mono-num text-text-primary">{formatUsd(pair.fundingUsd)}</span></p>
                        <p>OI {nameOf(pair.longVenue) === homeName ? homeName : hedgeName}: <span className="font-mono-num">{formatCompactUsd(pair.oiAUsd)}</span> / {formatCompactUsd(pair.oiBUsd)}</p>
                        <p>{tr(locale, "24h vol (min)", "Объём 24ч (min)")}: <span className="font-mono-num">{formatCompactUsd(pair.volume24hMinUsd)}</span></p>
                        <p className="border-t border-border pt-2 font-medium text-text-primary sm:col-span-2">
                          {tr(locale, "Full-cycle cost", "Стоимость полного цикла")}: <span className="font-mono-num">{formatUsd(pair.cycleCostUsd)}</span>
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ))}

      {data && <p className="text-sm text-text-muted">{tr(locale, "Snapshot", "Снимок")} {new Date(data.asOf).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</p>}
    </section>
  );
}
