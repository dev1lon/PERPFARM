import { NextResponse } from "next/server";
import { FDV_REVALIDATE_SECONDS, loadFdvMarkets } from "@/lib/fdv-market";

// The FDV panel has no local history. Cache Polymarket's current market view
// at the edge for one hour instead of storing duplicate odds in Postgres.
//
// The reading itself is in lib/fdv-market.ts: the protocol page renders this
// panel on the server now, and both paths must produce the same answer.
//
// A LITERAL, not FDV_REVALIDATE_SECONDS. Next reads a route's segment config by
// static analysis, before any of this file's imports exist, so a constant from
// another module is not a value it can see -- it fails the production build
// with "Unknown identifier". The two are tied together by a test instead.
export const revalidate = 3600;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const markets = await loadFdvMarkets(slug);
    if (markets === null) {
      return NextResponse.json({ error: "No FDV market for this protocol" }, { status: 404 });
    }
    return NextResponse.json(markets, {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${FDV_REVALIDATE_SECONDS}, stale-while-revalidate=${FDV_REVALIDATE_SECONDS}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load Polymarket FDV markets" }, { status: 502 });
  }
}
