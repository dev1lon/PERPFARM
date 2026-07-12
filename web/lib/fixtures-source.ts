/**
 * Dev/demo data source: computes the same shapes lib/db.ts returns, but
 * entirely from data/fixtures/*.json + data/manual/*.yaml -- no Postgres.
 *
 * This mirrors worker/perpfarm/scoring/fixture_loader.py and is what
 * `perpfarm print-routes` uses on the Python side. lib/data-source.ts picks
 * this over lib/db.ts whenever DATABASE_URL isn't set, so `npm run dev`
 * works out of the box against the two synthetic fixture venues
 * (venue_alpha, venue_beta) without any local infrastructure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { recomputeRoute, SELF_MATCH_IMPACT_FACTOR, type LegInputs } from "./scoring";
import type {
  CostBreakdown,
  RouteDetail,
  RouteScoreRow,
  VenueDetail,
  VenueSummary,
} from "./types";

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirnameLocal, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const FIXTURES_DIR = path.join(DATA_DIR, "fixtures");
const MANUAL_DIR = path.join(DATA_DIR, "manual");

const FIXTURE_VENUE_SLUGS = ["venue_alpha", "venue_beta"] as const;
const VENUE_NAMES: Record<string, string> = {
  venue_alpha: "Perp-dex Alpha (fixture)",
  venue_beta: "Perp-dex Beta (fixture)",
};

const DEFAULT_PARAMS = { notionalUsd: 10_000, holdHours: 24 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readYamlList(filePath: string, key: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const data = loadYaml(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown> | undefined;
  return (data?.[key] as unknown[]) ?? [];
}

interface MarketFixture {
  symbol: string;
  symbol_canonical: string;
  base_asset: string;
  is_active: boolean;
}

function loadMarkets(slug: string): MarketFixture[] {
  return readJson(path.join(FIXTURES_DIR, slug, "markets.json"));
}

function loadFunding(slug: string, symbol: string) {
  const all = readJson(path.join(FIXTURES_DIR, slug, "funding.json"));
  return all[symbol] as { funding_rate_annualized: number } | undefined;
}

function loadOrderbook(slug: string, symbol: string) {
  const all = readJson(path.join(FIXTURES_DIR, slug, "orderbook.json"));
  return all[symbol] as
    | {
        spread_bps: number;
        impact_bps_10k: number | null;
        impact_bps_50k: number | null;
        impact_bps_100k: number | null;
        depth_usd_10k: number | null;
        depth_usd_50k: number | null;
        depth_usd_100k: number | null;
      }
    | undefined;
}

function loadFees(slug: string): { maker_bps: number; taker_bps: number } | null {
  const feesPath = path.join(FIXTURES_DIR, slug, "fees.json");
  if (!fs.existsSync(feesPath)) return null;
  return readJson(feesPath);
}

function loadSymbolOverrides(): Map<string, string> {
  const rows = readYamlList(path.join(MANUAL_DIR, "symbol_overrides.yaml"), "overrides");
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(`${row.venue}::${row.symbol}`, row.symbol_canonical);
  }
  return map;
}

function loadManualByVenue(filename: string, key: string): Map<string, Record<string, unknown>> {
  const rows = readYamlList(path.join(MANUAL_DIR, filename), key);
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows as Record<string, unknown>[]) {
    map.set(row.venue as string, row);
  }
  return map;
}

function loadPairWeights(): Map<string, Record<string, unknown>> {
  const rows = readYamlList(path.join(MANUAL_DIR, "pair_weights.yaml"), "pair_weights");
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows as Record<string, unknown>[]) {
    map.set(`${row.venue}::${row.symbol_canonical}`, row);
  }
  return map;
}

interface ManualData {
  pointsPrograms: Map<string, Record<string, unknown>>;
  executionRules: Map<string, Record<string, unknown>>;
  venueMeta: Map<string, Record<string, unknown>>;
  pairWeights: Map<string, Record<string, unknown>>;
  overrides: Map<string, string>;
}

function loadManualData(): ManualData {
  return {
    pointsPrograms: loadManualByVenue("points_programs.yaml", "points_programs"),
    executionRules: loadManualByVenue("execution_rules.yaml", "execution_rules"),
    venueMeta: loadManualByVenue("venue_meta.yaml", "venue_meta"),
    pairWeights: loadPairWeights(),
    overrides: loadSymbolOverrides(),
  };
}

function buildLegInputs(
  slug: string,
  canonical: string,
  nativeSymbol: string,
  manual: ManualData,
  isSelfMatch: boolean
): LegInputs {
  const funding = loadFunding(slug, nativeSymbol);
  const book = loadOrderbook(slug, nativeSymbol);
  const fees = loadFees(slug);
  const points = manual.pointsPrograms.get(slug);
  const rules = manual.executionRules.get(slug);
  const weight = manual.pairWeights.get(`${slug}::${canonical}`);

  // Same-venue (two-account) routes largely fill against each other rather
  // than walking the public book -- damp the measured impact curve. See
  // SELF_MATCH_IMPACT_FACTOR / docs/scoring.md.
  const damping = isSelfMatch ? SELF_MATCH_IMPACT_FACTOR : 1.0;
  const damp = (v: number | null | undefined): number | null => (v == null ? null : v * damping);

  return {
    venue: slug,
    makerBps: fees?.maker_bps ?? null,
    takerBps: fees?.taker_bps ?? null,
    spreadBps: book?.spread_bps ?? null,
    impactBps10k: damp(book?.impact_bps_10k),
    impactBps50k: damp(book?.impact_bps_50k),
    impactBps100k: damp(book?.impact_bps_100k),
    depthUsd10k: book?.depth_usd_10k ?? null,
    depthUsd50k: book?.depth_usd_50k ?? null,
    depthUsd100k: book?.depth_usd_100k ?? null,
    fundingRateAnnualized7dMean: funding?.funding_rate_annualized ?? null,
    pointsPerUsdVolumeEstimate: (points?.points_per_usd_volume_estimate as number) ?? null,
    pairWeightMultiplier: (weight?.weight_multiplier as number) ?? 1.0,
    makerCountsForPoints: (rules?.maker_counts_for_points as boolean) ?? null,
    takerCountsForPoints: (rules?.taker_counts_for_points as boolean) ?? null,
    makerBoostMultiplier: (rules?.maker_boost_multiplier as number) ?? 1.0,
  };
}

function nativeByCanonical(slug: string, manual: ManualData): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of loadMarkets(slug)) {
    const canonical = manual.overrides.get(`${slug}::${m.symbol}`) ?? m.symbol_canonical;
    map.set(canonical, m.symbol);
  }
  return map;
}

function legToInputsJson(leg: LegInputs) {
  return {
    venue: leg.venue,
    maker_bps: leg.makerBps,
    taker_bps: leg.takerBps,
    spread_bps: leg.spreadBps,
    impact_bps_10k: leg.impactBps10k,
    impact_bps_50k: leg.impactBps50k,
    impact_bps_100k: leg.impactBps100k,
    depth_usd_10k: leg.depthUsd10k,
    depth_usd_50k: leg.depthUsd50k,
    depth_usd_100k: leg.depthUsd100k,
    funding_rate_annualized_7d_mean: leg.fundingRateAnnualized7dMean,
    points_per_usd_volume_estimate: leg.pointsPerUsdVolumeEstimate,
    pair_weight_multiplier: leg.pairWeightMultiplier,
    maker_counts_for_points: leg.makerCountsForPoints,
    taker_counts_for_points: leg.takerCountsForPoints,
    maker_boost_multiplier: leg.makerBoostMultiplier,
  };
}

function buildRouteRow(
  canonical: string,
  longSlug: string,
  shortSlug: string,
  longLeg: LegInputs,
  shortLeg: LegInputs
): RouteScoreRow {
  const result = recomputeRoute(longLeg, shortLeg, DEFAULT_PARAMS);
  const costBreakdown: CostBreakdown = {
    notional_usd: DEFAULT_PARAMS.notionalUsd,
    hold_hours: DEFAULT_PARAMS.holdHours,
    long: {
      venue: longSlug,
      order_type: result.long.orderType,
      fee_usd: result.long.feeUsd,
      spread_cost_usd: result.long.spreadCostUsd,
      points: result.long.points,
      fill_risk: result.long.fillRisk,
      beyond_measured_depth: result.long.beyondMeasuredDepth,
    },
    short: {
      venue: shortSlug,
      order_type: result.short.orderType,
      fee_usd: result.short.feeUsd,
      spread_cost_usd: result.short.spreadCostUsd,
      points: result.short.points,
      fill_risk: result.short.fillRisk,
      beyond_measured_depth: result.short.beyondMeasuredDepth,
    },
    funding_cost_usd: result.fundingCostUsd,
    total_cost_usd: result.totalCostUsd,
    total_points: result.totalPoints,
    risks: {
      fill_risk: result.risks.fillRisk,
      beyond_measured_depth: result.risks.beyondMeasuredDepth,
      wash_risk: longSlug === shortSlug,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ long_inputs: legToInputsJson(longLeg), short_inputs: legToInputsJson(shortLeg) } as any),
  };

  return {
    symbolCanonical: canonical,
    longVenueSlug: longSlug,
    longVenueName: VENUE_NAMES[longSlug] ?? longSlug,
    shortVenueSlug: shortSlug,
    shortVenueName: VENUE_NAMES[shortSlug] ?? shortSlug,
    ts: new Date().toISOString(),
    isComplete: true,
    costPerPointUsd: result.costPerPointUsd,
    pointsPer1mVolume: result.pointsPer1mVolume,
    dilutionScore: null,
    costBreakdown,
    recommendedExecution: {
      long: { order_type: result.long.orderType, why: result.longWhy },
      short: { order_type: result.short.orderType, why: result.shortWhy },
    },
    dataFreshness: { oldest_manual_date: null, min_confidence: "estimated", incomplete_reasons: [] },
  };
}

export function fixtureRoutes(): RouteScoreRow[] {
  const manual = loadManualData();
  const nativeByVenue = new Map<string, Map<string, string>>(
    FIXTURE_VENUE_SLUGS.map((slug) => [slug, nativeByCanonical(slug, manual)])
  );

  const symbolVenues = new Map<string, string[]>();
  for (const [slug, native] of nativeByVenue) {
    for (const canonical of native.keys()) {
      symbolVenues.set(canonical, [...(symbolVenues.get(canonical) ?? []), slug]);
    }
  }

  const build = (slug: string, canonical: string, isSelfMatch: boolean): LegInputs =>
    buildLegInputs(slug, canonical, nativeByVenue.get(slug)!.get(canonical)!, manual, isSelfMatch);

  const routes: RouteScoreRow[] = [];
  for (const [canonical, slugs] of symbolVenues) {
    // same-venue (self-match) routes: one per (venue, symbol) it lists
    for (const slug of slugs) {
      const longLeg = build(slug, canonical, true);
      const shortLeg = build(slug, canonical, true);
      routes.push(buildRouteRow(canonical, slug, slug, longLeg, shortLeg));
    }

    if (slugs.length < 2) continue;
    for (const longSlug of slugs) {
      for (const shortSlug of slugs) {
        if (longSlug === shortSlug) continue;
        const longLeg = build(longSlug, canonical, false);
        const shortLeg = build(shortSlug, canonical, false);
        routes.push(buildRouteRow(canonical, longSlug, shortSlug, longLeg, shortLeg));
      }
    }
  }
  return routes;
}

/** All routes connecting `venueSlug` and `hedgeSlug` (both directions, or
 * the single same-venue direction when they're equal) -- mirrors
 * lib/db.ts::getRoutesForVenuePair for the fixture-data path. */
export function fixtureRoutesForVenuePair(venueSlug: string, hedgeSlug: string): RouteScoreRow[] {
  return fixtureRoutes().filter(
    (r) =>
      (r.longVenueSlug === venueSlug && r.shortVenueSlug === hedgeSlug) ||
      (r.longVenueSlug === hedgeSlug && r.shortVenueSlug === venueSlug)
  );
}

export function fixtureRouteDetail(
  symbolCanonical: string,
  longSlug: string,
  shortSlug: string
): RouteDetail | null {
  const route = fixtureRoutes().find(
    (r) =>
      r.symbolCanonical === symbolCanonical &&
      r.longVenueSlug === longSlug &&
      r.shortVenueSlug === shortSlug
  );
  if (!route) return null;
  return {
    symbolCanonical,
    long: { slug: longSlug, name: VENUE_NAMES[longSlug] ?? longSlug },
    short: { slug: shortSlug, name: VENUE_NAMES[shortSlug] ?? shortSlug },
    latest: route,
    history: [{ ts: route.ts, costPerPointUsd: route.costPerPointUsd, isComplete: true }],
    fundingHistory: { long: [], short: [] },
    spreadHistory: { long: [], short: [] },
  };
}

export function fixtureVenues(): VenueSummary[] {
  const manual = loadManualData();
  const routes = fixtureRoutes();
  return FIXTURE_VENUE_SLUGS.map((slug) => {
    const fees = loadFees(slug);
    const meta = manual.venueMeta.get(slug);
    const points = manual.pointsPrograms.get(slug);
    const pairs = Array.from(nativeByCanonical(slug, manual).keys());
    const venueRoutes = routes.filter(
      (r) => (r.longVenueSlug === slug || r.shortVenueSlug === slug) && r.isComplete
    );
    const costs = venueRoutes
      .map((r) => r.costPerPointUsd)
      .filter((v): v is number => v !== null);
    const cheapest = costs.length > 0 ? Math.min(...costs) : null;
    return {
      slug,
      name: VENUE_NAMES[slug],
      apiStatus: "stub" as const,
      seasonName: (meta?.season_name as string) ?? null,
      seasonEndDate: (meta?.season_end_date as string) ?? null,
      makerBps: fees?.maker_bps ?? null,
      takerBps: fees?.taker_bps ?? null,
      confidence: (points?.confidence as VenueSummary["confidence"]) ?? null,
      lastVerified: (points?.last_verified as string) ?? null,
      pairs,
      cheapestCostPerPointUsd: cheapest,
    };
  });
}

export function fixtureVenueDetail(slug: string): VenueDetail | null {
  if (!FIXTURE_VENUE_SLUGS.includes(slug as (typeof FIXTURE_VENUE_SLUGS)[number])) return null;
  const manual = loadManualData();
  const fees = loadFees(slug);
  const meta = manual.venueMeta.get(slug);
  const points = manual.pointsPrograms.get(slug);
  const rules = manual.executionRules.get(slug);
  const markets = loadMarkets(slug);

  return {
    slug,
    name: VENUE_NAMES[slug],
    apiStatus: "stub",
    meta: meta
      ? {
          raisedUsd: (meta.raised_usd as number) ?? null,
          investors: (meta.investors as string) ?? null,
          communitySupplyPct: (meta.community_supply_pct as number) ?? null,
          otcPointPriceUsd: (meta.otc_point_price_usd as number) ?? null,
          seasonName: (meta.season_name as string) ?? null,
          seasonEndDate: (meta.season_end_date as string) ?? null,
          twitterUrl: (meta.twitter_url as string) ?? null,
          docsUrl: (meta.docs_url as string) ?? null,
          referralLink: (meta.referral_link as string) ?? null,
          notesMd: (meta.notes_md as string) ?? null,
        }
      : null,
    pointsProgram: points
      ? {
          descriptionMd: points.description_md as string,
          pointsPerUsdVolumeEstimate: (points.points_per_usd_volume_estimate as number) ?? null,
          weightNotes: (points.weight_notes as string) ?? null,
          confidence: points.confidence as "confirmed" | "estimated" | "rumor",
          lastVerified: points.last_verified as string,
          source: (points.source as string) ?? null,
        }
      : null,
    executionRules: rules
      ? {
          makerCountsForPoints: rules.maker_counts_for_points as boolean,
          takerCountsForPoints: rules.taker_counts_for_points as boolean,
          makerBoostMultiplier: (rules.maker_boost_multiplier as number) ?? 1.0,
          notes: (rules.notes as string) ?? null,
        }
      : null,
    currentFees: fees
      ? {
          makerBps: fees.maker_bps,
          takerBps: fees.taker_bps,
          effectiveFrom: new Date().toISOString(),
          sourceUrl: null,
        }
      : null,
    feeHistory: fees
      ? [{ makerBps: fees.maker_bps, takerBps: fees.taker_bps, effectiveFrom: new Date().toISOString(), sourceUrl: null }]
      : [],
    latestDistribution: null,
    markets: markets.map((m) => ({
      symbol: m.symbol,
      symbolCanonical: m.symbol_canonical,
      isActive: m.is_active,
    })),
  };
}
