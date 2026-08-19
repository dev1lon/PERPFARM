"use client";

import { useEffect, useMemo, useState } from "react";
import { tr, useLocale } from "@/components/LocaleProvider";
import { RouteResults, selectRecommendedPair, type PairRanking, type RankingResponse } from "@/components/v2/ProtocolCalculatorV2";
import { isTradfiMarket } from "@/lib/tradfi";
import { protocolName } from "@/lib/venue-status";

type CrossPair = {
  pair: string; oiAUsd: number; oiBUsd: number; mainOiUsd: number; volume24hMinUsd: number;
  longVenue: string; shortVenue: string; makerVenue: string; takerVenue: string;
  execCostUsd: number; feeCostUsd: number; spreadCostUsd: number; slippageCostUsd: number;
  fundingUsd: number | null; cycleCostUsd: number;
  costRangeLowUsd: number; costRangeHighUsd: number;
  spreadRisk?: "low" | "medium" | "high" | "unknown";
  spreadBreakoutShare?: number | null;
};
type CrossBandKey = "high" | "medium" | "low" | "all";
type CrossResponse = {
  asOf: string; accountVolumeUsd: number; fillNotionalUsd: number; totalCycleVolumeUsd: number;
  holdHours: number; minVolumeUsd: number; grouped: boolean;
  minOpenInterestUsd?: number; hedgeMinOpenInterestUsd?: number;
  feeSchedule?: Array<{ venue: string; makerBps: number; takerBps: number }>;
  costBasis?: "24h-median" | "latest-snapshot";
  sources?: Array<{ venue: string; live: boolean }>;
  bands: { key: CrossBandKey; pairs: CrossPair[] }[];
  /** Every eligible pair, cheapest first -- the source for the All tab. */
  pairs?: CrossPair[];
};

export function CrossPairRankings({
  venueSlug, hedgeSlug, homeName, hedgeName, accountVolumeUsd, tradfiOnly = false, suppressLoading = false, onLoadingChange,
}: {
  venueSlug: string; hedgeSlug: string;
  homeName: string; hedgeName: string; accountVolumeUsd: number; tradfiOnly?: boolean;
  /** The calculator owns the single scan state for same and cross routes. */
  suppressLoading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const locale = useLocale();
  const [response, setResponse] = useState<CrossResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [oiFilter, setOiFilter] = useState<CrossBandKey>("all");

  useEffect(() => {
    let active = true;
    onLoadingChange?.(true);
    const url = "/api/venues/" + venueSlug + "/cross-rankings?hedge=" + encodeURIComponent(hedgeSlug) + "&accountVolumeUsd=" + accountVolumeUsd + "&tradfiOnly=" + tradfiOnly;
    fetch(url).then(async (result) => {
      if (!result.ok) throw new Error((await result.json()).error ?? "request failed");
      return result.json() as Promise<CrossResponse>;
    }).then((data) => {
      if (!active) return;
      setError(null);
      setExpanded(null);
      setResponse(data);
      onLoadingChange?.(false);
    }).catch((reason) => {
      if (!active) return;
      setResponse(null);
      setError(reason instanceof Error ? reason.message : "request failed");
      onLoadingChange?.(false);
    });
    return () => { active = false; };
  }, [venueSlug, hedgeSlug, accountVolumeUsd, tradfiOnly, onLoadingChange]);

  // Order labels read LONG / SHORT. The model decides which venue rests the
  // limits, so the label follows that choice instead of claiming all-taker.
  const mapPairs = (source: CrossPair[]): PairRanking[] => source.map((pair) => {
    const longIsMaker = pair.longVenue === pair.makerVenue;
    return {
      pair: pair.pair,
      openInterestUsd: pair.mainOiUsd,
      competitionEligible: isTradfiMarket(pair.pair),
      firstLimitSide: (longIsMaker ? "long" : "short") as "long" | "short",
      cycleCostUsd: pair.cycleCostUsd,
      costRangeLowUsd: pair.costRangeLowUsd,
      costRangeHighUsd: pair.costRangeHighUsd,
      spreadCostUsd: pair.spreadCostUsd,
      slippageCostUsd: pair.slippageCostUsd,
      spreadRisk: pair.spreadRisk,
      spreadBreakoutShare: pair.spreadBreakoutShare,
      fundingUsd: pair.fundingUsd,
      feeCostUsd: pair.feeCostUsd,
      longVenue: pair.longVenue,
      shortVenue: pair.shortVenue,
      entryOrders: longIsMaker ? "LIMIT / MARKET" : "MARKET / LIMIT",
      exitOrders: longIsMaker ? "LIMIT / MARKET" : "MARKET / LIMIT",
    };
    // No cap here: the API already limits each OI band to ten, and the "All"
    // list is meant to be complete so the table can page through it.
  }).sort((a, b) => a.cycleCostUsd - b.cycleCostUsd);

  const pairs = useMemo<PairRanking[]>(() => {
    const bands = response?.bands ?? [];
    const source = oiFilter === "all" || !response?.grouped
      ? response?.pairs ?? bands.flatMap((band) => band.pairs)
      : bands.find((band) => band.key === oiFilter)?.pairs ?? [];
    return mapPairs(source);
  }, [response, tradfiOnly, oiFilter]);

  if (!response && !error) return suppressLoading ? null : <div className="mt-5 flex flex-col items-center gap-4 rounded-[20px] border border-accent/25 bg-bg px-8 py-14"><div className="h-0.5 w-52 overflow-hidden rounded bg-white/10"><div className="pf-scan h-full w-1/3 bg-accent" /></div><div className="font-mono-num text-[13px] text-accent">{tr(locale, "Pricing the cheapest routes…", "Считаем самые дешёвые маршруты…")}</div></div>;
  if (!response || pairs.length === 0) return <div className="mt-5 rounded-2xl border border-negative/40 bg-negative/10 p-4 text-[14px] text-negative">{error ?? tr(locale, "No liquid cross-venue pairs found.", "Ликвидных кросс-площадочных пар не найдено.")}</div>;

  const data: RankingResponse = {
    asOf: response.asOf, fillNotionalUsd: response.fillNotionalUsd, accountVolumeUsd: response.accountVolumeUsd,
    totalCycleVolumeUsd: response.totalCycleVolumeUsd, holdHours: response.holdHours,
    minVolumeUsd: response.minVolumeUsd,
    // The farmed protocol's floor; the hedge's own (lower) floor is stated beside it.
    minOpenInterestUsd: response.minOpenInterestUsd ?? 0,
    hedgeMinOpenInterestUsd: response.hedgeMinOpenInterestUsd,
    feeSchedule: response.feeSchedule,
    competition: { active: false, name: "" },
    // Same vocabulary as the other calculators: the API says what the number is.
    costBasis: response.costBasis ?? "latest-snapshot",
    // Names the protocol whose collector stalled, same banner as elsewhere.
    sources: response.sources?.map((entry) => ({ venue: protocolName(entry.venue) ?? entry.venue, live: entry.live })),
    grouped: response.grouped,
    bands: response.bands.map((band) => ({ key: band.key, pairs: mapPairs(band.pairs) })),
    pairs: response.pairs ? mapPairs(response.pairs) : undefined,
  };
  const [best, bestRule] = selectRecommendedPair(data.bands, venueSlug as "variational" | "txflow");
  return <RouteResults data={data} top={pairs} best={best} bestRule={bestRule} hedgeName={hedgeName} homeName={homeName} homeSlug={venueSlug as "variational" | "txflow"} hedgeSlug={hedgeSlug as "variational" | "txflow"} expanded={expanded} setExpanded={setExpanded} grouped={response.grouped} oiFilter={oiFilter} setOiFilter={setOiFilter} />;
}
