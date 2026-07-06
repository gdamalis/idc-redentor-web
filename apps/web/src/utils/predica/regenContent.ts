/**
 * The M1-blocker utilities for the sermon PDF regen webhook (ICR-114):
 *
 *  - `richTextToContentBlocks` — the INVERSE of `blocksToRichTextDocument`
 *    (sermonEntry.ts). Given a Contentful Rich Text `Document` (as returned by
 *    `getSermonById`'s `content.json`), rebuild the writer's `ContentBlock[]`
 *    representation so an editor's Contentful edit can be re-rendered into the
 *    same PDF body the website shows (see docs/architecture/predica-pdf-mirrors-post.md).
 *
 *  - `computeSermonContentHash` — ONE canonical hash of only the fields that
 *    affect the rendered PDF (title, sermon date, body content, scripture,
 *    byline), shared by the webhook (marks a job dirty) and the cron render
 *    (decides whether a render is a no-op). Hashing the DERIVED content blocks
 *    (not the raw rich text) means mark-only/formatting-only Rich Text edits and
 *    any non-PDF field (SEO, keywords, featured image, audio, …) never churn the
 *    hash.
 */
import { BLOCKS } from "@contentful/rich-text-types";
import type { Block, Document, Inline, Text, TopLevelBlock } from "@contentful/rich-text-types";
import { createHash } from "node:crypto";

import type { Sermon, ScriptureRef } from "@src/types/Sermon";

import type { ContentBlock } from "./sermonEntry";

// ── richTextToContentBlocks ──────────────────────────────────────────────────

/** Any node that can appear inside a top-level block's `content` array. */
type RichTextChildNode = Block | Inline | Text;

function isTextNode(node: RichTextChildNode): node is Text {
  return node.nodeType === "text";
}

/**
 * Concatenate every descendant text-node value under `node` (no separator — the
 * forward converter emits exactly one text node per block, so this exactly
 * inverts it; it also transparently unwraps blockquote/list-item paragraph
 * wrappers since it recurses through any nesting depth).
 */
function extractText(node: RichTextChildNode): string {
  if (isTextNode(node)) return node.value;
  return node.content.map(extractText).join("");
}

function extractListItems(listNode: TopLevelBlock): string[] {
  return listNode.content.map((item) => extractText(item));
}

function extractAssetId(node: TopLevelBlock): string | undefined {
  const data = node.data as { target?: { sys?: { id?: string } } } | undefined;
  const id = data?.target?.sys?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function topLevelNodeToBlock(node: TopLevelBlock): ContentBlock | undefined {
  switch (node.nodeType) {
    case BLOCKS.PARAGRAPH:
      return { type: "p", text: extractText(node) };
    case BLOCKS.HEADING_2:
      return { type: "h2", text: extractText(node) };
    case BLOCKS.HEADING_3:
      return { type: "h3", text: extractText(node) };
    case BLOCKS.QUOTE:
      return { type: "blockquote", text: extractText(node) };
    case BLOCKS.UL_LIST:
      return { type: "ul", items: extractListItems(node) };
    case BLOCKS.OL_LIST:
      return { type: "ol", items: extractListItems(node) };
    case BLOCKS.EMBEDDED_ASSET: {
      const assetId = extractAssetId(node);
      return assetId ? { type: "embeddedAsset", assetId } : undefined;
    }
    default:
      // Unsupported/unknown node type (hr, table, embedded-entry, …) — skip gracefully.
      return undefined;
  }
}

/**
 * Invert `blocksToRichTextDocument` (sermonEntry.ts): rebuild the writer's
 * `ContentBlock[]` from a Contentful Rich Text `Document`. Never throws — an
 * absent/empty document, or one containing only unsupported node types, yields `[]`.
 */
export function richTextToContentBlocks(doc: Document | undefined | null): ContentBlock[] {
  if (!doc?.content?.length) return [];
  const blocks: ContentBlock[] = [];
  for (const node of doc.content) {
    const block = topLevelNodeToBlock(node);
    if (block) blocks.push(block);
  }
  return blocks;
}

// ── computeSermonContentHash ─────────────────────────────────────────────────

interface CanonicalScriptureRef {
  book: { "es-AR": string; "en-US": string };
  chapter: number;
  fromVerse: number;
  toVerse: number | null;
  verseContent: { "es-AR": string; "en-US": string };
}

function buildCanonicalScripture(
  esRefs: ScriptureRef[] | undefined,
  enRefs: ScriptureRef[] | undefined,
): CanonicalScriptureRef[] {
  const es = esRefs ?? [];
  const en = enRefs ?? [];
  const length = Math.max(es.length, en.length);
  const refs: CanonicalScriptureRef[] = [];
  for (let i = 0; i < length; i += 1) {
    const esRef = es[i];
    const enRef = en[i];
    const coords = esRef ?? enRef;
    refs.push({
      book: { "es-AR": esRef?.book ?? "", "en-US": enRef?.book ?? "" },
      chapter: coords?.chapter ?? 0,
      fromVerse: coords?.fromVerse ?? 0,
      toVerse: coords?.toVerse ?? null,
      verseContent: { "es-AR": esRef?.verseContent ?? "", "en-US": enRef?.verseContent ?? "" },
    });
  }
  return refs;
}

function buildCanonicalByline(
  sermonEsAR: Sermon | undefined,
  sermonEnUS: Sermon | undefined,
): string[] {
  const source = sermonEsAR ?? sermonEnUS;
  if (!source) return [];
  return [source.preacher.name, ...(source.additionalPreachers ?? []).map((p) => p.name)];
}

/**
 * Deterministic JSON serialization: object keys are sorted so the output never
 * depends on incidental insertion order, while array order (scripture refs,
 * content blocks, byline names) is preserved because it is semantically meaningful.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Compute ONE canonical sha256 hash of only the fields that affect the rendered
 * sermon PDF, from the two per-locale `Sermon` objects (either may be `undefined`
 * — e.g. a locale not yet translated). Used by BOTH the regen webhook (CP4, to
 * mark a `pdf_jobs` doc dirty) and the cron render (CP5, to skip a no-op render)
 * so the two always agree on "did anything PDF-relevant change".
 *
 * Deliberately excludes seoTitle/seoDescription/keywords/featuredImage/audio/
 * durationSeconds/slug/sys/pdfSummary — editing any of those must NOT change the hash.
 * `sermonDate` IS included below — it isn't localized (one value), but it's rendered
 * on the PDF cover (`buildPdfHtml` → `formatSermonDate`), so a date-only edit must
 * re-render.
 */
export function computeSermonContentHash(
  sermonEsAR: Sermon | undefined,
  sermonEnUS: Sermon | undefined,
): string {
  const canonical = {
    title: {
      "es-AR": sermonEsAR?.title ?? "",
      "en-US": sermonEnUS?.title ?? "",
    },
    // Non-localized, but rendered on the PDF cover — a date-only edit must re-render.
    sermonDate: sermonEsAR?.sermonDate ?? sermonEnUS?.sermonDate ?? "",
    content: {
      "es-AR": richTextToContentBlocks(sermonEsAR?.content?.json as Document | undefined),
      "en-US": richTextToContentBlocks(sermonEnUS?.content?.json as Document | undefined),
    },
    scripture: buildCanonicalScripture(
      sermonEsAR?.scriptureReferences,
      sermonEnUS?.scriptureReferences,
    ),
    byline: buildCanonicalByline(sermonEsAR, sermonEnUS),
  };
  return createHash("sha256").update(canonicalStringify(canonical)).digest("hex");
}
