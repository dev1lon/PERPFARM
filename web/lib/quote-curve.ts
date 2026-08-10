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
 * Impact between two measured sizes, as a power law rather than a straight line.
 *
 * A book does not fill linearly. Measured on production curves (leave-one-out
 * over 682 markets): near the touch the true impact sits ABOVE the chord, so a
 * straight line understates it -- median -4.8 bps at TxFlow's $1k point, -2.0
 * bps at Variational's. Deeper in the book it flips and the chord overstates,
 * +1.6 bps at TxFlow's $50k point.
 *
 * Fitting `impact = a x size^k` through the two neighbouring measurements
 * reproduces both bends without assuming which one applies: the exponent comes
 * out of the endpoints themselves. k < 1 bows the curve above the chord, k > 1
 * below it. It still passes exactly through every measured point.
 *
 * It needs two positive impacts to take logs of, so the first segment -- which
 * starts at the touch, where impact is zero by definition -- stays linear. That
 * segment spans the smallest sizes, where the absolute error is smallest too.
 */
function interpolateDisplacement(
  leftNotional: number,
  leftDisplacement: number,
  rightNotional: number,
  rightDisplacement: number,
  notionalUsd: number,
): number {
  if (leftNotional > 0 && leftDisplacement > 0 && rightDisplacement > 0 && rightNotional > leftNotional) {
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
      // Interpolate how far each side has moved AWAY FROM THE TOUCH, not the
      // raw price: displacement is the quantity that follows a power law.
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
