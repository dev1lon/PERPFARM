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
 * How far each side has moved from the touch, between two measured sizes.
 *
 * A straight line is right for narrow gaps and wrong for wide ones, and we know
 * where the boundary is because both were measured (leave-one-out over 682
 * production curves, /api/diagnostics/curve-error):
 *
 *   TxFlow, gaps up to 2.5x   a power fit made it WORSE -- median absolute
 *                             error 4.49 -> 9.14 bps at $10k, 1.98 -> 7.42 at
 *                             $50k. The curvature reverses sign along the book
 *                             (concave near the touch, convex deep in it) and
 *                             one exponent per segment cannot bend both ways.
 *   Variational, one 100x gap the same fit HELPED -- median bias 0.185 -> 0.039
 *                             bps. Over two decades a straight line simply
 *                             cannot follow the shape.
 *
 * So the rule follows the evidence rather than picking a side: fit
 * `displacement = a x size^k` only when the two anchors are far enough apart
 * for the shape to matter, and keep the straight line otherwise. The exponent
 * comes from the anchors themselves, so nothing is assumed about which way the
 * curve bends. Variational publishes only 1k / 100k / 1m and has no trading API
 * to ask for more (checked 2026-08-12), so that gap is not going away.
 */
const POWER_FIT_MIN_SPAN_RATIO = 10;

function interpolateDisplacement(
  leftNotional: number,
  leftDisplacement: number,
  rightNotional: number,
  rightDisplacement: number,
  notionalUsd: number,
): number {
  const wideGap = leftNotional > 0 && rightNotional >= leftNotional * POWER_FIT_MIN_SPAN_RATIO;
  // Needs two positive displacements to take logs of. The first segment starts
  // at the touch, where displacement is zero by definition, so it stays linear.
  if (wideGap && leftDisplacement > 0 && rightDisplacement > 0) {
    const exponent = Math.log(rightDisplacement / leftDisplacement) / Math.log(rightNotional / leftNotional);
    if (Number.isFinite(exponent)) return leftDisplacement * Math.pow(notionalUsd / leftNotional, exponent);
  }
  const position = (notionalUsd - leftNotional) / (rightNotional - leftNotional);
  return leftDisplacement + (rightDisplacement - leftDisplacement) * position;
}

function interpolateQuote(points: QuotePoint[], notionalUsd: number): QuotePoint | null {
  if (notionalUsd < 0 || notionalUsd > points[points.length - 1]!.notionalUsd) return null;
  if (notionalUsd <= points[0]!.notionalUsd) return points[0]!;
  const base = points[0]!;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (notionalUsd <= right.notionalUsd) {
      // Interpolate the move AWAY FROM THE TOUCH, not the raw price: that
      // displacement is the quantity with a shape worth following.
      const ask = base.ask + interpolateDisplacement(
        left.notionalUsd, left.ask - base.ask,
        right.notionalUsd, right.ask - base.ask,
        notionalUsd,
      );
      const bid = base.bid - interpolateDisplacement(
        left.notionalUsd, base.bid - left.bid,
        right.notionalUsd, base.bid - right.bid,
        notionalUsd,
      );
      return { notionalUsd, bid, ask };
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
