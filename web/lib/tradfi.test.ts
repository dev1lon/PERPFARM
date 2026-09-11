import { describe, expect, it } from "vitest";
import { displayPair, instrumentClass, venueTicker } from "./tradfi";

describe("displayPair", () => {
  it("names a swap row by the pair's standard name, not Variational's feed ticker", () => {
    expect(displayPair("USOILP")).toBe("CL");
    expect(displayPair("UKOILP")).toBe("BZ");
    expect(displayPair("US500S")).toBe("SP500");
    expect(displayPair("NVDA")).toBe("NVDA");
  });
});

describe("venueTicker", () => {
  it("prints trade.xyz's on-screen name, not its API coin", () => {
    expect(venueTicker("xyz:CL")).toBe("WTIOIL");
    expect(venueTicker("xyz:SMSN")).toBe("SAMSUNG");
    expect(venueTicker("xyz:GOLD")).toBe("GOLD");
  });

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
