import { describe, expect, it } from "vitest";
import { pluralEn, pluralRu } from "./format";

const pairs = (count: number) => pluralRu(count, "пара", "пары", "пар");

describe("pluralRu", () => {
  it("uses the singular for counts ending in 1", () => {
    // The case that shipped wrong: 241 reads like 1, not like a plural.
    expect(pairs(1)).toBe("пара");
    expect(pairs(21)).toBe("пара");
    expect(pairs(241)).toBe("пара");
  });

  it("uses the few form for counts ending in 2-4", () => {
    expect(pairs(2)).toBe("пары");
    expect(pairs(3)).toBe("пары");
    expect(pairs(24)).toBe("пары");
    expect(pairs(122)).toBe("пары");
  });

  it("uses the many form for 5-9, 0 and the teens", () => {
    expect(pairs(5)).toBe("пар");
    expect(pairs(10)).toBe("пар");
    expect(pairs(0)).toBe("пар");
    // The teens are the exception that breaks the last-digit rule.
    expect(pairs(11)).toBe("пар");
    expect(pairs(12)).toBe("пар");
    expect(pairs(14)).toBe("пар");
    expect(pairs(111)).toBe("пар");
    expect(pairs(241 - 130)).toBe("пар"); // 111
  });
});

describe("pluralEn", () => {
  it("switches only on one", () => {
    expect(pluralEn(1, "pair", "pairs")).toBe("pair");
    expect(pluralEn(0, "pair", "pairs")).toBe("pairs");
    expect(pluralEn(241, "pair", "pairs")).toBe("pairs");
  });
});
