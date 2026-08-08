"use client";

import { useEffect, useMemo, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { RouteResults, type PairRanking, type RankingResponse } from "@/components/v2/ProtocolCalculatorV2";

type CrossPair = {
  pair: string; oiAUsd: number; oiBUsd: number; volume24hMinUsd: number;
  longVenue: string; shortVenue: string; execCostUsd: number; feeCostUsd: number;
  fundingUsd: number; cycleCostUsd: number;
};
type CrossResponse = {
  asOf: string; accountVolumeUsd: number; fillNotionalUsd: number; totalCycleVolumeUsd: number;
  holdHours: number; minVolumeUsd: number; grouped: boolean; bands: { pairs: CrossPair[] }[];
};

export function CrossPairRankings({
  venueSlug, hedgeSlug, homeName, hedgeName, accountVolumeUsd, tradfiOnly = false,
}: {
  venueSlug: string; hedgeSlug: string;
  homeName: string; hedgeName: string; accountVolumeUsd: number; tradfiOnly?: boolean;
}) {
  const locale = useLocale();
  const [response, setResponse] = useState<CrossResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResponse(null); setError(null); setExpanded(null);
    const url = "/api/venues/" + venueSlug + "/cross-rankings?hedge=" + encodeURIComponent(hedgeSlug) + "&accountVolumeUsd=" + accountVolumeUsd + "&tradfiOnly=" + tradfiOnly;
    fetch(url).then(async (result) => {
      if (!result.ok) throw new Error((await result.json()).error ?? "request failed");
      return result.json() as Promise<CrossResponse>;
    }).then((data) => active && setResponse(data)).catch((reason) => active && setError(reason instanceof Error ? reason.message : "request failed"));
    return () => { active = false; };
  }, [venueSlug, hedgeSlug, accountVolumeUsd, tradfiOnly]);

  const pairs = useMemo<PairRanking[]>(() => (response?.bands ?? []).flatMap((band) => band.pairs).map((pair) => ({
    pair: pair.pair,
    openInterestUsd: Math.min(pair.oiAUsd, pair.oiBUsd),
    volume24hUsd: pair.volume24hMinUsd,
    competitionEligible: tradfiOnly,
    firstLimitSide: "long" as const,
    cycleCostUsd: pair.cycleCostUsd,
    latestCycleCostUsd: pair.cycleCostUsd,
    costRangeLowUsd: pair.cycleCostUsd,
    costRangeHighUsd: pair.cycleCostUsd,
    spreadCostUsd: Math.max(0, pair.execCostUsd - pair.feeCostUsd),
    slippageCostUsd: 0,
    costTier: "low" as const,
    fundingUsd: pair.fundingUsd,
    feeCostUsd: pair.feeCostUsd,
    entryOrders: "MARKET / MARKET",
    exitOrders: "MARKET / MARKET",
  })).sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, 10), [response, tradfiOnly]);

  if (!response && !error) return <div className="mt-5 flex flex-col items-center gap-4 rounded-[20px] border border-accent/25 bg-bg px-8 py-14"><div className="h-0.5 w-52 overflow-hidden rounded bg-white/10"><div className="pf-scan h-full w-1/3 bg-accent" /></div><div className="font-mono-num text-[13px] text-accent">{tr(locale, "Pricing the cheapest routes…", "Считаем самые дешёвые маршруты…")}</div></div>;
  if (!response || pairs.length === 0) return <div className="mt-5 rounded-2xl border border-negative/40 bg-negative/10 p-4 text-[14px] text-negative">{error ?? tr(locale, "No liquid cross-venue pairs found.", "Ликвидных кросс-площадочных пар не найдено.")}</div>;

  const rawBest = response.bands.flatMap((band) => band.pairs).sort((a, b) => a.cycleCostUsd - b.cycleCostUsd)[0];
  const bestLongSlug = (rawBest.longVenue === venueSlug ? venueSlug : hedgeSlug) as "variational" | "txflow";
  const bestShortSlug = (rawBest.shortVenue === venueSlug ? venueSlug : hedgeSlug) as "variational" | "txflow";
  const bestLongName = bestLongSlug === venueSlug ? homeName : hedgeName;
  const bestShortName = bestShortSlug === venueSlug ? homeName : hedgeName;
  const data: RankingResponse = {
    asOf: response.asOf, fillNotionalUsd: response.fillNotionalUsd, accountVolumeUsd: response.accountVolumeUsd,
    totalCycleVolumeUsd: response.totalCycleVolumeUsd, holdHours: response.holdHours,
    minVolumeUsd: response.minVolumeUsd, minOpenInterestUsd: 0, competition: { active: false, name: "" },
    grouped: false, bands: [{ key: "all", pairs }],
  };
  return <RouteResults data={data} top={pairs} best={pairs[0]} notionalUsd={accountVolumeUsd} hedgeName={bestShortName} homeName={bestLongName} homeSlug={bestLongSlug} hedgeSlug={bestShortSlug} isTxFlow={false} expanded={expanded} setExpanded={setExpanded} grouped={false} oiFilter="all" setOiFilter={() => {}} />;
}
