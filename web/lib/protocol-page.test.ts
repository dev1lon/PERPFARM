import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasProtocolPage, protocolPageConfig, type ProtocolSlug } from "./protocol-page";
import { ALL_PROTOCOLS } from "./home-protocols";
import { isReadyVenue } from "./venue-status";

/** Protocols whose guidance has been written. The rest have the reference's
 *  empty slots waiting for it. */
const WRITTEN_GUIDANCE: ProtocolSlug[] = ["variational", "txflow"];
/** Every protocol that has a page, priced or not. */
const SLUGS: ProtocolSlug[] = [...WRITTEN_GUIDANCE, "qfex", "risex", "polymarket", "entropy", "tradexyz", "hibachi", "lighterrh"];
/** TrueNorth has no book of its own, but its connected execution books are
 * collected and selectable in the shared calculator. */
const EXECUTION_PAGES: ProtocolSlug[] = ["truenorth"];
/** Every protocol that has a page at all. */
const PAGES: ProtocolSlug[] = [...SLUGS, ...EXECUTION_PAGES];
const componentsDir = join(__dirname, "..", "components", "v2");
const read = (file: string) => readFileSync(join(componentsDir, file), "utf-8");

/**
 * The protocol page is a REFERENCE: every protocol renders the same windows,
 * labels and controls, and only its content differs. TxFlow drifted once --
 * a hand-written copy that lost the "no data yet" state on its hedge card and
 * badged an unloaded comparison as the lowest-cost route. These tests make
 * that drift fail here instead of on the live site.
 */
describe("protocol page reference", () => {
  it.each(PAGES)("%s renders through the shared page component", (slug) => {
    const file = slug === "variational" ? "ProtocolV2.tsx" : "TxFlowV2.tsx";
    const source = read(file);

    expect(source).toContain("ProtocolPageV2");
    // A page that builds its own sections is a page that can drift.
    expect(source).not.toMatch(/function\s+(Hero|HedgeRecommendations|ActivityAndDistribution|MechanicsPanel)\b/);
  });

  it.each(PAGES)("%s supplies every section the reference needs", (slug) => {
    const config = protocolPageConfig(slug, "en");

    expect(config.name.length).toBeGreaterThan(0);
    expect(config.twitterUrl).toMatch(/^https:\/\//);
    expect(config.docsUrl).toMatch(/^https:\/\//);
    // Three hero tiles, same labels in the same order on every protocol.
    expect(config.heroMetrics.map((m) => m.label)).toEqual(["Season", "Farm estimate", "OTC point price"]);
    // Numbering is drift-checked wherever tips exist; a protocol whose
    // guidance is not written yet has none, and the panel renders without them.
    expect(config.guidance.tips.map((t) => t.n)).toEqual(
      config.guidance.tips.map((_, index) => String(index + 1).padStart(2, "0")),
    );
    expect(config.guidance.docsUrl).toMatch(/^https:\/\//);
    expect(config.hedge.partner.slug).not.toBe(slug);
    expect(config.hedge.partner.tags.length).toBeGreaterThan(0);
  });

  it.each(WRITTEN_GUIDANCE)("%s states its priorities and practical tips", (slug) => {
    // Written guidance is what a priced protocol is FOR. An unpriced one is
    // allowed to have none yet; this one is not.
    const config = protocolPageConfig(slug, "en");

    expect(config.guidance.priorities.map((p) => p.label)).toEqual(["Priority 1", "Priority 2"]);
    expect(config.guidance.priorities.filter((p) => p.primary)).toHaveLength(1);
    expect(config.guidance.tips.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every listed protocol either a page or the SOON placeholder", () => {
    // A slug in the catalog with a page must be in the union, and a page must
    // never exist for a slug the catalog does not list -- that is how a raw
    // database slug once reached a user.
    for (const slug of PAGES) {
      expect(ALL_PROTOCOLS.map((protocol) => protocol.slug)).toContain(slug);
      expect(hasProtocolPage(slug)).toBe(true);
    }
    expect(hasProtocolPage("venue_alpha")).toBe(false);
  });

  it("prices every exchange page and models an agent through its execution venues", () => {
    // The page renders the calculator on this answer alone. Every exchange
    // with a page has both halves of a data path -- collection and a published
    // fee schedule -- and a slug with neither must never be ready.
    for (const slug of SLUGS) {
      expect(isReadyVenue(slug)).toBe(true);
    }
    // An agent itself has no order book, so it remains non-ready. Its page
    // exposes verified execution books to the calculator instead of a blank
    // placeholder.
    for (const slug of EXECUTION_PAGES) {
      expect(isReadyVenue(slug)).toBe(false);
      const execution = protocolPageConfig(slug, "en").execution;
      expect(execution?.venues.map((venue) => venue.slug)).toEqual(["hyperliquid", "ondo"]);
      expect(execution?.builderFeeBps).toBe(0);
    }
    // A catalogued protocol with no data path is still never ready.
    expect(isReadyVenue("hotstuff")).toBe(false);
    expect(isReadyVenue("venue_alpha")).toBe(false);
  });

  it.each(PAGES)("%s keeps the reference's guidance shape", (slug) => {
    // Two priorities and at least four tips, written or waiting to be: the
    // panel must not change shape between protocols.
    const config = protocolPageConfig(slug, "en");

    expect(config.guidance.priorities).toHaveLength(2);
    expect(config.guidance.tips.length).toBeGreaterThanOrEqual(4);
  });

  it.each(PAGES)("%s is translated in both languages", (slug) => {
    const en = protocolPageConfig(slug, "en");
    const ru = protocolPageConfig(slug, "ru");

    expect(ru.guidance.kicker).not.toBe(en.guidance.kicker);
    expect(ru.guidance.intro).not.toBe(en.guidance.intro);
    expect(ru.hedge.intro).not.toBe(en.hedge.intro);
    expect(ru.heroMetrics[0].label).not.toBe(en.heroMetrics[0].label);
  });

  it("says 'nothing here yet' the same way in every section", () => {
    // One voice for every empty state. The points panel used to shout
    // `NO POINTS YET` in 22px uppercase mono next to a quiet 14px sentence.
    //
    // Checked as "every empty state goes through EmptyNote, and EmptyNote is
    // the only thing that styles one". Banning the shouty class from the whole
    // page file instead was too blunt: the same small-caps label legitimately
    // titles the campaign countdown panel, which is not an empty state.
    for (const file of ["ProtocolPageV2.tsx", "FdvMarketsV2.tsx"]) {
      const source = read(file);
      expect(source).toContain("<EmptyNote");
      // No hand-rolled "nothing here" copy sitting outside the shared component.
      const emptyPhrases = source.match(/(No .{0,24} yet|Поинтов пока нет)/g) ?? [];
      for (const phrase of emptyPhrases) {
        expect(source).toMatch(new RegExp(`<EmptyNote[^>]*>[^<]*${phrase}`));
      }
    }
    // Comments stripped first: EmptyNote's own docstring quotes the shouted
    // style it replaced, and the prose describing a fixed bug is not the bug.
    const emptyNote = read("EmptyNote.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(emptyNote).not.toMatch(/uppercase|tracking-\[0\.12em\]|font-mono/);
  });

  it("keeps the open-interest composition chart out of the reference", () => {
    // Variational-only by explicit product decision: it is built on that
    // venue's TradFi/crypto split and has no counterpart elsewhere.
    expect(read("ProtocolPageV2.tsx")).not.toContain("OiCompositionChart");
    expect(read("ProtocolV2.tsx")).toContain("OiCompositionChart");
    expect(read("TxFlowV2.tsx")).not.toContain("OiCompositionChart");
  });

  it("never claims a lowest-cost route before the comparison loads", () => {
    const source = read("ProtocolPageV2.tsx");
    expect(source).toContain('routeStatus === "ready"');
    expect(source).toContain('setRouteStatus("unavailable")');
  });

  it("keeps the activity chart independent from the execution-book selection", () => {
    const source = read("ProtocolPageV2.tsx");

    expect(source).toContain('key={`calculator:${pricedVenue}`}');
    expect(source).toContain("const activityVenue = execution?.defaultVenue ?? pricedVenue;");
    expect(source).toContain('key={`activity:${activityVenue}`}');
    expect(source).toContain("venueOptions={execution?.venues}");
    expect(source).toContain("Manual hedge template");
  });
});
