import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FDV_REVALIDATE_SECONDS } from "./fdv-market";

/**
 * Next reads a route's segment config by STATIC ANALYSIS, before the module and
 * its imports exist, so `export const revalidate = SOME_IMPORTED_CONSTANT` is
 * not a value it can resolve -- it fails the production build with "Unknown
 * identifier", which is exactly how this shipped once.
 *
 * The number therefore has to be written out in the route. This test is what
 * keeps that copy honest, since the compiler cannot.
 */
describe("the FDV route's cache window", () => {
  it("is written as a literal that matches the shared constant", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/venues/[slug]/fdv-market/route.ts"),
      "utf8",
    );
    const literal = source.match(/^export const revalidate = (\d+);$/m)?.[1];

    expect(literal, "revalidate must be a bare number literal").toBeDefined();
    expect(Number(literal)).toBe(FDV_REVALIDATE_SECONDS);
  });
});
