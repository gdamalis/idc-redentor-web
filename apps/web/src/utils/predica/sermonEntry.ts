/**
 * Deterministic builders that turn a writer-produced `sermon.json` into the exact
 * Contentful Management API payloads the `predica-publisher` subagent needs.
 *
 * Hand-authoring Contentful Rich Text JSON (every text node needs `marks`/`data`,
 * every block needs `data`) and locale-wrapping every field is error-prone across
 * a whole sermon body, so it lives here — pure, typed, and Vitest-tested — instead
 * of in an LLM prompt. The runnable Node twin (no build step) is
 * `.claude/scripts/predica/build-sermon-entry.mjs`, which MUST mirror this file.
 *
 * Two consumers:
 *  - `buildBibleVerseFields(ref)` → the `fields` payload for one `bibleVerse` entry
 *    (both-locale `book`/`verseContent`/`bibleVersion`; shared `chapter`/verses). Its
 *    `internalName` is DERIVED from the passage + version (`buildBibleVerseInternalName`),
 *    never the per-sermon slug, so identical passages produce the same key and the
 *    publisher reuses one entry across sermons (a different translation → a different
 *    key, never collided). See `docs/predica-bibleverse-reuse.md`.
 *  - `buildSermonEntryFields(sermon, links)` → the localized `fields` payload for the
 *    DRAFT `sermon` entry, given the link ids the publisher already resolved
 *    (preacher, scriptureReferences, pdfSummary, optional audio/featuredImage).
 *
 * Localization rules (verified against the live space):
 *  - Localized fields carry BOTH locales (`es-AR` + `en-US`).
 *  - Non-localized fields are keyed by the space DEFAULT locale only (`es-AR`).
 *
 * Canonical `sermon.json` contract: `.claude/agents/predica-writer.md` and
 * `tasks/specs/sermon-pipeline.md` §7.
 */

// ── Locales ─────────────────────────────────────────────────────────────────

export type PredicaLocale = "es-AR" | "en-US";

export const PREDICA_LOCALES = ["es-AR", "en-US"] as const satisfies readonly PredicaLocale[];

/** Space default locale — the key required for every NON-localized field. */
export const PREDICA_DEFAULT_LOCALE: PredicaLocale = "es-AR";

// ── sermon.json input shapes ────────────────────────────────────────────────

/** A single content block in the writer's simplified body representation. */
export interface ContentBlock {
  type: "h2" | "h3" | "p" | "blockquote" | "ul" | "ol" | "embeddedAsset";
  /** Text for h2 / h3 / p / blockquote. */
  text?: string;
  /** Items for ul / ol. */
  items?: string[];
  /**
   * Contentful Asset id for `embeddedAsset` blocks (renders an `embedded-asset-block`
   * node). Used by the multi-preacher sermon body to interleave per-segment audio +
   * PDF players inside the rich text. The id must already be resolved (uploaded).
   */
  assetId?: string;
}

/** Per-locale values for one `bibleVerse` reference. */
export interface ScriptureRefLocale {
  book: string;
  verseContent: string;
  bibleVersion: string;
}

/** One structured scripture reference → one bilingual `bibleVerse` entry. */
export interface SermonScriptureRef {
  /**
   * Optional/ignored. The dedup key is DERIVED (`buildBibleVerseInternalName`) from
   * the passage + version, not authored, so it stays stable across sermons. A value
   * here from older `sermon.json` files is tolerated but never used.
   */
  internalName?: string;
  /** Non-localized — shared across locales. */
  chapter: string;
  fromVerse: string;
  toVerse?: string;
  "es-AR": ScriptureRefLocale;
  "en-US": ScriptureRefLocale;
}

/**
 * Per-locale sermon content. Every field maps to the Contentful `sermon` entry.
 * `content[]` is the single canonical body: it drives BOTH the website post and the
 * branded PDF (the PDF renders the same blocks — see src/utils/predica/helpers.ts and
 * docs/predica-pdf-mirrors-post.md). `thesis`/`mainPoints`/SEO are metadata (cards,
 * SEO, related), not the PDF body.
 */
export interface SermonLocaleContent {
  title: string;
  thesis: string;
  mainPoints: string[];
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  content: ContentBlock[];
}

/** The canonical sermon.json document. */
export interface SermonDocument {
  slug: string;
  sermonDate: string;
  preacher: string;
  preacherEmail?: string;
  /**
   * Optional co-preachers for a multi-preacher service (one post combining several
   * short messages). The publisher resolves each `name` to an `author` entry id and
   * passes them as {@link ResolvedLinks.additionalPreacherIds}; the byline then renders
   * `[preacher, ...additionalPreachers]`. Omitted for a normal single-preacher sermon.
   */
  additionalPreachers?: Array<{ name: string; email?: string }>;
  internalName: string;
  durationSeconds?: number;
  serviceLabel?: Record<PredicaLocale, string>;
  scriptureReferences?: SermonScriptureRef[];
  whatsappText?: string;
  locales: Record<PredicaLocale, SermonLocaleContent>;
}

/** Contentful link ids the publisher resolves before building the sermon entry. */
export interface ResolvedLinks {
  preacherId: string;
  /**
   * Co-preacher author ids for a multi-preacher service (e.g. four short messages
   * in one post). Linked to the optional `additionalPreachers` field; the byline
   * renders `[preacher, ...additionalPreachers]`. Empty/absent for normal sermons.
   */
  additionalPreacherIds?: string[];
  scriptureRefIds?: string[];
  pdfAssetIds?: Partial<Record<PredicaLocale, string>>;
  audioAssetId?: string;
  featuredImageAssetId?: string;
}

// ── Contentful Rich Text node shapes ────────────────────────────────────────

interface RichTextNode {
  nodeType: string;
  data: Record<string, unknown>;
  content?: RichTextNode[];
  value?: string;
  marks?: Array<{ type: string }>;
}

export interface RichTextDocument {
  nodeType: "document";
  data: Record<string, unknown>;
  content: RichTextNode[];
}

/** A Contentful field value, keyed by locale code. */
export type LocalizedField = Record<string, unknown>;

// ── Rich text builders ──────────────────────────────────────────────────────

const textNode = (value: string): RichTextNode => ({
  nodeType: "text",
  value,
  marks: [],
  data: {},
});

const paragraph = (value: string): RichTextNode => ({
  nodeType: "paragraph",
  data: {},
  content: [textNode(value)],
});

const heading = (level: 2 | 3, value: string): RichTextNode => ({
  nodeType: `heading-${level}`,
  data: {},
  content: [textNode(value)],
});

const blockquote = (value: string): RichTextNode => ({
  nodeType: "blockquote",
  data: {},
  content: [paragraph(value)],
});

const listItem = (value: string): RichTextNode => ({
  nodeType: "list-item",
  data: {},
  content: [paragraph(value)],
});

const list = (ordered: boolean, items: string[]): RichTextNode => ({
  nodeType: ordered ? "ordered-list" : "unordered-list",
  data: {},
  content: items.map(listItem),
});

/**
 * An `embedded-asset-block` node referencing an already-uploaded Contentful Asset.
 * The renderer (sermonRichTextOptions) resolves it by `data.target.sys.id` and draws
 * an audio player / PDF button / image by the asset's contentType.
 */
const embeddedAsset = (assetId: string): RichTextNode => ({
  nodeType: "embedded-asset-block",
  data: { target: { sys: { type: "Link", linkType: "Asset", id: assetId } } },
  content: [],
});

const blockToNode = (block: ContentBlock): RichTextNode => {
  switch (block.type) {
    case "h2":
      return heading(2, block.text ?? "");
    case "h3":
      return heading(3, block.text ?? "");
    case "p":
      return paragraph(block.text ?? "");
    case "blockquote":
      return blockquote(block.text ?? "");
    case "ul":
      return list(false, block.items ?? []);
    case "ol":
      return list(true, block.items ?? []);
    case "embeddedAsset":
      return embeddedAsset(block.assetId ?? "");
  }
};

/**
 * Convert the writer's content blocks into a Contentful Rich Text Document using
 * only the node set the `sermon.content` field allows (paragraph, heading-2/3,
 * unordered/ordered lists, blockquote). An empty `blocks` array yields a valid
 * empty document.
 */
export function blocksToRichTextDocument(blocks: ContentBlock[]): RichTextDocument {
  return {
    nodeType: "document",
    data: {},
    content: blocks.map(blockToNode),
  };
}

// ── Entry field builders ────────────────────────────────────────────────────

const entryLink = (id: string) => ({
  sys: { type: "Link", linkType: "Entry", id },
});

const assetLink = (id: string) => ({
  sys: { type: "Link", linkType: "Asset", id },
});

const atDefault = (value: unknown): LocalizedField => ({
  [PREDICA_DEFAULT_LOCALE]: value,
});

function localizedFrom<T>(
  sermon: SermonDocument,
  getter: (locale: SermonLocaleContent) => T,
): LocalizedField {
  const field: LocalizedField = {};
  for (const locale of PREDICA_LOCALES) {
    field[locale] = getter(sermon.locales[locale]);
  }
  return field;
}

/**
 * Derive the canonical, deterministic dedup key for a `bibleVerse` entry.
 *
 * Format: `"<book es> <chapter>:<fromVerse>[-<toVerse>] (<bibleVersion es>)"` —
 * e.g. `"Joel 2:13 (NVI)"`, `"Efesios 2:11-22 (NVI)"`. This single value is both the
 * entry's `internalName` (the `bibleVerse` displayField) AND the key the publisher
 * upserts on. Built from the structured passage + es version (never the per-sermon
 * slug): the SAME passage across sermons yields the SAME key (reuse), and a different
 * translation (RVR1960 vs NVI) yields a DIFFERENT key (never collided). Use full,
 * canonical Spanish book names so keys match. See `docs/predica-bibleverse-reuse.md`.
 */
export function buildBibleVerseInternalName(ref: SermonScriptureRef): string {
  const verses = ref.toVerse ? `${ref.fromVerse}-${ref.toVerse}` : ref.fromVerse;
  return `${ref["es-AR"].book} ${ref.chapter}:${verses} (${ref["es-AR"].bibleVersion})`;
}

/** Build the `fields` payload for a single bilingual `bibleVerse` entry. */
export function buildBibleVerseFields(ref: SermonScriptureRef): Record<string, LocalizedField> {
  const fields: Record<string, LocalizedField> = {
    internalName: atDefault(buildBibleVerseInternalName(ref)),
    chapter: atDefault(ref.chapter),
    fromVerse: atDefault(ref.fromVerse),
    book: { "es-AR": ref["es-AR"].book, "en-US": ref["en-US"].book },
    verseContent: {
      "es-AR": ref["es-AR"].verseContent,
      "en-US": ref["en-US"].verseContent,
    },
    bibleVersion: {
      "es-AR": ref["es-AR"].bibleVersion,
      "en-US": ref["en-US"].bibleVersion,
    },
  };
  if (ref.toVerse) {
    fields.toVerse = atDefault(ref.toVerse);
  }
  return fields;
}

/**
 * Build the localized `fields` payload for the DRAFT `sermon` entry. Link fields
 * are included only when their id was resolved, so an audio-only or
 * featuredImage-deferred draft is still valid (required fields are enforced by
 * Contentful only on PUBLISH — the human's Gate-2 step).
 *
 * `options.slug` overrides `sermon.slug` for the entry — used when the publisher
 * detects a slug collision and bumps it (`-2`, `-3`, …), so the entry's slug stays
 * in sync with the WhatsApp canonical URL that uses the same bumped value.
 */
export function buildSermonEntryFields(
  sermon: SermonDocument,
  links: ResolvedLinks,
  options: { slug?: string } = {},
): Record<string, LocalizedField> {
  const fields: Record<string, LocalizedField> = {};

  // Non-localized (default-locale-keyed)
  fields.internalName = atDefault(sermon.internalName);
  fields.slug = atDefault(options.slug ?? sermon.slug);
  fields.sermonDate = atDefault(sermon.sermonDate);
  if (typeof sermon.durationSeconds === "number") {
    fields.durationSeconds = atDefault(sermon.durationSeconds);
  }
  fields.preacher = atDefault(entryLink(links.preacherId));
  if (links.additionalPreacherIds?.length) {
    fields.additionalPreachers = atDefault(links.additionalPreacherIds.map(entryLink));
  }
  if (links.scriptureRefIds?.length) {
    fields.scriptureReferences = atDefault(links.scriptureRefIds.map(entryLink));
  }
  if (links.featuredImageAssetId) {
    fields.featuredImage = atDefault(assetLink(links.featuredImageAssetId));
  }
  if (links.audioAssetId) {
    fields.audio = atDefault(assetLink(links.audioAssetId));
  }

  // Localized text (both locales)
  fields.title = localizedFrom(sermon, (l) => l.title);
  fields.thesis = localizedFrom(sermon, (l) => l.thesis);
  fields.mainPoints = localizedFrom(sermon, (l) => l.mainPoints);
  fields.excerpt = localizedFrom(sermon, (l) => l.excerpt);
  fields.seoTitle = localizedFrom(sermon, (l) => l.seoTitle);
  fields.seoDescription = localizedFrom(sermon, (l) => l.seoDescription);
  fields.keywords = localizedFrom(sermon, (l) => l.keywords);
  fields.content = localizedFrom(sermon, (l) => blocksToRichTextDocument(l.content));

  // Localized pdfSummary links (es-AR PDF → es-AR, en-US PDF → en-US)
  const pdfIds = links.pdfAssetIds ?? {};
  const pdfField: LocalizedField = {};
  for (const locale of PREDICA_LOCALES) {
    const id = pdfIds[locale];
    if (id) {
      pdfField[locale] = assetLink(id);
    }
  }
  if (Object.keys(pdfField).length > 0) {
    fields.pdfSummary = pdfField;
  }

  return fields;
}
