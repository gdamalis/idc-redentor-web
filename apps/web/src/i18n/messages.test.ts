import { describe, it, expect } from "vitest";
import esAR from "@public/locales/es-AR.json";
import enUS from "@public/locales/en-US.json";

/** Flattens {a:{b:"x"}} => ["a.b"], so a nested key can never drift between locales. */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale message files", () => {
  it("have identical key sets (no key may exist in one file only)", () => {
    const es = flattenKeys(esAR).sort();
    const en = flattenKeys(enUS).sort();

    expect(es.filter((k) => !en.includes(k))).toEqual([]); // missing from en-US
    expect(en.filter((k) => !es.includes(k))).toEqual([]); // missing from es-AR
  });

  it("expose the sermon audio-language notice in both locales", () => {
    for (const messages of [esAR, enUS]) {
      const keys = flattenKeys(messages);
      expect(keys).toContain("Sermons.audio-language.es");
      expect(keys).toContain("Sermons.audio-language.en");
      expect(keys).toContain("Sermons.audio-language.bilingual");
      expect(keys).toContain("Sermons.interpreted-by");
    }
  });

  // AC4: the hardcoded note is GONE, not merely unused.
  it("no longer define the retired audio-in-spanish key", () => {
    for (const messages of [esAR, enUS]) {
      expect(flattenKeys(messages)).not.toContain("Sermons.audio-in-spanish");
    }
  });

  it("keep the en-US Spanish-audio sentence byte-identical to the retired note", () => {
    // AC2: no visual regression for the 4 existing Spanish-only sermons.
    expect(enUS.Sermons["audio-language"].es).toBe(
      "This sermon's audio is in Spanish.",
    );
  });
});
