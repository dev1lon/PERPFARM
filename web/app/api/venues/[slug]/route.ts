import { NextResponse } from "next/server";
import { getVenueDetail } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenueDetail(slug);

  if (!venue) {
    return NextResponse.json({ error: "venue not found" }, { status: 404 });
  }

  return NextResponse.json(venue, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300" },
  });
}
