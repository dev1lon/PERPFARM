import { NextResponse } from "next/server";
import { getVenues } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const venues = await getVenues();
  return NextResponse.json(
    { venues },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300" } }
  );
}
