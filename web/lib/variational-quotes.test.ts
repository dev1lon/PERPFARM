import { describe, expect, it } from "vitest";
import { chooseFirstLimitSide } from "./variational-quotes";

describe("Variational LIMIT-side selection", () => {
  it("places LIMIT on LONG when the remaining MARKET sells are cheaper", () => {
    const result = chooseFirstLimitSide({
      notional: 50_000,
      mark: 100,
      base: [99, 101],
      oneK: [98.99, 101.02],
      hundredK: [98.9, 102],
    });
    expect(result.firstLimitSide).toBe("long");
    expect(result.marketImpactBps).toBeCloseTo(5.4545);
  });

  it("places LIMIT on SHORT when the remaining MARKET buys are cheaper", () => {
    const result = chooseFirstLimitSide({
      notional: 100_000,
      mark: 100,
      base: [99, 101],
      oneK: [98.9, 101.01],
      hundredK: [97, 101.1],
    });
    expect(result.firstLimitSide).toBe("short");
    expect(result.marketImpactBps).toBeCloseTo(10);
  });
});
