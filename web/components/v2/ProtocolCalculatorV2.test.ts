import { describe, expect, it } from "vitest";
import { selectRecommendedPair, type PairRanking, type RankingResponse } from "./ProtocolCalculatorV2";

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

  it("never recommends a market that is not quoting while an open one exists", () => {
    const closed = pair({ pair: "XAU", cycleCostUsd: 1.0, closedVenues: ["ondo"] });
    const [best] = selectRecommendedPair(bandsOf([dearInsideTheBand]), "ondo", [closed, dearInsideTheBand]);
    expect(best?.pair).toBe("EWY");
  });
});
