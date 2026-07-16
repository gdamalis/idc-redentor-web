/**
 * Unit tests for the ICR-114 serverless sermon PDF render util. CI-safe: NO real
 * browser is launched here (jsdom, no Chromium) — the actual Chromium render is
 * covered by a manual local spike (see the ICR-114 PR description for the command +
 * output sizes), never committed.
 *
 * Covers: the bilingual sermon → SermonLocaleData/SermonCommon mapping, the
 * self-contained (no-network) HTML transform, and buildPdfHtml's version footer.
 */
import { describe, expect, it } from "vitest";

import { buildPdfHtml } from "@src/utils/predica/helpers";
import type { Sermon } from "@src/types/Sermon";

import { mapSermonsToPdf, toSelfContainedHtml } from "./renderSermonPdf";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSermon(overrides: Partial<Sermon> = {}): Sermon {
  return {
    title: "El amor de Dios",
    slug: "el-amor-de-dios",
    sermonDate: "2026-06-07",
    preacher: { name: "Juan Pérez", email: "juan@example.com" },
    audioLanguages: ["es-AR"],
    scriptureReferences: [],
    thesis: "",
    mainPoints: [],
    excerpt: "",
    content: {
      json: {
        nodeType: "document",
        data: {},
        content: [{ nodeType: "paragraph", data: {}, content: [{ nodeType: "text", value: "Cuerpo.", marks: [], data: {} }] }],
      },
      links: { assets: { block: [] } },
    },
    seoTitle: "",
    seoDescription: "",
    keywords: [],
    sys: { id: "sermon1" },
    ...overrides,
  };
}

const LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

// ── mapSermonsToPdf ───────────────────────────────────────────────────────────

describe("mapSermonsToPdf", () => {
  it("maps preacher name + additionalPreacher names from the es-AR sermon", () => {
    const esAR = makeSermon({
      preacher: { name: "Juan Pérez", email: "juan@example.com" },
      additionalPreachers: [
        { name: "Gabriel Damalis", email: "g@example.com" },
        { name: "Eric Prato", email: "e@example.com" },
      ],
    });
    const { common } = mapSermonsToPdf(esAR, undefined, LOGO_DATA_URI);
    expect(common.preacher).toBe("Juan Pérez");
    expect(common.additionalPreachers).toEqual(["Gabriel Damalis", "Eric Prato"]);
  });

  it("maps slug/sermonDate from whichever locale is present, preferring es-AR", () => {
    const esAR = makeSermon({ slug: "es-slug", sermonDate: "2026-01-01" });
    const enUS = makeSermon({ slug: "en-slug", sermonDate: "2026-02-02" });
    const { common } = mapSermonsToPdf(esAR, enUS, LOGO_DATA_URI);
    expect(common.slug).toBe("es-slug");
    expect(common.sermonDate).toBe("2026-01-01");
  });

  it("falls back to en-US for shared metadata when es-AR is missing", () => {
    const enUS = makeSermon({ slug: "en-only-slug" });
    const { common } = mapSermonsToPdf(undefined, enUS, LOGO_DATA_URI);
    expect(common.slug).toBe("en-only-slug");
    expect(common.preacher).toBe("Juan Pérez");
  });

  it("passes the logo data URI through unchanged", () => {
    const { common } = mapSermonsToPdf(makeSermon(), undefined, LOGO_DATA_URI);
    expect(common.logoDataUri).toBe(LOGO_DATA_URI);
  });

  it("omits serviceLabel (M3 — not a fetchable content-type field)", () => {
    const { common } = mapSermonsToPdf(makeSermon(), undefined, LOGO_DATA_URI);
    expect(common.serviceLabel).toBeUndefined();
  });

  it("converts each locale's rich-text content via richTextToContentBlocks", () => {
    const esAR = makeSermon({ title: "Título ES" });
    const enUS = makeSermon({
      title: "Title EN",
      content: {
        json: {
          nodeType: "document",
          data: {},
          content: [{ nodeType: "heading-2", data: {}, content: [{ nodeType: "text", value: "Movimiento", marks: [], data: {} }] }],
        },
        links: { assets: { block: [] } },
      },
    });
    const { byLocale } = mapSermonsToPdf(esAR, enUS, LOGO_DATA_URI);
    expect(byLocale["es-AR"]).toEqual({ title: "Título ES", content: [{ type: "p", text: "Cuerpo." }] });
    expect(byLocale["en-US"]).toEqual({ title: "Title EN", content: [{ type: "h2", text: "Movimiento" }] });
  });

  it("falls back to the other locale's title when one locale's sermon is missing", () => {
    const esAR = makeSermon({ title: "Solo en español" });
    const { byLocale } = mapSermonsToPdf(esAR, undefined, LOGO_DATA_URI);
    expect(byLocale["es-AR"].title).toBe("Solo en español");
    expect(byLocale["en-US"].title).toBe("Solo en español");
    // No en-US sermon fetched at all → no content to convert for that locale.
    expect(byLocale["en-US"].content).toEqual([]);
  });

  it("merges bilingual scripture references by index, converting numbers to strings", () => {
    const esAR = makeSermon({
      scriptureReferences: [
        { book: "Efesios", chapter: 2, fromVerse: 11, toVerse: 22, verseContent: "Texto ES", bibleVersion: "NVI" },
      ],
    });
    const enUS = makeSermon({
      scriptureReferences: [
        { book: "Ephesians", chapter: 2, fromVerse: 11, toVerse: 22, verseContent: "Text EN", bibleVersion: "NIV" },
      ],
    });
    const { common } = mapSermonsToPdf(esAR, enUS, LOGO_DATA_URI);
    expect(common.scriptureReferences).toEqual([
      {
        chapter: "2",
        fromVerse: "11",
        toVerse: "22",
        "es-AR": { book: "Efesios", verseContent: "Texto ES", bibleVersion: "NVI" },
        "en-US": { book: "Ephesians", verseContent: "Text EN", bibleVersion: "NIV" },
      },
    ]);
  });

  it("represents a null toVerse (single-verse reference) as undefined, not the string 'null'", () => {
    const esAR = makeSermon({
      scriptureReferences: [
        { book: "Juan", chapter: 3, fromVerse: 16, toVerse: null, verseContent: "Texto", bibleVersion: "NVI" },
      ],
    });
    const { common } = mapSermonsToPdf(esAR, undefined, LOGO_DATA_URI);
    expect(common.scriptureReferences?.[0].toVerse).toBeUndefined();
  });

  it("guards a length mismatch by falling back to whichever locale has that ref", () => {
    const esAR = makeSermon({
      scriptureReferences: [
        { book: "Efesios", chapter: 2, fromVerse: 11, toVerse: 22, verseContent: "Texto ES", bibleVersion: "NVI" },
      ],
    });
    // en-US sermon exists but has ONE FEWER scripture ref than es-AR.
    const enUS = makeSermon({ scriptureReferences: [] });
    const { common } = mapSermonsToPdf(esAR, enUS, LOGO_DATA_URI);
    expect(common.scriptureReferences).toHaveLength(1);
    expect(common.scriptureReferences?.[0]["es-AR"].book).toBe("Efesios");
    expect(common.scriptureReferences?.[0]["en-US"].book).toBe("");
  });

  it("omits scriptureReferences entirely when neither locale has any", () => {
    const { common } = mapSermonsToPdf(makeSermon({ scriptureReferences: [] }), undefined, LOGO_DATA_URI);
    expect(common.scriptureReferences).toBeUndefined();
  });

  it("throws when both locales are missing (nothing to render)", () => {
    expect(() => mapSermonsToPdf(undefined, undefined, LOGO_DATA_URI)).toThrow();
  });
});

// ── toSelfContainedHtml ───────────────────────────────────────────────────────

describe("toSelfContainedHtml", () => {
  function sampleHtml(): string {
    return buildPdfHtml({ title: "T", content: [] }, { slug: "s", sermonDate: "2026-01-01", preacher: "P" }, "es-AR");
  }

  it("removes the Google Fonts <link> tags (no outbound network at render)", () => {
    const html = toSelfContainedHtml(sampleHtml());
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  it("injects @font-face rules with base64 data-URI sources for both families", () => {
    const html = toSelfContainedHtml(sampleHtml());
    expect(html).toContain("@font-face");
    expect(html).toContain("font-family: 'Outfit'");
    expect(html).toContain("font-family: 'Playfair Display'");
    expect(html).toContain("url(data:font/woff2;base64,");
    // Normal + italic Playfair Display faces.
    expect(html).toContain("font-style: italic");
  });

  it("leaves the rest of the document (title, body) untouched", () => {
    const html = toSelfContainedHtml(sampleHtml());
    expect(html).toContain("<title>T</title>");
    expect(html).toContain("@page");
  });

  it("still renders the logo as a data-URI <img> when common.logoDataUri is set (unaffected by the transform)", () => {
    const html = toSelfContainedHtml(
      buildPdfHtml(
        { title: "T", content: [] },
        { slug: "s", sermonDate: "2026-01-01", preacher: "P", logoDataUri: LOGO_DATA_URI },
        "es-AR",
      ),
    );
    expect(html).toContain(`<img src="${LOGO_DATA_URI}"`);
  });
});

// ── buildPdfHtml version footer (re-exercised here — the render util's contract) ──

describe("buildPdfHtml version footer (as consumed by renderSermonPdfs)", () => {
  it("is absent when renderSermonPdfs would call buildPdfHtml without a version", () => {
    const html = buildPdfHtml({ title: "T", content: [] }, { slug: "s", sermonDate: "2026-01-01", preacher: "P" }, "es-AR");
    expect(html).not.toMatch(/·\s*v\d/);
  });

  it("is present when a version is threaded through", () => {
    const html = buildPdfHtml(
      { title: "T", content: [] },
      { slug: "s", sermonDate: "2026-01-01", preacher: "P" },
      "es-AR",
      7,
    );
    expect(html).toContain("· v7");
  });
});
