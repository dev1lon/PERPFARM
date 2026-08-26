import { snapshotCacheControl } from "@/lib/cache";
import { NextResponse } from "next/server";
import { publicMessage } from "@/lib/api-error";
import { loadCheapestRoute } from "@/lib/cheapest-route";

// The answer itself is built in lib/cheapest-route.ts, because the protocol
// page renders this card on the server now and must reach the same answer the
// same way. This route stays for the browser's own refresh, and for anything
// that wants the number on its own.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    return NextResponse.json(await loadCheapestRoute(slug), {
      headers: { "Cache-Control": snapshotCacheControl() },
    });
  } catch (error) {
    return NextResponse.json({ error: publicMessage(error, "Could not load cheapest hedge") }, { status: 502 });
  }
}
