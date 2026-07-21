/**
 * Dev/demo data source: venue listing + detail from data/fixtures/*.json +
 * data/manual/*.yaml, no Postgres. lib/data-source.ts uses this ONLY in dev
 * (no DATABASE_URL) so `npm run dev` works against the two synthetic fixture
 * venues without local infrastructure. No route/points computation lives here
 * anymore -- the product computes execution cost live, point price is manual.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import type { VenueDetail, VenueSummary } from "./types";

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

function loadFees(slug: string): { maker_bps: number; taker_bps: number } | null {
  const feesPath = path.join(FIXTURES_DIR, slug, "fees.json");
  return fs.existsSync(feesPath) ? readJson(feesPath) : null;
}

function loadManualByVenue(filename: string, key: string): Map<string, Record<string, unknown>> {
  const rows = readYamlList(path.join(MANUAL_DIR, filename), key);
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows as Record<string, unknown>[]) map.set(row.venue as string, row);
  return map;
}

function loadOverrides(): Map<string, string> {
  const rows = readYamlList(path.join(MANUAL_DIR, "symbol_overrides.yaml"), "overrides");
  const map = new Map<string, string>();
  for (const row of rows) map.set(`${row.venue}::${row.symbol}`, row.symbol_canonical);
  return map;
}

function pairsFor(slug: string, overrides: Map<string, string>): string[] {
  return loadMarkets(slug).map((m) => overrides.get(`${slug}::${m.symbol}`) ?? m.symbol_canonical);
}

export function fixtureVenues(): VenueSummary[] {
  const meta = loadManualByVenue("venue_meta.yaml", "venue_meta");
  const overrides = loadOverrides();
  return FIXTURE_VENUE_SLUGS.map((slug) => {
    const fees = loadFees(slug);
    const m = meta.get(slug);
    return {
      slug,
      name: VENUE_NAMES[slug],
      apiStatus: "stub" as const,
      seasonName: (m?.season_name as string) ?? null,
      seasonEndDate: (m?.season_end_date as string) ?? null,
      makerBps: fees?.maker_bps ?? null,
      takerBps: fees?.taker_bps ?? null,
      pairs: pairsFor(slug, overrides),
    };
  });
}

export function fixtureVenueDetail(slug: string): VenueDetail | null {
  if (!FIXTURE_VENUE_SLUGS.includes(slug as (typeof FIXTURE_VENUE_SLUGS)[number])) return null;
  const fees = loadFees(slug);
  const meta = loadManualByVenue("venue_meta.yaml", "venue_meta").get(slug);
  const rules = loadManualByVenue("execution_rules.yaml", "execution_rules").get(slug);
  const markets = loadMarkets(slug);
  const feeEntry = fees
    ? { makerBps: fees.maker_bps, takerBps: fees.taker_bps, effectiveFrom: new Date().toISOString(), sourceUrl: null }
    : null;

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
    executionRules: rules
      ? {
          makerCountsForPoints: rules.maker_counts_for_points as boolean,
          takerCountsForPoints: rules.taker_counts_for_points as boolean,
          makerBoostMultiplier: (rules.maker_boost_multiplier as number) ?? 1.0,
          notes: (rules.notes as string) ?? null,
        }
      : null,
    currentFees: feeEntry,
    feeHistory: feeEntry ? [feeEntry] : [],
    markets: markets.map((m) => ({ symbol: m.symbol, symbolCanonical: m.symbol_canonical, isActive: m.is_active })),
  };
}
