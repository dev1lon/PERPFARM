export type QuoteCurveImpactMode = "average" | "cheapest";
export type FirstLimitSide = "long" | "short";

type QuotePoint = { notionalUsd: number; bid: number; ask: number };

function asNumber(value: unknown): number | null {
  const valueAsNumber = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(valueAsNumber) ? valueAsNumber : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseCurve(value: unknown): { referencePrice: number; points: QuotePoint[] } | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(raw) || !Array.isArray(raw.points)) return null;
  const referencePrice = asNumber(raw.reference_price);
  if (referencePrice === null || referencePrice <= 0) return null;

  const byNotional = new Map<number, QuotePoint>();
  for (const point of raw.points) {
    if (!isRecord(point)) continue;
    const notionalUsd = asNumber(point.notional_usd);
    const bid = asNumber(point.bid);
    const ask = asNumber(point.ask);
    if (notionalUsd === null || bid === null || ask === null || notionalUsd < 0 || bid <= 0 || ask <= 0) continue;
    byNotional.set(notionalUsd, { notionalUsd, bid, ask });
  }
  const points = [...byNotional.values()].sort((left, right) => left.notionalUsd - right.notionalUsd);
  return points.length >= 2 && points[0]?.notionalUsd === 0 ? { referencePrice, points } : null;
}

/**
 * Linear interpolation between the two neighbouring measured sizes.
 *
 * A power-law fit (`impact = a x size^k`) was tried here and MEASURED against
 * production curves with leave-one-out, because the straight line is known to
 * miss: it understates impact near the touch and overstates it deep in the
 * book. The fit lost. On TxFlow's order book the median absolute error roughly
 * doubled -- 4.49 -> 9.14 bps at the $10k point, 1.98 -> 7.42 bps at $50k --
 * because the curvature reverses sign along the book, and a single exponent per
 * segment cannot bend both ways. It helped only on Variational's widest span
 * (median bias 0.185 -> 0.039 bps, n=11), which is not enough to pay for the
 * regression everywhere else.
 *
 * The real fix is narrower spans, not a cleverer curve between wide ones: see
 * `_QUOTE_BUCKETS` in worker/perpfarm/adapters/txflow.py. Verify any future
 * attempt with /api/diagnostics/curve-error before shipping it.
 */
function interpolateQuote(points: QuotePoint[], notionalUsd: number): QuotePoint | null {
  if (notionalUsd < 0 || notionalUsd > points[points.length - 1]!.notionalUsd) return null;
  if (notionalUsd <= points[0]!.notionalUsd) return points[0]!;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (notionalUsd <= right.notionalUsd) {
      const position = (notionalUsd - left.notionalUsd) / (right.notionalUsd - left.notionalUsd);
      return {
        notionalUsd,
        bid: left.bid + (right.bid - left.bid) * position,
        ask: left.ask + (right.ask - left.ask) * position,
      };
    }
  }
  return null;
}

function sideImpactsBps(
  value: unknown,
  notionalUsd: number,
): { buyImpactBps: number; sellImpactBps: number } | null {
  const curve = parseCurve(value);
  if (curve === null) return null;
  const quote = interpolateQuote(curve.points, notionalUsd);
  if (quote === null) return null;
  const base = curve.points[0]!;
  return {
    buyImpactBps: (Math.max(quote.ask - base.ask, 0) / curve.referencePrice) * 10_000,
    sellImpactBps: (Math.max(base.bid - quote.bid, 0) / curve.referencePrice) * 10_000,
  };
}

/**
 * Returns execution impact beyond the base/touch quote for any fill size.
 * It uses only native venue anchors stored in a snapshot. `cheapest` mirrors
 * a same-protocol hedge where the first LIMIT order leaves the cheaper MARKET
 * direction for the two market fills; `average` is direction-neutral.
 */
export function quoteCurveImpactBps(
  value: unknown,
  notionalUsd: number,
  mode: QuoteCurveImpactMode = "average",
): number | null {
  const impacts = sideImpactsBps(value, notionalUsd);
  if (impacts === null) return null;
  return mode === "cheapest"
    ? Math.min(impacts.buyImpactBps, impacts.sellImpactBps)
    : (impacts.buyImpactBps + impacts.sellImpactBps) / 2;
}

/**
 * On a same-venue hedge, the first passive order determines the direction of
 * the two MARKET fills that remain. This exposes that live choice while still
 * reading the venue's native quote points.
 */
export function quoteCurveMarketSide(
  value: unknown,
  notionalUsd: number,
): { firstLimitSide: FirstLimitSide; marketImpactBps: number } | null {
  const impacts = sideImpactsBps(value, notionalUsd);
  if (impacts === null) return null;
  return impacts.sellImpactBps <= impacts.buyImpactBps
    ? { firstLimitSide: "long", marketImpactBps: impacts.sellImpactBps }
    : { firstLimitSide: "short", marketImpactBps: impacts.buyImpactBps };
}
