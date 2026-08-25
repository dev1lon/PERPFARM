import { NextResponse } from "next/server";

/**
 * BTC and ETH spot, for the footer ticker.
 *
 * The footer used to call CoinGecko from the visitor's own browser, every
 * sixty seconds, with `cache: "no-store"` -- so an open tab spent sixty
 * third-party requests an hour, and CoinGecko's keyless limit is per IP, which
 * means a shared or corporate address could be rate-limited into a dead ticker
 * by other people entirely.
 *
 * Asking through here instead makes it one upstream call a minute for
 * everybody, served from the edge cache. The stale window is deliberately much
 * longer than the fresh one: a price a few minutes old is a fine thing to show
 * in a footer, and far better than an em dash while CoinGecko is having a
 * moment.
 */
export const dynamic = "force-dynamic";

const UPSTREAM_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd";
const FRESH_SECONDS = 60;
const STALE_SECONDS = 600;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  try {
    const response = await fetch(UPSTREAM_URL, {
      next: { revalidate: FRESH_SECONDS },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    const payload: unknown = await response.json();
    const bitcoin = isRecord(payload) && isRecord(payload.bitcoin) ? payload.bitcoin : null;
    const ethereum = isRecord(payload) && isRecord(payload.ethereum) ? payload.ethereum : null;
    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        btc: bitcoin ? asNumber(bitcoin.usd) : null,
        eth: ethereum ? asNumber(ethereum.usd) : null,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=0, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Could not load spot prices" }, { status: 502 });
  }
}
