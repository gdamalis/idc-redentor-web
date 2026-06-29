/**
 * Unit tests for the sermon PDF generator pure helpers.
 * Exercises escapeHtml, formatSermonDate, and buildPdfHtml without invoking Playwright.
 *
 * The PDF mirrors the website post body: cover → content[] body → scripture
 * references → footer (see helpers.ts / docs/predica-pdf-mirrors-post.md).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { escapeHtml, formatSermonDate, buildPdfHtml } from "@src/utils/predica/helpers";
import type { SermonCommon, SermonLocaleData } from "@src/utils/predica/helpers";
import type { ContentBlock, SermonScriptureRef } from "@src/utils/predica/sermonEntry";

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("leaves plain text untouched", () => {
    expect(escapeHtml("Hello world")).toBe("Hello world");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("bread & wine")).toBe("bread &amp; wine");
  });

  it("escapes less-than and greater-than", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes single quotes / apostrophes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("handles all special chars together", () => {
    expect(escapeHtml(`<b class="x">a&b</b>`)).toBe(
      "&lt;b class=&quot;x&quot;&gt;a&amp;b&lt;/b&gt;",
    );
  });

  it("returns an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes text that could break layout via injection", () => {
    const injection = `</div><script>alert(1)</script>`;
    const escaped = escapeHtml(injection);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).toContain("&lt;");
    expect(escaped).toContain("&gt;");
  });
});

// ── formatSermonDate ──────────────────────────────────────────────────────────

describe("formatSermonDate", () => {
  it("formats a date in es-AR as Spanish long form (7 de junio de 2026)", () => {
    const result = formatSermonDate("2026-06-07", "es-AR");
    expect(result).toMatch(/7/);
    expect(result.toLowerCase()).toMatch(/junio/);
    expect(result).toMatch(/2026/);
  });

  it("formats a date in en-US as English long form (June 7, 2026)", () => {
    const result = formatSermonDate("2026-06-07", "en-US");
    expect(result).toMatch(/June/i);
    expect(result).toMatch(/7/);
    expect(result).toMatch(/2026/);
  });

  it("produces different output for the two locales", () => {
    const es = formatSermonDate("2026-06-07", "es-AR");
    const en = formatSermonDate("2026-06-07", "en-US");
    expect(es).not.toBe(en);
  });

  it("handles a date at month/year boundary correctly (December 31)", () => {
    const result = formatSermonDate("2025-12-31", "en-US");
    expect(result).toMatch(/December/i);
    expect(result).toMatch(/31/);
    expect(result).toMatch(/2025/);
  });
});

// ── buildPdfHtml ──────────────────────────────────────────────────────────────

// Stored bibleVersion is deliberately a non-NVI/NIV code to prove the PDF shows
// the FIXED localized label (NVI / NIV), mirroring the website ScriptureReferences.
const SCRIPTURE_FIXTURE: SermonScriptureRef[] = [
  {
    chapter: "2",
    fromVerse: "11",
    toVerse: "22",
    "es-AR": { book: "Efesios", verseContent: "Por tanto, recuerden ustedes...", bibleVersion: "RVR1960" },
    "en-US": { book: "Ephesians", verseContent: "Therefore, remember that...", bibleVersion: "ESV" },
  },
];

const COMMON_FIXTURE: SermonCommon = {
  slug: "test-sermon",
  sermonDate: "2026-06-07",
  preacher: "Jonathan Hanegan",
  additionalPreachers: ["Gabriel Damalis", "Eric Prato"],
  serviceLabel: { "es-AR": "Culto dominical", "en-US": "Sunday service" },
  scriptureReferences: SCRIPTURE_FIXTURE,
  logoDataUri: "data:image/png;base64,iVBORw0KGgo=",
};

const ES_LOCALE_DATA: SermonLocaleData = {
  title: "El amor que derriba muros",
  content: [
    { type: "h2", text: "La división humana" },
    { type: "p", text: "Dios reconcilia a toda la humanidad." },
    { type: "blockquote", text: "«Porque él es nuestra paz» — Efesios 2:14 (NVI)" },
    { type: "h3", text: "El llamado a la unidad" },
    { type: "ul", items: ["Primera idea", "Segunda idea"] },
    { type: "embeddedAsset", assetId: "AUDIO_ASSET_1" },
  ],
};

const EN_LOCALE_DATA: SermonLocaleData = {
  title: "The love that breaks down walls",
  content: [
    { type: "h2", text: "Human division" },
    { type: "p", text: "God reconciles all of humanity." },
    { type: "blockquote", text: "“For he himself is our peace” — Ephesians 2:14 (NIV)" },
    { type: "ol", items: ["First idea", "Second idea"] },
  ],
};

describe("buildPdfHtml — es-AR", () => {
  let html: string;

  beforeEach(() => {
    html = buildPdfHtml(ES_LOCALE_DATA, COMMON_FIXTURE, "es-AR");
  });

  it("returns a non-empty HTML string", () => {
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
  });

  it("renders a white page background (no gray content area)", () => {
    expect(html).toMatch(/--color-bg:\s*#FFFFFF/i);
    expect(html).not.toContain("#F8FAFB");
  });

  it("includes the escaped sermon title", () => {
    expect(html).toContain("El amor que derriba muros");
  });

  it("renders the content body blocks (h2/p/blockquote/h3/list)", () => {
    expect(html).toContain("<h2>La división humana</h2>");
    expect(html).toContain("<p>Dios reconcilia a toda la humanidad.</p>");
    expect(html).toContain("<blockquote>«Porque él es nuestra paz» — Efesios 2:14 (NVI)</blockquote>");
    expect(html).toContain("<h3>El llamado a la unidad</h3>");
    expect(html).toContain("<li>Primera idea</li>");
    expect(html).toContain("<li>Segunda idea</li>");
  });

  it("omits embeddedAsset blocks (interactive players are dropped in print)", () => {
    expect(html).not.toContain("AUDIO_ASSET_1");
    expect(html).not.toContain("embedded-asset");
  });

  it("renders scripture references with the fixed NVI label and verse text", () => {
    expect(html).toContain("Efesios 2:11-22 (NVI)");
    expect(html).toContain("Por tanto, recuerden ustedes...");
    // Never the stored per-verse code.
    expect(html).not.toContain("RVR1960");
  });

  it("renders the full byline including co-preachers, joined by ' · '", () => {
    expect(html).toContain("Jonathan Hanegan · Gabriel Damalis · Eric Prato");
  });

  it("uses Spanish labels (Predicó, Referencias bíblicas) and drops the old summary sections", () => {
    expect(html).toMatch(/Predicó/);
    expect(html).toMatch(/Referencias bíblicas/i);
    expect(html).not.toMatch(/Tesis/);
    expect(html).not.toMatch(/Puntos principales/);
    expect(html).not.toMatch(/Citas clave/);
  });

  it("includes the formatted date in Spanish long form and the service label", () => {
    expect(html.toLowerCase()).toMatch(/junio/);
    expect(html).toMatch(/2026/);
    expect(html).toContain("Culto dominical");
  });

  it("includes the logo as a data URI img tag", () => {
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("includes the Iglesia de Cristo Redentor footer signature", () => {
    expect(html).toContain("Iglesia de Cristo Redentor");
  });

  it("escapes HTML-special characters in the title", () => {
    const injected = buildPdfHtml(
      { ...ES_LOCALE_DATA, title: '<script>alert("xss")</script>' },
      COMMON_FIXTURE,
      "es-AR",
    );
    expect(injected).not.toContain("<script>alert");
    expect(injected).toContain("&lt;script&gt;");
  });

  it("escapes HTML-special characters inside content blocks", () => {
    const injectedContent: ContentBlock[] = [
      { type: "p", text: "A & B > C" },
      { type: "ul", items: ["Point with <b>tag</b>"] },
    ];
    const injected = buildPdfHtml(
      { ...ES_LOCALE_DATA, content: injectedContent },
      COMMON_FIXTURE,
      "es-AR",
    );
    expect(injected).toContain("A &amp; B &gt; C");
    expect(injected).not.toContain("<b>tag</b>");
    expect(injected).toContain("&lt;b&gt;tag&lt;/b&gt;");
  });

  it("omits the scripture section entirely when there are no references", () => {
    const noRefs = buildPdfHtml(ES_LOCALE_DATA, { ...COMMON_FIXTURE, scriptureReferences: [] }, "es-AR");
    expect(noRefs).not.toContain("Referencias bíblicas");
  });

  it("renders only the primary preacher when there are no co-preachers", () => {
    const solo = buildPdfHtml(ES_LOCALE_DATA, { ...COMMON_FIXTURE, additionalPreachers: undefined }, "es-AR");
    expect(solo).toContain("Jonathan Hanegan");
    expect(solo).not.toContain("Gabriel Damalis");
  });
});

describe("buildPdfHtml — en-US", () => {
  let html: string;

  beforeEach(() => {
    html = buildPdfHtml(EN_LOCALE_DATA, COMMON_FIXTURE, "en-US");
  });

  it("uses English labels (Preached by, Scripture references)", () => {
    expect(html).toMatch(/Preached by/i);
    expect(html).toMatch(/Scripture references/i);
  });

  it("includes the formatted date in English long form (June) and the service label", () => {
    expect(html).toMatch(/June/i);
    expect(html).toMatch(/2026/);
    expect(html).toContain("Sunday service");
  });

  it("renders the English title and content body", () => {
    expect(html).toContain("The love that breaks down walls");
    expect(html).toContain("<h2>Human division</h2>");
    expect(html).toContain("<p>God reconciles all of humanity.</p>");
    expect(html).toContain("<li>First idea</li>");
  });

  it("renders scripture references with the fixed NIV label and English book/verse", () => {
    expect(html).toContain("Ephesians 2:11-22 (NIV)");
    expect(html).toContain("Therefore, remember that...");
    expect(html).not.toContain("ESV");
  });
});
