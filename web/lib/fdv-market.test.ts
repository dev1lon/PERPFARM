import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FDV_REVALIDATE_SECONDS, fdvEvent, hasFdvMarket, UNREADABLE_MARKET_PAGE } from "./fdv-market";
import { isReadyVenue } from "./venue-status";

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

describe("prediction markets by protocol", () => {
  it("asks the question each protocol's market actually asks", () => {
    // FDV markets: what the token is worth a day after launch.
    expect(fdvEvent("variational")?.kind).toBe("fdv");
    expect(fdvEvent("qfex")?.kind).toBe("fdv");
    // Launch markets: whether a token exists by a date at all. Reading one as
    // an FDV would print a number nobody is trading.
    expect(fdvEvent("risex")?.kind).toBe("launch");
    expect(fdvEvent("hibachi")?.kind).toBe("launch");
    expect(fdvEvent("txflow")).toBeNull();
  });

  it("only lists protocols the site has a page for", () => {
    for (const slug of ["variational", "qfex", "risex", "hibachi"]) {
      expect(hasFdvMarket(slug)).toBe(true);
      expect(isReadyVenue(slug)).toBe(true);
      const event = fdvEvent(slug);
      expect(event?.page).toMatch(/^https:\/\/polymarket\.com\/event\//);
      // The page and the API read the same event, so its slug is in both.
      expect(event?.page).toContain(event?.slug ?? "");
    }
  });

  it("links a market it cannot read instead of pretending it has none", () => {
    // predict.fun answers its API with 401 unless you hold a key, so Polymarket's
    // own token market is linked rather than quoted.
    expect(hasFdvMarket("polymarket")).toBe(false);
    expect(UNREADABLE_MARKET_PAGE.polymarket).toMatch(/^https:\/\/predict\.fun\/market\//);
  });
});
