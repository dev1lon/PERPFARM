export type QuotePair = [bid: number, ask: number];
export type FirstLimitSide = "long" | "short";

function interpolateQuote(
  notional: number,
  base: QuotePair,
  oneK: QuotePair,
  hundredK: QuotePair,
): QuotePair {
  if (notional <= 1_000) {
    const t = Math.max(0, notional) / 1_000;
    return [base[0] + (oneK[0] - base[0]) * t, base[1] + (oneK[1] - base[1]) * t];
  }
  const t = (Math.min(notional, 100_000) - 1_000) / 99_000;
  return [oneK[0] + (hundredK[0] - oneK[0]) * t, oneK[1] + (hundredK[1] - oneK[1]) * t];
}

/**
 * LIMIT LONG first leaves two MARKET sells; LIMIT SHORT first leaves two
 * MARKET buys. Return the cheaper live market direction and its quote impact.
 */
export function chooseFirstLimitSide({
  notional,
  mark,
  base,
  oneK,
  hundredK,
}: {
  notional: number;
  mark: number;
  base: QuotePair;
  oneK: QuotePair;
  hundredK: QuotePair;
}): { firstLimitSide: FirstLimitSide; marketImpactBps: number } {
  const quote = interpolateQuote(notional, base, oneK, hundredK);
  const buyImpactBps = Math.max(quote[1] - base[1], 0) / mark * 10_000;
  const sellImpactBps = Math.max(base[0] - quote[0], 0) / mark * 10_000;
  return sellImpactBps <= buyImpactBps
    ? { firstLimitSide: "long", marketImpactBps: sellImpactBps }
    : { firstLimitSide: "short", marketImpactBps: buyImpactBps };
}
