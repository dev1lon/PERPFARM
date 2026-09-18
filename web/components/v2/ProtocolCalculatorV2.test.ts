import { describe, expect, it } from "vitest";
import { feeBpsLabel, selectRecommendedPair, type PairRanking, type RankingResponse } from "./ProtocolCalculatorV2";

/**
 * The recommendation must be minimal inside the category it claims.
 *
 * An OI band publishes only its cheapest TEN pairs, and the pick used to be
 * made out of those. On the checked Ondo x Variational answer that recommended
 * EWY at $7.05 while XAU -- open, TradFi, and in the same response -- cost
 * $5.09, because XAU sat outside the band's ten.
 */
const pair = (over: Partial<PairRanking> & { pair: string; cycleCostUsd: number }): PairRanking => ({
  openInterestUsd: 5_000_000,
  assetClass: "commodity",
  competitionEligible: true,
  firstLimitSide: "long",
  costRangeLowUsd: over.cycleCostUsd,
  costRangeHighUsd: over.cycleCostUsd,
  spreadCostUsd: 0,
  slippageCostUsd: 0,
  feeCostUsd: 0,
  fundingUsd: 0,
  closedVenues: [],
  ...over,
});

const bandsOf = (pairs: PairRanking[], oiRangeUsd?: [number, number]): RankingResponse["bands"] => [
  { key: "medium", oiRangeUsd, pairs },
];

describe("selectRecommendedPair", () => {
  const cheapOutsideTheBand = pair({ pair: "XAU", cycleCostUsd: 5.09 });
  const dearInsideTheBand = pair({ pair: "EWY", cycleCostUsd: 7.05 });

  it("picks the cheapest of EVERY pair, not of the band's ten", () => {
    const [best] = selectRecommendedPair(
      bandsOf([dearInsideTheBand]),
      "ondo",
      [dearInsideTheBand, cheapOutsideTheBand],
    );
    expect(best?.pair).toBe("XAU");
  });

  it("still answers from the bands when the response carries no full list", () => {
    const [best] = selectRecommendedPair(bandsOf([dearInsideTheBand]), "ondo");
    expect(best?.pair).toBe("EWY");
  });

  it("rebuilds a Medium-OI strategy over every pair in that OI span", () => {
    // Variational's policy is Medium OI. The cheap pair belongs to the span the
    // API reports for the band, so it must be eligible even though the band's
    // own ten did not carry it; the cheapest one outside the span stays out.
    const cheapInSpan = pair({ pair: "XAU", cycleCostUsd: 5.09, openInterestUsd: 4_000_000 });
    const cheapestButTooBig = pair({ pair: "BTC", cycleCostUsd: 1.0, openInterestUsd: 900_000_000 });
    const [best, rule] = selectRecommendedPair(
      bandsOf([dearInsideTheBand], [1_000_000, 10_000_000]),
      "variational",
      [dearInsideTheBand, cheapInSpan, cheapestButTooBig],
    );
    expect(best?.pair).toBe("XAU");
    expect(rule).toBe("medium-tradfi");
  });

  it("recommends a swap when the swap is the cheapest thing in the answer", () => {
    // A swap is another way to hold the same exposure. Filtering swaps out of
    // the pick meant a cheaper swap route sat in the table under a dearer perp
    // recommendation; forcing one on Variational's page picked by open
    // interest instead of by cost. Both exceptions are gone.
    const swap = pair({ pair: "XAUS", cycleCostUsd: 22.65, openInterestUsd: 40_000_000 });
    const perp = pair({ pair: "XAU", cycleCostUsd: 35.97 });
    expect(selectRecommendedPair(bandsOf([perp]), "qfex", [perp, swap])[0]?.pair).toBe("XAUS");
  });

  it("does not prefer a swap that costs more", () => {
    const swap = pair({ pair: "XAUS", cycleCostUsd: 40.0, openInterestUsd: 1_000 });
    const perp = pair({ pair: "XAU", cycleCostUsd: 30.0 });
    // Least open interest used to win this on Variational's page.
    expect(selectRecommendedPair(bandsOf([perp, swap]), "variational", [perp, swap])[0]?.pair).toBe("XAU");
  });

  it("never recommends a market that is not quoting while an open one exists", () => {
    const closed = pair({ pair: "XAU", cycleCostUsd: 1.0, closedVenues: ["ondo"] });
    const [best] = selectRecommendedPair(bandsOf([dearInsideTheBand]), "ondo", [closed, dearInsideTheBand]);
    expect(best?.pair).toBe("EWY");
  });
});

/**
 * The rate each row was charged at, read back out of its own money. Two pairs
 * on the same two venues pay different fees whenever a venue prices by
 * instrument class, and the row has to be able to say so.
 */
describe("feeBpsLabel", () => {
  it("reads the rate back out of the fee and the volume", () => {
    // Entropy maker 3 + QFEX single-stock taker 10 = 13 bps of $20,000.
    expect(feeBpsLabel(26, 20_000)).toBe("13 bps");
    // The same route at ten times the size is the same rate.
    expect(feeBpsLabel(260, 200_000)).toBe("13 bps");
  });

  it("keeps a fractional rate, and drops a trailing zero", () => {
    // Entropy maker 3 + a discounted 1.5 bps taker.
    expect(feeBpsLabel(9, 20_000)).toBe("4.5 bps");
    expect(feeBpsLabel(16, 20_000)).toBe("8 bps");
  });

  it("says nothing where there is nothing to state", () => {
    expect(feeBpsLabel(0, 20_000)).toBeUndefined();
    expect(feeBpsLabel(26, 0)).toBeUndefined();
    expect(feeBpsLabel(null, 20_000)).toBeUndefined();
    expect(feeBpsLabel(26, undefined)).toBeUndefined();
  });
});
