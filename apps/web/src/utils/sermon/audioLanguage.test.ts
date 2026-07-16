import { describe, it, expect } from "vitest";
import {
  getAudioLanguageNotice,
  normalizeAudioLanguages,
} from "./audioLanguage";

describe("normalizeAudioLanguages", () => {
  it("defaults absent/empty to the Spanish-only baseline", () => {
    expect(normalizeAudioLanguages(undefined)).toEqual(["es-AR"]);
    expect(normalizeAudioLanguages(null)).toEqual(["es-AR"]);
    expect(normalizeAudioLanguages([])).toEqual(["es-AR"]);
  });

  it("drops unknown locales", () => {
    expect(normalizeAudioLanguages(["es-AR", "fr-FR"])).toEqual(["es-AR"]);
  });

  it("falls back to the baseline when every value is unknown", () => {
    expect(normalizeAudioLanguages(["fr-FR", "de-DE"])).toEqual(["es-AR"]);
  });

  it("collapses duplicates", () => {
    expect(normalizeAudioLanguages(["es-AR", "es-AR"])).toEqual(["es-AR"]);
  });

  it("keeps both locales for a bilingual recording", () => {
    expect(normalizeAudioLanguages(["es-AR", "en-US"])).toEqual([
      "es-AR",
      "en-US",
    ]);
  });
});

describe("getAudioLanguageNotice", () => {
  // The audio matches the page's own language => say nothing. This is what keeps
  // the common case (a Spanish sermon on the Spanish page) visually clean.
  it("renders nothing when the audio is exactly the page language", () => {
    expect(getAudioLanguageNotice(["es-AR"], "es-AR")).toBeNull();
    expect(getAudioLanguageNotice(["en-US"], "en-US")).toBeNull();
  });

  // AC2 + AC7: the 4 legacy sermons have NO audioLanguages field at all and must
  // render exactly as they do today.
  it("treats an absent field as Spanish-only (the legacy sermons)", () => {
    expect(getAudioLanguageNotice(undefined, "es-AR")).toBeNull();
    expect(getAudioLanguageNotice(undefined, "en-US")).toBe("es");
    expect(getAudioLanguageNotice([], "en-US")).toBe("es");
  });

  it("announces a Spanish recording to an English reader", () => {
    expect(getAudioLanguageNotice(["es-AR"], "en-US")).toBe("es");
  });

  // The case the ticket's table omits: an English-only recording on the Spanish page.
  it("announces an English recording to a Spanish reader", () => {
    expect(getAudioLanguageNotice(["en-US"], "es-AR")).toBe("en");
  });

  // AC1: a bilingual recording is announced on BOTH locales — it is never the
  // page's "own" single language, so it is never suppressed.
  it("announces a bilingual recording on both locales", () => {
    expect(getAudioLanguageNotice(["es-AR", "en-US"], "es-AR")).toBe(
      "bilingual",
    );
    expect(getAudioLanguageNotice(["es-AR", "en-US"], "en-US")).toBe(
      "bilingual",
    );
  });

  it("is order-insensitive and duplicate-tolerant", () => {
    expect(getAudioLanguageNotice(["en-US", "es-AR"], "es-AR")).toBe(
      "bilingual",
    );
    expect(getAudioLanguageNotice(["es-AR", "es-AR"], "en-US")).toBe("es");
  });

  it("never renders an unknown language", () => {
    expect(getAudioLanguageNotice(["es-AR", "fr-FR"], "en-US")).toBe("es");
    expect(getAudioLanguageNotice(["fr-FR"], "es-AR")).toBeNull();
  });
});
