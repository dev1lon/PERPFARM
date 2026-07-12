import { NextResponse } from "next/server";
import { getRouteDetail } from "@/lib/data-source";

// DEPRECATED: backed the removed /routes/[...] detail page. Left in place as
// a public JSON endpoint (funding/spread history), not linked from any page.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pair: string; longVenue: string; shortVenue: string }> }
) {
  const { pair, longVenue, shortVenue } = await params;
  const detail = await getRouteDetail(pair, longVenue, shortVenue);

  if (!detail) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }

  return NextResponse.json(detail, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300" },
  });
}
