import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { FDV_REVALIDATE_SECONDS, fdvEvent, hasFdvMarket, loadFdvMarkets } from "./fdv-market";
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

  it("reads Polymarket's own token from Predict, where it actually trades", () => {
    const event = fdvEvent("polymarket");

    expect(event?.source).toBe("predictfun");
    expect(event?.kind).toBe("fdv");
    expect(event?.page).toMatch(/^https:\/\/predict\.fun\/market\//);
    // Every other event is read from Polymarket's own API.
    for (const slug of ["variational", "qfex", "risex", "hibachi"]) {
      expect(fdvEvent(slug)?.source).toBe("polymarket");
    }
  });
});

/** One gamma event, trimmed to the fields the loader reads. */
function gammaEvent(markets: unknown[]) {
  return { volume: 4864.38, markets };
}

function launchMarket(title: string, yes: string, closed = false) {
  return { groupItemTitle: title, outcomes: ["Yes", "No"], outcomePrices: [yes, "0.5"], volume: "100", closed };
}

describe("reading a launch market", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the venue's dates, shortened, and in order", async () => {
    // Out of order and with a resolved market in the middle, exactly as
    // Polymarket returns Hibachi's event.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(gammaEvent([
      launchMarket("December 31, 2027", "0.905"),
      launchMarket("March 31, 2026", "0", true),
      launchMarket("September 30, 2026", "0.019"),
    ])))));

    const answer = await loadFdvMarkets("hibachi");

    expect(answer?.kind).toBe("launch");
    // A date must never walk back a day through the machine's timezone, and a
    // market that already resolved is not an expectation any more.
    expect(answer?.markets.map((market) => market.threshold)).toEqual([
      "Sep 30, 2026",
      "Dec 31, 2027",
    ]);
  });

  it("has nothing to say for a protocol with no event", async () => {
    expect(await loadFdvMarkets("txflow")).toBeNull();
  });
});

/**
 * Predict's own answer for Polymarket's token event, trimmed to the fields the
 * loader reads (recorded 2026-09-13). Its odds are a bid and an ask, not a
 * price, and its per-market volume lives behind a second call.
 */
const PREDICT_EVENT = {
  data: {
    slug: "polymarket-official-token-fdv-above-one-day-after-launch",
    stats: { volumeTotalUsd: 6398671.66 },
    markets: [
      {
        id: 283128,
        title: "$8B",
        resolution: null,
        outcomes: [{ name: "Yes", bestBid: { price: 0.311 }, bestAsk: { price: 0.312 } }],
      },
      {
        id: 283125,
        title: "$2B",
        resolution: null,
        outcomes: [{ name: "Yes", bestBid: { price: 0.408 }, bestAsk: { price: 0.409 } }],
      },
      {
        id: 999,
        title: "$1B",
        resolution: "Yes",
        outcomes: [{ name: "Yes", bestBid: { price: 1 }, bestAsk: { price: 1 } }],
      },
    ],
  },
};

describe("reading Predict", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PREDICT_FUN_API_KEY;
  });

  it("prices the Yes side at its mid and asks each market for its volume", async () => {
    process.env.PREDICT_FUN_API_KEY = "pred_sk_test";
    const seen: Array<{ url: string; key: string | null; origin: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      seen.push({ url, key: headers.get("x-api-key"), origin: headers.get("origin") });
      return url.includes("/stats")
        ? new Response(JSON.stringify({ data: { volumeTotalUsd: 1_632_518.91 } }))
        : new Response(JSON.stringify(PREDICT_EVENT));
    }));

    const answer = await loadFdvMarkets("polymarket");

    expect(answer?.source).toBe("predictfun");
    // Sorted by threshold, the resolved $1B market dropped, odds at the mid.
    expect(answer?.markets.map((market) => [market.threshold, market.probability])).toEqual([
      ["$2B", 41],
      ["$8B", 31],
    ]);
    expect(answer?.markets[0].volume).toBe(1_632_518.91);
    expect(answer?.eventVolume).toBe(6398671.66);
    // The key is bound to one origin, and the API refuses a call without it.
    expect(seen[0].key).toBe("pred_sk_test");
    expect(seen[0].origin).toBe("https://perpfarm.vercel.app");
  });

  it("says so plainly when the key is missing rather than drawing nothing", async () => {
    vi.stubGlobal("fetch", vi.fn());

    await expect(loadFdvMarkets("polymarket")).rejects.toThrow(/PREDICT_FUN_API_KEY/);
  });
});
