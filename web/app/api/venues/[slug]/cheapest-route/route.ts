import { NextResponse } from "next/server";
import { cheapestPartner } from "@/lib/cross-cost";

// The perp page's "cheapest hedge" window shows only the partner protocol
// name. Cached an hour (snapshots refresh hourly) at a fixed reference volume,
// since the window has no volume input.
export const revalidate = 3600;

const REFERENCE_VOLUME_USD = 100_000;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const { slug } = await params;
    const best = await cheapestPartner(slug, REFERENCE_VOLUME_USD);
    return NextResponse.json(
      { slug, partnerSlug: best?.partnerSlug ?? null },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not compute cheapest hedge" },
      { status: 502 },
    );
  }
}
