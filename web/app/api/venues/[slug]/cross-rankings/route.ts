import { snapshotCacheControl } from "@/lib/cache";
import { NextResponse, type NextRequest } from "next/server";
import { UserFacingError, publicMessage } from "@/lib/api-error";
import { computeCrossRankings } from "@/lib/cross-cost";
import { quantizeAccountVolumeUsd } from "@/lib/route-model";
import { isReadyVenue } from "@/lib/venue-status";

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
    // Both slugs arrive from the URL, so both are user input. Without this an
    // arbitrary venue row -- including a synthetic fixture with invented depth
    // and a negative maker fee -- could be priced and returned as a real route.
    if (!isReadyVenue(slug) || !isReadyVenue(hedge)) {
      return NextResponse.json({ error: "Routes are only published for protocols with a verified data path" }, { status: 400 });
    }
    const tradfiOnly = request.nextUrl.searchParams.get("tradfiOnly") === "true";

    const requested = request.nextUrl.searchParams.get("accountVolumeUsd");
    // CHECKED BEFORE ROUNDING. Snapping first accepted $950 as $1,000 -- under
    // the published minimum -- because the bound was tested on the rounded
    // value. The grid ($100, see quantizeAccountVolumeUsd) is there so two
    // near-identical questions share one cached answer; it must not widen the
    // range. Both bounds are multiples of the step, so a valid input survives.
    const asked = requested === null ? DEFAULT_ACCOUNT_VOLUME_USD : Number(requested);
    if (!Number.isFinite(asked) || asked < MIN_ACCOUNT_VOLUME_USD || asked > MAX_ACCOUNT_VOLUME_USD) {
      return NextResponse.json(
        { error: `Account volume must be between $${MIN_ACCOUNT_VOLUME_USD.toLocaleString("en-US")} and $${MAX_ACCOUNT_VOLUME_USD.toLocaleString("en-US")}` },
        { status: 400 },
      );
    }
    const accountVolumeUsd = quantizeAccountVolumeUsd(asked);

    const result = await computeCrossRankings(slug, hedge, accountVolumeUsd, tradfiOnly);
    if (result.bands.every((band) => band.pairs.length === 0)) {
      // Name the filter that emptied the list instead of a blank "no pairs".
      const why = Object.entries(result.drops)
        .filter(([key, count]) => key !== "considered" && count > 0)
        .map(([key, count]) => `${key}: ${count}`)
        .join(", ");
      throw new UserFacingError(
        `No liquid pairs listed on both ${slug} and ${hedge}` +
          (why ? ` (of ${result.drops.considered} shared markets — ${why})` : ""),
      );
    }
    return NextResponse.json(
      // `asOf` is the newest SNAPSHOT behind the answer, not the moment the
      // request was served -- stamping it with "now" is what let a day-old
      // book look current.
      { ...result, asOf: result.asOf ?? new Date().toISOString() },
      { headers: { "Cache-Control": snapshotCacheControl({ browser: true }) } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicMessage(error, "Could not compare these two protocols right now. Try again in a minute.") },
      { status: 502 },
    );
  }
}
