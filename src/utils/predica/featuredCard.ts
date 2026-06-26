/**
 * Pure helper functions for the sermon FEATURED-IMAGE generator (the title card).
 *
 * Mirrors the helpers.ts ↔ build-predica-pdf.mjs convention: this TypeScript
 * module is the canonical, Vitest-tested source of truth; the Node ESM script at
 * .claude/scripts/predica/build-predica-featured.mjs carries a JS-compatible copy
 * of these pure functions so it runs directly under Node without a build step.
 *
 * All functions here are pure (no Playwright, no filesystem, no network).
 * The card itself is 1200×630 (Open Graph / featured-image dimensions), uses the
 * es-AR locale (featuredImage is a single asset keyed at the default locale), and
 * is rendered to PNG via Playwright by the runtime script.
 */

import { escapeHtml, formatSermonDate, type SupportedLocale } from "./helpers";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Output dimensions — Open Graph / social-card standard. */
export const FEATURED_WIDTH = 1200;
export const FEATURED_HEIGHT = 630;

/** Brand palette (kept in sync with helpers.ts / build-predica-pdf.mjs). */
export const BRAND = {
  primary: "#0070B3",
  sand: "#EBE2D6",
  slate: "#0F1729",
  bg: "#F8FAFB",
  muted: "#647488",
  border: "#E2E8F0",
  accent: "#C05A2A", // warm terracotta
} as const;

const CARD_LABELS = {
  "es-AR": { kicker: "PRÉDICA", sep: "·" },
  "en-US": { kicker: "SERMON", sep: "·" },
} as const satisfies Record<SupportedLocale, { kicker: string; sep: string }>;

// ── Scripture helpers ───────────────────────────────────────────────────────

/**
 * Strip a trailing bible-version parenthetical so the card meta line stays short.
 * "Efesios 2:11-22 (RVR1960)" → "Efesios 2:11-22"
 */
export function stripScriptureVersion(ref: string): string {
  return ref.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Pick a short primary scripture reference for the card meta line from a locale's
 * `scriptureRefs` array (the first non-empty entry, version parenthetical removed).
 * Returns undefined when there is nothing usable.
 */
export function pickPrimaryScripture(
  localeData?: { scriptureRefs?: unknown } | null,
): string | undefined {
  const refs = localeData?.scriptureRefs;
  if (!Array.isArray(refs)) return undefined;
  const first = refs.find(
    (r): r is string => typeof r === "string" && r.trim().length > 0,
  );
  return first ? stripScriptureVersion(first) : undefined;
}

// ── Image-generation brief ──────────────────────────────────────────────────

export interface ImageBriefInput {
  title: string;
  thesis?: string;
  scripture?: string;
}

/**
 * Compose the text prompt sent to the image model for the card background.
 *
 * Church-appropriate guardrails are baked in: non-figurative, no text, and no
 * depiction of God/Jesus/the Spirit/angels/faces. The human review gate is the
 * final safety check on every generated image.
 */
export function composeImageBrief({
  title,
  thesis,
  scripture,
}: ImageBriefInput): string {
  const theme = [title, thesis, scripture]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" — ");

  return [
    `An abstract, atmospheric, fine-art background image evoking the theme: "${theme}".`,
    "Mood: reverent, hopeful, contemplative, sacred.",
    `Palette: deep ocean blue (${BRAND.primary}), warm sand (${BRAND.sand}), soft slate (${BRAND.slate}), gentle warm light.`,
    "Style: cinematic, painterly, soft focus, subtle film grain, generous negative space.",
    "Composition: wide 16:9 landscape; a horizon or a single soft light source; natural textures (light, water, sky, stone, fields, fabric).",
    "Hard requirements:",
    "- NO text, words, letters, numbers, or typography of any kind.",
    "- NO depiction of God, Jesus, the Holy Spirit, angels, saints, or any human faces or figures.",
    "- NO crosses or religious icons as a focal subject; no religious kitsch; no logos; no watermarks.",
    "- Non-figurative and environmental only; keep the lower-left third calm and uncluttered for an overlaid title.",
  ].join("\n");
}

// ── Title sizing ──────────────────────────────────────────────────────────────

/**
 * Pick a title font-size (px) that keeps a 2-line clamp legible as the title
 * grows. Tuned for the ~980px text column at 1200×630.
 */
export function titleFontSize(title: string): number {
  const n = title.trim().length;
  if (n <= 28) return 76;
  if (n <= 44) return 64;
  if (n <= 64) return 54;
  if (n <= 90) return 46;
  return 40;
}

// ── Card HTML builder ─────────────────────────────────────────────────────────

export interface FeaturedCardData {
  title: string;
  sermonDate: string; // YYYY-MM-DD
  preacher?: string;
  scripture?: string;
  /** Light church logo as a base64 data URI; falls back to wordmark text. */
  logoDataUri?: string;
  /** AI background as a base64 data URI; when absent, a brand gradient is used. */
  backgroundDataUri?: string;
}

/**
 * Build the complete 1200×630 HTML document for the featured card.
 *
 * Layered: background (AI image or brand gradient) → dark scrim for legibility →
 * content (logo, eyebrow, title, rule, meta). All dynamic text is escaped.
 */
export function buildFeaturedCardHtml(
  data: FeaturedCardData,
  locale: SupportedLocale,
): string {
  const L = CARD_LABELS[locale];
  const e = escapeHtml;

  const formattedDate = formatSermonDate(data.sermonDate, locale);
  const eyebrow = e(`${L.kicker} ${L.sep} ${formattedDate}`).toUpperCase();
  const title = e(data.title);
  const fontSize = titleFontSize(data.title);

  const metaParts: string[] = [];
  if (data.scripture?.trim()) metaParts.push(e(data.scripture.trim()));
  if (data.preacher?.trim()) metaParts.push(e(data.preacher.trim()));
  const metaHtml =
    metaParts.length > 0
      ? `<p class="meta">${metaParts.join(`<span class="sep">${L.sep}</span>`)}</p>`
      : "";

  const logoHtml = data.logoDataUri
    ? `<img src="${data.logoDataUri}" alt="Iglesia de Cristo Redentor" class="logo" />`
    : `<p class="logo-fallback">Iglesia de Cristo Redentor</p>`;

  // Background: AI image (cover) or the on-brand gradient fallback.
  const bgHtml = data.backgroundDataUri
    ? `<div class="bg" style="background-image:url('${data.backgroundDataUri}')"></div>`
    : `<div class="bg bg--fallback"></div>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Outfit:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
  <style>
    :root {
      --color-primary: ${BRAND.primary};
      --color-sand:    ${BRAND.sand};
      --color-slate:   ${BRAND.slate};
      --color-accent:  ${BRAND.accent};
    }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      width: ${FEATURED_WIDTH}px;
      height: ${FEATURED_HEIGHT}px;
      overflow: hidden;
      font-family: 'Outfit', Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .card {
      position: relative;
      width: ${FEATURED_WIDTH}px;
      height: ${FEATURED_HEIGHT}px;
      background: var(--color-slate);
      color: #ffffff;
      overflow: hidden;
    }

    .bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
    }

    /* On-brand fallback when there is no AI background. */
    .bg--fallback {
      background:
        radial-gradient(120% 130% at 82% -10%, rgba(0, 112, 179, 0.55), transparent 60%),
        linear-gradient(135deg, #0F1729 0%, #0A2A44 55%, #0070B3 125%);
    }

    /* Scrim: left + bottom darkening so white text passes contrast on any image. */
    .scrim {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(15, 23, 41, 0.86) 0%, rgba(15, 23, 41, 0.46) 46%, rgba(15, 23, 41, 0.12) 100%),
        linear-gradient(0deg, rgba(15, 23, 41, 0.88) 0%, rgba(15, 23, 41, 0.12) 46%, transparent 72%);
    }

    .content {
      position: absolute;
      inset: 0;
      padding: 64px 72px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .logo { height: 64px; width: auto; }

    .logo-fallback {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 26px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
    }

    .body { max-width: 980px; }

    .eyebrow {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.22em;
      color: var(--color-sand);
      margin: 0 0 18px;
    }

    .title {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: ${fontSize}px;
      line-height: 1.08;
      margin: 0;
      color: #ffffff;
      text-shadow: 0 2px 24px rgba(0, 0, 0, 0.35);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .rule {
      width: 84px;
      height: 4px;
      background: var(--color-accent);
      border: 0;
      border-radius: 2px;
      margin: 24px 0 18px;
    }

    .meta {
      font-size: 22px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.92);
      margin: 0;
    }

    .meta .sep { color: var(--color-sand); padding: 0 10px; }
  </style>
</head>
<body>
  <div class="card">
    ${bgHtml}
    <div class="scrim"></div>
    <div class="content">
      <div class="head">
        ${logoHtml}
      </div>
      <div class="body">
        <p class="eyebrow">${eyebrow}</p>
        <h1 class="title">${title}</h1>
        <hr class="rule" />
        ${metaHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
}
