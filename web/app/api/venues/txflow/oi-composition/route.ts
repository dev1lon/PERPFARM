import { NextResponse } from "next/server";

// TxFlow exposes live per-market OI through its trading application. A
// category composition history needs at least two completed hourly snapshots,
// which we intentionally do not fabricate before the worker has collected it.
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json({
    asOf: new Date().toISOString(),
    days: 0,
    latest: null,
    series: [],
  });
}
