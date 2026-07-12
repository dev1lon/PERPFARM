import { type NextRequest, NextResponse } from "next/server";
import { getLatestRouteScores, type RouteSort } from "@/lib/data-source";

// DEPRECATED: the analyst routes-table page this backed was removed in
// favor of the venue-wizard IA (see /[venueSlug] and /api/venues/[slug]/recipes).
// Left in place as a public JSON endpoint, not currently linked from any page.

// Raw DB access, not a static fetch -- must render per-request, never at build time.
export const dynamic = "force-dynamic";

const VALID_SORTS: RouteSort[] = ["cost_per_point", "points_roi", "funding", "season_ending"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sortParam = params.get("sort");
  const sort = VALID_SORTS.includes(sortParam as RouteSort) ? (sortParam as RouteSort) : undefined;
  const venue = params.get("venue") ?? undefined;
  const pair = params.get("pair") ?? undefined;
  const hideRumor = params.get("hideRumor") === "true";

  const routes = await getLatestRouteScores({ sort, venue, pair, hideRumor });

  return NextResponse.json(
    { routes },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300" } }
  );
}
