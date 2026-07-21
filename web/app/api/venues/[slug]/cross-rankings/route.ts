import { NextResponse, type NextRequest } from "next/server";
import { computeCrossRankings } from "@/lib/cross-cost";

export const dynamic = "force-dynamic";

const DEFAULT_ACCOUNT_VOLUME_USD = 100_000;
const MIN_ACCOUNT_VOLUME_USD = 1_000;
const MAX_ACCOUNT_VOLUME_USD = 200_000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const { slug } = await params;
    const hedge = request.nextUrl.searchParams.get("hedge");
    if (!hedge) return NextResponse.json({ error: "hedge venue is required" }, { status: 400 });
    if (hedge === slug) return NextResponse.json({ error: "hedge venue must differ from the home venue" }, { status: 400 });

    const requested = request.nextUrl.searchParams.get("accountVolumeUsd");
    const accountVolumeUsd = requested === null ? DEFAULT_ACCOUNT_VOLUME_USD : Number(requested);
    if (!Number.isFinite(accountVolumeUsd) || accountVolumeUsd < MIN_ACCOUNT_VOLUME_USD || accountVolumeUsd > MAX_ACCOUNT_VOLUME_USD) {
      return NextResponse.json(
        { error: `Account volume must be between $${MIN_ACCOUNT_VOLUME_USD.toLocaleString("en-US")} and $${MAX_ACCOUNT_VOLUME_USD.toLocaleString("en-US")}` },
        { status: 400 },
      );
    }

    const result = await computeCrossRankings(slug, hedge, accountVolumeUsd);
    if (result.bands.every((band) => band.pairs.length === 0)) {
      throw new Error(`No liquid pairs listed on both ${slug} and ${hedge}`);
    }
    return NextResponse.json(
      { asOf: new Date().toISOString(), ...result },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load cross-protocol data" },
      { status: 502 },
    );
  }
}
