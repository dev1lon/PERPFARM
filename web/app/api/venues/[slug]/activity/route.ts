import { NextResponse } from "next/server";
import { snapshotCacheControl } from "@/lib/cache";
import { publicMessage } from "@/lib/api-error";
import { loadTxflowActivity } from "@/lib/activity/txflow";
import { loadVariationalActivity } from "@/lib/activity/variational";
import type { ActivityResponse } from "@/lib/activity/types";

/**
 * Market-activity series for one protocol.
 *
 * Unlike the ranking endpoints, the SOURCES here genuinely differ per protocol:
 * Variational publishes a stats feed and is covered by DefiLlama, TxFlow
 * publishes an official Dune dashboard. So the loaders stay separate, in
 * lib/activity/, while the URL, the response shape and the error handling are
 * defined once -- which is what the chart component actually depends on.
 */
/**
 * `export const revalidate` was here and did nothing: this route reads a
 * dynamic `[slug]`, so Next never prerenders it, and every visitor rebuilt the
 * whole chart. The header below is what actually caches it -- at the edge,
 * until the next hourly collection, which is the only thing that can change it.
 */
export const dynamic = "force-dynamic";

const LOADERS: Record<string, () => Promise<ActivityResponse>> = {
  variational: loadVariationalActivity,
  txflow: loadTxflowActivity,
};

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const load = LOADERS[slug];
  if (!load) {
    return NextResponse.json({ error: "No activity data for this protocol" }, { status: 404 });
  }

  try {
    return NextResponse.json(await load(), {
      headers: { "Cache-Control": snapshotCacheControl() },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicMessage(error, "Could not load activity data") },
      { status: 502 },
    );
  }
}
