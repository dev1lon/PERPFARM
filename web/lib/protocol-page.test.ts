import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { protocolPageConfig, type ProtocolSlug } from "./protocol-page";

const SLUGS: ProtocolSlug[] = ["variational", "txflow"];
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
  it.each(SLUGS)("%s renders through the shared page component", (slug) => {
    const file = slug === "variational" ? "ProtocolV2.tsx" : "TxFlowV2.tsx";
    const source = read(file);

    expect(source).toContain("ProtocolPageV2");
    // A page that builds its own sections is a page that can drift.
    expect(source).not.toMatch(/function\s+(Hero|HedgeRecommendations|ActivityAndDistribution|MechanicsPanel)\b/);
  });

  it.each(SLUGS)("%s supplies every section the reference needs", (slug) => {
    const config = protocolPageConfig(slug, "en");

    expect(config.name.length).toBeGreaterThan(0);
    expect(config.twitterUrl).toMatch(/^https:\/\//);
    expect(config.docsUrl).toMatch(/^https:\/\//);
    // Three hero tiles, same labels in the same order on every protocol.
    expect(config.heroMetrics.map((m) => m.label)).toEqual(["Season", "Farm estimate", "OTC point price"]);
    expect(config.guidance.priorities.map((p) => p.label)).toEqual(["Priority 1", "Priority 2"]);
    expect(config.guidance.priorities.filter((p) => p.primary)).toHaveLength(1);
    expect(config.guidance.tips.map((t) => t.n)).toEqual(["01", "02", "03", "04"]);
    expect(config.guidance.docsUrl).toMatch(/^https:\/\//);
    expect(config.hedge.partner.slug).not.toBe(slug);
    expect(config.hedge.partner.tags.length).toBeGreaterThan(0);
  });

  it.each(SLUGS)("%s is translated in both languages", (slug) => {
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
    for (const file of ["ProtocolPageV2.tsx", "FdvMarketsV2.tsx"]) {
      const source = read(file);
      expect(source).toContain("EmptyNote");
      expect(source).not.toMatch(/uppercase tracking-\[0\.12em\] text-text-dim/);
    }
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
});
