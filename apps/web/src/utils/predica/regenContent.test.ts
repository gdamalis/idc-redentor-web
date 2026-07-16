/**
 * Unit tests for the M1-blocker utilities: the rich-text → ContentBlock[] inverse
 * converter and the shared PDF-content hash used by both the webhook (CP4) and the
 * cron render (CP5) so they always agree on "did the PDF-relevant content change".
 */
import { BLOCKS } from "@contentful/rich-text-types";
import type { Document } from "@contentful/rich-text-types";
import { describe, it, expect } from "vitest";

import { computeSermonContentHash, richTextToContentBlocks } from "@src/utils/predica/regenContent";
import type { Sermon } from "@src/types/Sermon";

// ── Rich Text node fixtures ─────────────────────────────────────────────────

const textNode = (value: string) => ({ nodeType: "text", value, marks: [], data: {} });
const paragraph = (value: string) => ({
  nodeType: BLOCKS.PARAGRAPH,
  data: {},
  content: [textNode(value)],
});
const heading = (level: 2 | 3, value: string) => ({
  nodeType: level === 2 ? BLOCKS.HEADING_2 : BLOCKS.HEADING_3,
  data: {},
  content: [textNode(value)],
});
const blockquote = (value: string) => ({
  nodeType: BLOCKS.QUOTE,
  data: {},
  content: [paragraph(value)],
});
const listItem = (value: string) => ({
  nodeType: BLOCKS.LIST_ITEM,
  data: {},
  content: [paragraph(value)],
});
const list = (ordered: boolean, items: string[]) => ({
  nodeType: ordered ? BLOCKS.OL_LIST : BLOCKS.UL_LIST,
  data: {},
  content: items.map(listItem),
});
const embeddedAsset = (assetId: string) => ({
  nodeType: BLOCKS.EMBEDDED_ASSET,
  data: { target: { sys: { type: "Link", linkType: "Asset", id: assetId } } },
  content: [],
});

function makeDocument(content: unknown[]): Document {
  return { nodeType: BLOCKS.DOCUMENT, data: {}, content } as Document;
}

// ── richTextToContentBlocks ──────────────────────────────────────────────────

describe("richTextToContentBlocks", () => {
  it("returns [] for a null/undefined/empty document", () => {
    expect(richTextToContentBlocks(null)).toEqual([]);
    expect(richTextToContentBlocks(undefined)).toEqual([]);
    expect(richTextToContentBlocks(makeDocument([]))).toEqual([]);
  });

  it("inverts a representative document exercising every node type", () => {
    const doc = makeDocument([
      paragraph("Cuerpo del sermón."),
      heading(2, "Movimiento"),
      heading(3, "Sub-punto"),
      blockquote("Dios es amor."),
      list(false, ["uno", "dos"]),
      list(true, ["a", "b"]),
      embeddedAsset("AUD1"),
    ]);

    expect(richTextToContentBlocks(doc)).toEqual([
      { type: "p", text: "Cuerpo del sermón." },
      { type: "h2", text: "Movimiento" },
      { type: "h3", text: "Sub-punto" },
      { type: "blockquote", text: "Dios es amor." },
      { type: "ul", items: ["uno", "dos"] },
      { type: "ol", items: ["a", "b"] },
      { type: "embeddedAsset", assetId: "AUD1" },
    ]);
  });

  it("skips unknown/unsupported node types instead of throwing", () => {
    const doc = makeDocument([
      { nodeType: BLOCKS.HR, data: {}, content: [] },
      paragraph("kept"),
    ]);
    expect(richTextToContentBlocks(doc)).toEqual([{ type: "p", text: "kept" }]);
  });
});

// ── computeSermonContentHash ─────────────────────────────────────────────────

function makeSermon(overrides: Partial<Sermon> = {}): Sermon {
  return {
    title: "El amor de Dios",
    slug: "el-amor-de-dios",
    sermonDate: "2026-06-07",
    preacher: { name: "Juan Pérez", email: "juan@example.com" },
    audioLanguages: ["es-AR"],
    scriptureReferences: [
      {
        book: "Juan",
        chapter: 3,
        fromVerse: 16,
        toVerse: null,
        verseContent: "Porque de tal manera amó Dios al mundo...",
        bibleVersion: "RVR1960",
      },
    ],
    thesis: "Thesis",
    mainPoints: [],
    excerpt: "Excerpt",
    content: {
      json: makeDocument([paragraph("Cuerpo del sermón.")]),
      links: { assets: { block: [] } },
    },
    seoTitle: "SEO title",
    seoDescription: "SEO description",
    keywords: ["fe"],
    sys: { id: "sermon1" },
    ...overrides,
  };
}

describe("computeSermonContentHash", () => {
  it("is stable for an identical sermon pair", () => {
    const esAR = makeSermon();
    const enUS = makeSermon({ title: "God's Love" });
    const hashA = computeSermonContentHash(esAR, enUS);
    const hashB = computeSermonContentHash(makeSermon(), makeSermon({ title: "God's Love" }));
    expect(hashA).toBe(hashB);
  });

  it("changes when the body text changes", () => {
    const base = computeSermonContentHash(makeSermon(), undefined);
    const changed = computeSermonContentHash(
      makeSermon({
        content: {
          json: makeDocument([paragraph("Texto diferente.")]),
          links: { assets: { block: [] } },
        },
      }),
      undefined,
    );
    expect(changed).not.toBe(base);
  });

  it("changes when the title changes", () => {
    const base = computeSermonContentHash(makeSermon(), undefined);
    const changed = computeSermonContentHash(makeSermon({ title: "Otro título" }), undefined);
    expect(changed).not.toBe(base);
  });

  it("changes when sermonDate changes (rendered on the PDF cover)", () => {
    const base = computeSermonContentHash(makeSermon({ sermonDate: "2026-06-07" }), undefined);
    const changed = computeSermonContentHash(makeSermon({ sermonDate: "2026-06-14" }), undefined);
    expect(changed).not.toBe(base);
  });

  it("changes when a scripture verse changes", () => {
    const base = computeSermonContentHash(makeSermon(), undefined);
    const changed = computeSermonContentHash(
      makeSermon({
        scriptureReferences: [
          {
            book: "Juan",
            chapter: 3,
            fromVerse: 16,
            toVerse: null,
            verseContent: "Un texto de versículo distinto.",
            bibleVersion: "RVR1960",
          },
        ],
      }),
      undefined,
    );
    expect(changed).not.toBe(base);
  });

  it("stays the same when only a non-PDF field (seoTitle) changes", () => {
    const base = computeSermonContentHash(makeSermon(), undefined);
    const changed = computeSermonContentHash(makeSermon({ seoTitle: "Different SEO title" }), undefined);
    expect(changed).toBe(base);
  });

  it("does not throw when the en-US locale is missing", () => {
    expect(() => computeSermonContentHash(makeSermon(), undefined)).not.toThrow();
    expect(() => computeSermonContentHash(undefined, makeSermon())).not.toThrow();
    expect(() => computeSermonContentHash(undefined, undefined)).not.toThrow();
  });
});
