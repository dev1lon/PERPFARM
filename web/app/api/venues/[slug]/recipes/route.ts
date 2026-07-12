import { NextResponse, type NextRequest } from "next/server";
import { getRoutesForVenuePair } from "@/lib/data-source";
import { buildRecipesResponse } from "@/lib/recipes";
import type { Strategy } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STRATEGIES: Strategy[] = ["cheapest", "max_points", "balanced"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;

  const hedgeParam = searchParams.get("hedge");
  const hedge = !hedgeParam || hedgeParam === "self" ? slug : hedgeParam;

  const strategyParam = searchParams.get("strategy");
  const strategy = VALID_STRATEGIES.includes(strategyParam as Strategy)
    ? (strategyParam as Strategy)
    : "cheapest";

  const notionalParam = Number(searchParams.get("notional"));
  const notionalUsd = Number.isFinite(notionalParam) && notionalParam > 0 ? notionalParam : 10_000;

  const holdHoursParam = Number(searchParams.get("holdHours"));
  const holdHours = Number.isFinite(holdHoursParam) && holdHoursParam > 0 ? holdHoursParam : 24;

  const routes = await getRoutesForVenuePair(slug, hedge);
  const response = buildRecipesResponse(slug, hedgeParam ?? "self", routes, strategy, {
    notionalUsd,
    holdHours,
  });

  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300" },
  });
}
