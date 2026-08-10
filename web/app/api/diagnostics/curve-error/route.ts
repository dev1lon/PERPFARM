import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { parseCurve } from "@/lib/quote-curve";

/**
 * TEMPORARY diagnostic: how wrong is linear interpolation between the stored
 * quote-curve points?
 *
 * Leave-one-out on real production curves. For every interior point we drop it,
 * predict its bid/ask by interpolating linearly between its two neighbours, and
 * compare the predicted impact with the impact actually recorded there.
 *
 *   error > 0  linear interpolation OVERSTATES impact  (curve is convex)
 *   error < 0  linear interpolation UNDERSTATES impact (curve is concave)
 *
 * This exists to settle that question with data instead of intuition, and to
 * show which gap in the ladder is worth splitting. Delete once answered.
 */
export const dynamic = "force-dynamic";

type Row = { pair: string; quote_curve_json: unknown };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)]! + sorted[Math.ceil(mid)]!) / 2;
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const venue = request.nextUrl.searchParams.get("venue") ?? "txflow";
    const { rows } = await getPool().query<Row>(
      `SELECT DISTINCT ON (b.market_id) m.symbol_canonical AS pair,
              to_jsonb(b) -> 'quote_curve_json' AS quote_curve_json
       FROM book_snapshots b
       JOIN markets m ON m.id = b.market_id
       JOIN venues v ON v.id = m.venue_id
       WHERE v.slug = $1 AND m.is_active = true AND b.ts >= now() - interval '6 hours'
       ORDER BY b.market_id, b.ts DESC`,
      [venue],
    );

    // errorBps per dropped notional, across every market.
    const byNotional = new Map<number, { linear: number[]; power: number[] }>();
    let curvesSeen = 0;
    const sizesSeen = new Set<number>();

    for (const row of rows) {
      const curve = parseCurve(row.quote_curve_json);
      if (curve === null || curve.points.length < 3) continue;
      curvesSeen++;
      const { referencePrice, points } = curve;
      for (const p of points) sizesSeen.add(p.notionalUsd);
      const base = points[0]!;

      for (let i = 1; i < points.length - 1; i++) {
        const left = points[i - 1]!;
        const target = points[i]!;
        const right = points[i + 1]!;
        const span = right.notionalUsd - left.notionalUsd;
        if (span <= 0) continue;
        const position = (target.notionalUsd - left.notionalUsd) / span;
        const linearAsk = left.ask + (right.ask - left.ask) * position;
        const linearBid = left.bid + (right.bid - left.bid) * position;

        // The same two neighbours fitted as impact = a x size^k, which is what
        // the model now uses. Reported side by side so the change is measured,
        // not asserted.
        const power = (ln: number, ld: number, rn: number, rd: number) => {
          if (ln > 0 && ld > 0 && rd > 0 && rn > ln) {
            const k = Math.log(rd / ld) / Math.log(rn / ln);
            if (Number.isFinite(k)) return ld * Math.pow(target.notionalUsd / ln, k);
          }
          return ld + (rd - ld) * position;
        };
        const powerAsk = base.ask + power(left.notionalUsd, left.ask - base.ask, right.notionalUsd, right.ask - base.ask);
        const powerBid = base.bid - power(left.notionalUsd, base.bid - left.bid, right.notionalUsd, base.bid - right.bid);

        // Impact of one crossing leg, cheaper side, exactly as the model reads it.
        const impact = (bid: number, ask: number) =>
          Math.min(Math.max(ask - base.ask, 0), Math.max(base.bid - bid, 0)) / referencePrice * 10_000;
        const actualBps = impact(target.bid, target.ask);
        const bucket = byNotional.get(target.notionalUsd) ?? { linear: [], power: [] };
        bucket.linear.push(impact(linearBid, linearAsk) - actualBps);
        bucket.power.push(impact(powerBid, powerAsk) - actualBps);
        byNotional.set(target.notionalUsd, bucket);
      }
    }

    const perSize = [...byNotional.entries()]
      .sort(([a], [b]) => a - b)
      .map(([notionalUsd, errors]) => {
        const summarise = (values: number[]) => ({
          medianErrorBps: Number((median(values) ?? 0).toFixed(4)),
          medianAbsErrorBps: Number((median(values.map(Math.abs)) ?? 0).toFixed(4)),
          worstOverstateBps: Number(Math.max(0, ...values).toFixed(4)),
          worstUnderstateBps: Number(Math.min(0, ...values).toFixed(4)),
        });
        return {
          notionalUsd,
          samples: errors.linear.length,
          linear: summarise(errors.linear),
          power: summarise(errors.power),
        };
      });

    return NextResponse.json({
      venue,
      curvesSeen,
      ladder: [...sizesSeen].sort((a, b) => a - b),
      note: "errorBps = predicted(by linear interpolation from neighbours) - actual. >0 means linear OVERSTATES impact.",
      perSize,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "curve check failed" }, { status: 502 });
  }
}
