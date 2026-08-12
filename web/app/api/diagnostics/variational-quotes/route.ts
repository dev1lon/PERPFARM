import { NextResponse, type NextRequest } from "next/server";

/**
 * TEMPORARY diagnostic: which sizes does Variational actually publish?
 *
 * We read `size_1k / size_100k / size_1m` and interpolate everything between,
 * which leaves a 100x hole. An external tool matches us exactly at $100k (a
 * published point) but differs 34% at $10k (an interpolated one) -- as if it
 * had a real quote there. This dumps the untouched `quotes` object so the
 * question is settled by the feed rather than by inference. Delete once
 * answered.
 */
export const dynamic = "force-dynamic";

const STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

export async function GET(request: NextRequest) {
  try {
    const ticker = (request.nextUrl.searchParams.get("ticker") ?? "BTC").toUpperCase();
    const response = await fetch(STATS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`Variational stats returned ${response.status}`);
    const payload = (await response.json()) as { listings?: unknown };
    const listings = Array.isArray(payload.listings) ? payload.listings : [];

    // Every distinct quote key across the whole feed, so a size that exists on
    // only some markets is not missed by sampling one.
    const keysSeen = new Map<string, number>();
    let sample: unknown = null;
    for (const listing of listings) {
      if (typeof listing !== "object" || listing === null) continue;
      const row = listing as Record<string, unknown>;
      const quotes = row.quotes;
      if (typeof quotes !== "object" || quotes === null) continue;
      for (const key of Object.keys(quotes)) keysSeen.set(key, (keysSeen.get(key) ?? 0) + 1);
      if (row.ticker === ticker) sample = { ticker: row.ticker, markPrice: row.mark_price, quotes };
    }

    return NextResponse.json({
      listings: listings.length,
      quoteKeys: [...keysSeen.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, markets: count })),
      sample,
      note: "quoteKeys lists every size the public feed publishes. If it is only 1k/100k/1m, the gap cannot be closed from this endpoint.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "quote check failed" }, { status: 502 });
  }
}
