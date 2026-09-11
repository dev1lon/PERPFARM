import { describe, expect, it } from "vitest";
import { instrumentClass, venueTicker } from "./tradfi";

describe("venueTicker", () => {
  it("strips feed plumbing and keeps the name the venue prints", () => {
    expect(venueTicker("xyz:GOLD")).toBe("GOLD");
    expect(venueTicker("io:ANTH")).toBe("ANTH");
    expect(venueTicker("US500")).toBe("US500");
    expect(venueTicker("kPEPE-PERP_USDT0")).toBe("kPEPE");
    expect(venueTicker("AUD/USDT-P")).toBe("AUD");
    expect(venueTicker("AAVE/USDC")).toBe("AAVE");
    expect(venueTicker("1000BONK-USDC")).toBe("1000BONK");
    expect(venueTicker("BRK.B-USD")).toBe("BRK.B");
  });

  it("keeps a quote currency that is part of the market's identity", () => {
    // QFEX quotes SAMSUNG in won: a different market from the dollar share.
    expect(venueTicker("SAMSUNG-KRW")).toBe("SAMSUNG-KRW");
  });

  it("names a swap the way Variational's interface does", () => {
    expect(venueTicker("XAUS")).toBe("XAU swap");
    expect(venueTicker("US500S")).toBe("US500 swap");
    expect(venueTicker("USOILP")).toBe("USOIL swap");
  });
});

describe("instrumentClass", () => {
  it("files Texas Instruments and GoPro as shares", () => {
    expect(instrumentClass("TXN")).toBe("equity");
    // Variational's interface puts GoPro under Indices; its feed says "GoPro, Inc.".
    expect(instrumentClass("GPRO", "INDEX")).toBe("equity");
  });

  it("reads trade.xyz's core crypto class as crypto", () => {
    expect(instrumentClass("BTC", "CRYPTO")).toBe("crypto");
  });
});
