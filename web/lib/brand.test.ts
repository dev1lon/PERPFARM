import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandAssets } from "./brand";

describe("protocol brand assets", () => {
  it("uses the shipped Hyperliquid logo instead of the fallback monogram", () => {
    const assets = brandAssets("hyperliquid");

    expect(assets.mark).toBe("logos/HL/logo.jpg");
    expect(existsSync(join(__dirname, "..", "public", assets.mark!))).toBe(true);
  });
});
