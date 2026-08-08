"use client";

import { useEffect, useMemo, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { RouteResults, type PairRanking, type RankingResponse } from "@/components/v2/ProtocolCalculatorV2";
import { isTradfiMarket } from "@/lib/tradfi";

type CrossPair = {
  pair: string; oiAUsd: number; oiBUsd: number; mainOiUsd: number; volume24hMinUsd: number;
  longVenue: string; shortVenue: string; makerVenue: string; takerVenue: string;
  execCostUsd: number; feeCostUsd: number; spreadCostUsd: number; slippageCostUsd: number;
  fundingUsd: number | null; cycleCostUsd: number;
};
type CrossBandKey = "high" | "medium" | "low" | "all";
type CrossResponse = {
  asOf: string; accountVolumeUsd: number; fillNotionalUsd: number; totalCycleVolumeUsd: number;
  holdHours: number; minVolumeUsd: number; grouped: boolean;
  bands: { key: CrossBandKey; pairs: CrossPair[] }[];
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
  const [oiFilter, setOiFilter] = useState<CrossBandKey>("all");

  useEffect(() => {
    let active = true;
    const url = "/api/venues/" + venueSlug + "/cross-rankings?hedge=" + encodeURIComponent(hedgeSlug) + "&accountVolumeUsd=" + accountVolumeUsd + "&tradfiOnly=" + tradfiOnly;
    fetch(url).then(async (result) => {
      if (!result.ok) throw new Error((await result.json()).error ?? "request failed");
      return result.json() as Promise<CrossResponse>;
    }).then((data) => {
      if (!active) return;
      setError(null);
      setExpanded(null);
      setResponse(data);
    }).catch((reason) => {
      if (!active) return;
      setResponse(null);
      setError(reason instanceof Error ? reason.message : "request failed");
    });
    return () => { active = false; };
  }, [venueSlug, hedgeSlug, accountVolumeUsd, tradfiOnly]);

  // Order labels read LONG / SHORT. The model decides which venue rests the
  // limits, so the label follows that choice instead of claiming all-taker.
  const executionTier = (pair: CrossPair): "low" | "medium" | "high" => {
    const bps = pair.cycleCostUsd / accountVolumeUsd * 10_000;
    return bps <= 3 ? "low" : bps <= 8 ? "medium" : "high";
  };
  const mapPairs = (source: CrossPair[]): PairRanking[] => source.map((pair) => {
    const longIsMaker = pair.longVenue === pair.makerVenue;
    return {
      pair: pair.pair,
      openInterestUsd: pair.mainOiUsd,
      volume24hUsd: pair.volume24hMinUsd,
      competitionEligible: isTradfiMarket(venueSlug, pair.pair),
      firstLimitSide: (longIsMaker ? "long" : "short") as "long" | "short",
      cycleCostUsd: pair.cycleCostUsd,
      latestCycleCostUsd: pair.cycleCostUsd,
      costRangeLowUsd: pair.cycleCostUsd,
      costRangeHighUsd: pair.cycleCostUsd,
      spreadCostUsd: pair.spreadCostUsd,
      slippageCostUsd: pair.slippageCostUsd,
      costTier: executionTier(pair),
      fundingUsd: pair.fundingUsd,
      feeCostUsd: pair.feeCostUsd,
      entryOrders: longIsMaker ? "LIMIT / MARKET" : "MARKET / LIMIT",
      exitOrders: longIsMaker ? "LIMIT / MARKET" : "MARKET / LIMIT",
    };
  }).sort((a, b) => a.cycleCostUsd - b.cycleCostUsd).slice(0, 10);

  const pairs = useMemo<PairRanking[]>(() => {
    const bands = response?.bands ?? [];
    const source = oiFilter === "all" || !response?.grouped
      ? bands.flatMap((band) => band.pairs)
      : bands.find((band) => band.key === oiFilter)?.pairs ?? [];
    return mapPairs(source);
  }, [response, tradfiOnly, oiFilter]);

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
    grouped: response.grouped,
    bands: response.bands.map((band) => ({ key: band.key, pairs: mapPairs(band.pairs) })),
  };
  return <RouteResults data={data} top={pairs} best={pairs[0]} notionalUsd={accountVolumeUsd} hedgeName={bestShortName} homeName={bestLongName} homeSlug={bestLongSlug} hedgeSlug={bestShortSlug} isTxFlow={false} expanded={expanded} setExpanded={setExpanded} grouped={response.grouped} oiFilter={oiFilter} setOiFilter={setOiFilter} />;
}
