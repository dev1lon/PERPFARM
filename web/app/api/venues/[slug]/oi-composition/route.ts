import { snapshotCacheControl } from "@/lib/cache";
import { NextResponse, type NextRequest } from "next/server";
import { publicMessage } from "@/lib/api-error";
import { getPool } from "@/lib/db";
import { loadOiComposition } from "@/lib/oi-composition";
import { displayedOpenInterestUsd } from "@/lib/route-model";
import { TRADFI_TICKER_LIST } from "@/lib/tradfi";
import { isReadyVenue } from "@/lib/venue-status";

/**
 * Daily open-interest composition for one protocol, plus the two audit modes
 * that belong to an endpoint rather than to a page.
 *
 * The series itself is built in lib/oi-composition.ts, which the protocol page
 * also calls when it renders this chart on the server.
 */
export const dynamic = "force-dynamic";

/** Latest reading per market, so a share can be traced back to the tickers. */
async function loadLatestByPair(slug: string): Promise<{ pair: string; oi: string | number | null }[]> {
  const { rows } = await getPool().query<{ pair: string; oi: string | number | null }>(
    `WITH v AS (SELECT id FROM venues WHERE slug = $1)
     SELECT DISTINCT ON (s.market_id) m.symbol_canonical AS pair, s.open_interest_usd AS oi
     FROM volume_snapshots s
     JOIN markets m ON m.id = s.market_id
     WHERE m.venue_id = (SELECT id FROM v)
       AND s.open_interest_usd IS NOT NULL
       AND s.ts >= now() - interval '48 hours'
     ORDER BY s.market_id, s.ts DESC`,
    [slug],
  );
  return rows;
}

/**
 * Instrument names for everything NOT classified as TradFi, read from the
 * venue's own feed. Names identify the asset class ("Apple Inc.", "Brent Oil"),
 * so this is how lib/tradfi.ts gets refreshed when new markets list.
 *
 * Variational only: the list is maintained against its stats feed, and no other
 * protocol publishes instrument names the same way. Kept through the merge of
 * the per-protocol routes because it is the only way to refresh that list.
 */
const VARIATIONAL_STATS_URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

async function unclassifiedVariationalMarkets(): Promise<string[]> {
  const response = await fetch(VARIATIONAL_STATS_URL, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });
  const payload = (await response.json()) as { listings?: Record<string, unknown>[] };
  return (payload.listings ?? [])
    .map((listing) => ({ ticker: String(listing.ticker ?? ""), name: String(listing.name ?? "") }))
    .filter((listing) => !TRADFI_TICKER_LIST.includes(listing.ticker))
    .sort((left, right) => left.ticker.localeCompare(right.ticker))
    .map((listing) => `${listing.ticker}=${listing.name}`);
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isReadyVenue(slug)) {
    return NextResponse.json({ error: "No open-interest history for this protocol" }, { status: 404 });
  }

  try {
    if (request.nextUrl.searchParams.get("review") === "1" && slug === "variational") {
      const unclassified = await unclassifiedVariationalMarkets();
      return NextResponse.json({ count: unclassified.length, unclassified });
    }

    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

    // `?detail=1` lists every market with its category -- how the BTC/TradFi/
    // other split gets audited against third-party dashboards.
    if (request.nextUrl.searchParams.get("detail") === "1") {
      const rows = await loadLatestByPair(slug);
      const markets = rows
        .map((row) => ({
          pair: row.pair,
          openInterestUsd: displayedOpenInterestUsd(num(row.oi), slug),
          category: row.pair === "BTC" ? "btc" : TRADFI_TICKER_LIST.includes(row.pair) ? "tradfi" : "other",
        }))
        .sort((a, b) => b.openInterestUsd - a.openInterestUsd);
      return NextResponse.json({ count: markets.length, markets });
    }

    return NextResponse.json(
      await loadOiComposition(slug),
      // Held until shortly after the next hourly collection, not until the next
      // day: the series is daily, but its LAST point is today's open interest,
      // and open interest is the one figure on this page that is worth seeing
      // move during the day.
      { headers: { "Cache-Control": snapshotCacheControl() } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicMessage(error, "Could not load open-interest composition") },
      { status: 502 },
    );
  }
}
