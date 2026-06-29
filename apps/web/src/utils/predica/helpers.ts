/**
 * Pure helper functions for the sermon PDF generator.
 *
 * These are kept in src/ so Vitest can import them as TypeScript.
 * The Node ESM script at .claude/scripts/predica/build-predica-pdf.mjs
 * re-exports an equivalent JS implementation — keep the two in sync.
 *
 * All functions are pure (no side effects, no Playwright, no filesystem I/O).
 *
 * ── Single-source content model ──────────────────────────────────────────────
 * The PDF renders the SAME body the reader/preacher sees and edits on the website
 * (`SermonDetails.tsx`): the localized rich-text `content[]` plus the structured
 * `scriptureReferences`. There is no separately-authored PDF summary anymore — the
 * post body IS the PDF body, so the two can never drift and a Contentful edit can
 * regenerate the PDF. `thesis`/`mainPoints`/SEO live on the entry as metadata, not
 * in the PDF. See docs/predica-pdf-mirrors-post.md.
 */

import type { ContentBlock, SermonScriptureRef } from "./sermonEntry";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Per-locale content for a single sermon — the post body the PDF mirrors. */
export interface SermonLocaleData {
  title: string;
  /** The localized post body (same blocks rendered on the website). */
  content: ContentBlock[];
}

/** Fields shared across both locales (from the top-level sermon.json). */
export interface SermonCommon {
  slug: string;
  sermonDate: string; // YYYY-MM-DD
  preacher: string;
  /** Co-preachers for a multi-preacher service; the byline renders all of them. */
  additionalPreachers?: string[];
  serviceLabel?: { "es-AR": string; "en-US": string };
  /** Structured scripture references → the PDF's "Scripture references" section. */
  scriptureReferences?: SermonScriptureRef[];
  /** Pre-inlined logo as a base64 data URI, e.g. "data:image/png;base64,..." */
  logoDataUri?: string;
}

/** Supported locale identifiers. */
export type SupportedLocale = "es-AR" | "en-US";

// ── Section label maps ────────────────────────────────────────────────────────

const LABELS = {
  "es-AR": {
    eyebrowSep: "·",
    preacher: "Predicó",
    scripture: "Referencias bíblicas",
    footer: "Iglesia de Cristo Redentor",
    defaultService: "Culto dominical",
    // Fixed, localized version label (mirrors the site's t("bibleVersion")) —
    // shown instead of each verse's stored code (e.g. "RVR1960").
    bibleVersion: "NVI",
  },
  "en-US": {
    eyebrowSep: "·",
    preacher: "Preached by",
    scripture: "Scripture references",
    footer: "Iglesia de Cristo Redentor",
    defaultService: "Sunday service",
    bibleVersion: "NIV",
  },
} as const satisfies Record<SupportedLocale, Record<string, string>>;

// ── escapeHtml ────────────────────────────────────────────────────────────────

/**
 * Escape all HTML special characters so dynamic sermon content cannot break
 * layout or introduce injection vectors when interpolated into the HTML template.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── formatSermonDate ──────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string for the sermon cover.
 *
 * - es-AR → "7 de junio de 2026"
 * - en-US → "June 7, 2026"
 *
 * Uses Intl.DateTimeFormat with timeZone: "UTC" to avoid local-time day shifts.
 */
export function formatSermonDate(dateStr: string, locale: SupportedLocale): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Construct via UTC components to prevent timezone-induced off-by-one days.
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

// ── Content body ──────────────────────────────────────────────────────────────

/**
 * Render the writer's content blocks to branded HTML, mirroring the website body
 * (`SermonContent`): h2/h3/p/blockquote and ordered/unordered lists. `embeddedAsset`
 * blocks (interactive per-segment audio/PDF players in multi-preacher posts) are
 * skipped — they are meaningless in a printed PDF.
 */
export function renderContentBlocks(blocks: ContentBlock[]): string {
  const e = escapeHtml;
  return blocks
    .map((block) => {
      switch (block.type) {
        case "h2":
          return `<h2>${e(block.text ?? "")}</h2>`;
        case "h3":
          return `<h3>${e(block.text ?? "")}</h3>`;
        case "p":
          return `<p>${e(block.text ?? "")}</p>`;
        case "blockquote":
          return `<blockquote>${e(block.text ?? "")}</blockquote>`;
        case "ul":
          return `<ul>\n        ${(block.items ?? [])
            .map((i) => `<li>${e(i)}</li>`)
            .join("\n        ")}\n      </ul>`;
        case "ol":
          return `<ol>\n        ${(block.items ?? [])
            .map((i) => `<li>${e(i)}</li>`)
            .join("\n        ")}\n      </ol>`;
        case "embeddedAsset":
          return ""; // interactive players are dropped in print
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n      ");
}

/**
 * Render the structured scripture references section, mirroring the website's
 * `ScriptureReferences`: a per-locale "<book> <ch>:<from>[-<to>] (<NVI|NIV>)" line
 * with the verse text as a quote. Uses the FIXED localized version label, not each
 * verse's stored code. Returns "" when there are no references.
 */
export function renderScriptureReferences(
  refs: SermonScriptureRef[] | undefined,
  locale: SupportedLocale,
): string {
  if (!refs || refs.length === 0) return "";
  const L = LABELS[locale];
  const e = escapeHtml;
  const items = refs
    .map((ref) => {
      const lv = ref[locale];
      const verseRange = ref.toVerse ? `${ref.fromVerse}-${ref.toVerse}` : ref.fromVerse;
      const refLine = `${lv.book} ${ref.chapter}:${verseRange} (${L.bibleVersion})`;
      const verse = lv.verseContent
        ? `\n          <blockquote class="verse">${e(lv.verseContent)}</blockquote>`
        : "";
      return `<li>\n          <span class="ref">${e(refLine)}</span>${verse}\n        </li>`;
    })
    .join("\n        ");
  return `
  <section class="scripture-refs">
    <h2>${e(L.scripture)}</h2>
    <ul>
        ${items}
    </ul>
  </section>`;
}

// ── buildPdfHtml ──────────────────────────────────────────────────────────────

/**
 * Build the full HTML document for one locale's sermon PDF.
 *
 * Mirrors the website sermon page section order: cover (logo · date · title ·
 * byline) → content body → scripture references → footer. All dynamic text goes
 * through escapeHtml(). Chromium print-to-PDF uses the @page rules in <style>.
 *
 * @param localeData  - The locale-specific post body (title + content[]).
 * @param common      - Shared metadata (date, preacher(s), scripture refs, logo).
 * @param locale      - Which locale to render ("es-AR" | "en-US").
 * @returns           A complete HTML document string ready for Playwright setContent().
 */
export function buildPdfHtml(
  localeData: SermonLocaleData,
  common: SermonCommon,
  locale: SupportedLocale,
): string {
  const L = LABELS[locale];
  const formattedDate = formatSermonDate(common.sermonDate, locale);
  const serviceLabel = common.serviceLabel?.[locale] ?? L.defaultService;

  // All dynamic text goes through escapeHtml
  const e = escapeHtml;
  const title = e(localeData.title);
  const eyebrow = e(`${formattedDate} ${L.eyebrowSep} ${serviceLabel}`);
  const byline = e([common.preacher, ...(common.additionalPreachers ?? [])].join(" · "));

  const bodyHtml = renderContentBlocks(localeData.content ?? []);
  const scriptureHtml = renderScriptureReferences(common.scriptureReferences, locale);

  const logoHtml = common.logoDataUri
    ? `<img src="${common.logoDataUri}" alt="Logo Iglesia de Cristo Redentor" class="logo" />`
    : `<p class="logo-fallback">Iglesia de Cristo Redentor</p>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap"
    rel="stylesheet"
  />
  <style>
    /* ── Print page setup ── */
    @page {
      size: A4;
      margin: 18mm 17mm;
    }

    /* ── Brand palette ── */
    :root {
      --color-primary:    #0070B3;
      --color-sand:       #EBE2D6;
      --color-slate:      #0F1729;
      --color-bg:         #FFFFFF;
      --color-muted:      #647488;
      --color-border:     #E2E8F0;
      --color-accent:     #C05A2A; /* warm terracotta for verse / quote accent */
    }

    /* ── Base ── */
    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--color-bg);
      color: var(--color-slate);
      font-family: 'Outfit', Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Headings ── */
    h1, h2, h3 {
      font-family: 'Playfair Display', Georgia, serif;
      margin: 0 0 0.5em;
      line-height: 1.2;
    }

    h1 { font-size: 26pt; font-weight: 700; color: var(--color-slate); }
    h2 { font-size: 14pt; font-weight: 600; color: var(--color-primary); margin-top: 1.5em; }
    h3 { font-size: 11.5pt; font-weight: 600; color: var(--color-slate); margin-top: 1.2em; }

    /* ── Cover ── */
    .cover {
      text-align: center;
      padding: 2em 0 1.5em;
      break-after: avoid;
    }

    .logo {
      max-width: 120px;
      height: auto;
      margin-bottom: 1.5em;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .logo-fallback {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14pt;
      color: var(--color-primary);
      margin-bottom: 1.5em;
    }

    .eyebrow {
      font-family: 'Outfit', Arial, sans-serif;
      font-size: 8pt;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-muted);
      margin-bottom: 0.75em;
    }

    .cover h1 {
      margin-bottom: 0.3em;
    }

    .preacher-line {
      font-size: 9.5pt;
      color: var(--color-muted);
      margin-top: 0.5em;
    }

    .preacher-label {
      font-weight: 600;
    }

    hr.cover-rule {
      border: none;
      border-top: 1.5px solid var(--color-border);
      margin: 1.5em auto;
      width: 60%;
    }

    /* ── Body (mirrors the website sermon body) ── */
    .body {
      margin-top: 0.5em;
    }

    p {
      margin: 0 0 0.75em;
    }

    .body blockquote {
      border-left: 3px solid var(--color-accent);
      margin: 0.8em 0;
      padding: 0.4em 0.95em;
      font-style: italic;
      font-family: 'Playfair Display', Georgia, serif;
      color: var(--color-slate);
      break-inside: avoid;
    }

    .body ul, .body ol {
      margin: 0.4em 0 0.9em;
      padding-left: 1.5em;
    }

    .body li {
      margin-bottom: 0.35em;
      break-inside: avoid;
    }

    /* ── Scripture references ── */
    .scripture-refs {
      margin-top: 1.8em;
    }

    .scripture-refs ul {
      list-style: none;
      margin: 0.4em 0 0;
      padding: 0;
    }

    .scripture-refs li {
      margin-bottom: 0.7em;
      break-inside: avoid;
    }

    .scripture-refs .ref {
      display: block;
      font-size: 9.5pt;
      font-weight: 600;
      color: var(--color-slate);
    }

    .scripture-refs .verse {
      border-left: 2px solid var(--color-primary);
      margin: 0.25em 0 0;
      padding: 0.1em 0.7em;
      font-size: 9.5pt;
      font-style: italic;
      color: var(--color-muted);
    }

    /* ── Footer signature ── */
    .footer-sig {
      text-align: center;
      margin-top: 2.5em;
      padding-top: 1em;
      border-top: 1px solid var(--color-border);
      font-size: 9pt;
      color: var(--color-muted);
      letter-spacing: 0.05em;
      break-inside: avoid;
    }
  </style>
</head>
<body>

  <!-- ── Cover ── -->
  <div class="cover">
    ${logoHtml}
    <p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1>
    <p class="preacher-line">
      <span class="preacher-label">${e(L.preacher)}:</span> ${byline}
    </p>
    <hr class="cover-rule" />
  </div>

  <!-- ── Body ── -->
  <main class="body">
      ${bodyHtml}
  </main>
  ${scriptureHtml}

  <!-- ── Footer signature ── -->
  <div class="footer-sig">
    ${e(L.footer)}
  </div>

</body>
</html>`;
}
