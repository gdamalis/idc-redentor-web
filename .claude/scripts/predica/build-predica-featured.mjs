#!/usr/bin/env node
/**
 * build-predica-featured.mjs — Branded sermon FEATURED-IMAGE generator (title card).
 *
 * Reads a structured sermon.json and renders ONE 1200×630 PNG card showing the
 * sermon title + date in the website's visual style, for use as the Contentful
 * `featuredImage` (also the Open Graph / social card). The card is:
 *
 *   1. An AI-generated, non-figurative, atmospheric BACKGROUND (Google Gemini),
 *      themed to the sermon, in the brand palette — generated via plain REST.
 *   2. A crisp branded TEXT OVERLAY (logo + eyebrow + Playfair title + scripture/
 *      preacher) rendered on top via Playwright headless-Chromium screenshot.
 *
 * If no API key is configured, the AI call fails, or --no-ai is passed, it falls
 * back to a pure typographic card on an on-brand gradient — so the pipeline never
 * breaks. The image lands on a DRAFT entry; a human approves/replaces it at Gate 2.
 *
 * Usage:
 *   node .claude/scripts/predica/build-predica-featured.mjs <path-to-sermon.json> [options]
 *
 * Options:
 *   --out <dir>        Output dir (default: directory of the input sermon.json)
 *   --prompt "<txt>"   Override the auto-derived image brief (per-sermon creativity)
 *   --no-ai            Skip the AI background; render the typographic fallback card
 *   --regenerate       Ignore any cached featured.bg.png and re-roll the AI image
 *   --provider <name>  Image provider (only "gemini" is supported)
 *   --model <name>     Gemini image model (default: gemini-2.5-flash-image)
 *
 * Output:
 *   <outDir>/featured.png      the 1200×630 card
 *   <outDir>/featured.bg.png   the raw AI background (cached for re-renders; AI path only)
 *   stdout: a single JSON line { ok, featured, background, usedAi, fallback }
 *
 * Exit codes:
 *   0  card written (with or without the AI background)
 *   2  usage / input error (bad args, unreadable/invalid JSON, schema violation)
 *   1  render failure (even the fallback card could not be produced)
 *
 * Auth: reads GEMINI_API_KEY from the environment; if absent, parses .env.local at
 * the repo root. The key NAME only is referenced — never printed. No key → fallback.
 *
 * The pure helpers below are the JS twin of src/utils/predica/featuredCard.ts
 * (TypeScript, Vitest-tested) — kept in sync by hand so this file runs directly
 * under Node ESM without a build step (same convention as build-predica-pdf.mjs).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { escapeHtml, formatSermonDate } from "./build-predica-pdf.mjs";

// ── Constants (mirror featuredCard.ts) ─────────────────────────────────────────

const FEATURED_WIDTH = 1200;
const FEATURED_HEIGHT = 630;

const BRAND = {
  primary: "#0070B3",
  sand: "#EBE2D6",
  slate: "#0F1729",
  bg: "#F8FAFB",
  muted: "#647488",
  border: "#E2E8F0",
  accent: "#C05A2A",
};

const CARD_LABELS = {
  "es-AR": { kicker: "PRÉDICA", sep: "·" },
  "en-US": { kicker: "SERMON", sep: "·" },
};

// ── Pure helpers (twin of featuredCard.ts) ─────────────────────────────────────

/** Strip a trailing bible-version parenthetical: "Efesios 2:14 (RVR1960)" → "Efesios 2:14". */
export function stripScriptureVersion(ref) {
  return ref.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** First usable short scripture ref from a locale's scriptureRefs array (or undefined). */
export function pickPrimaryScripture(localeData) {
  const refs = localeData?.scriptureRefs;
  if (!Array.isArray(refs)) return undefined;
  const first = refs.find((r) => typeof r === "string" && r.trim().length > 0);
  return first ? stripScriptureVersion(first) : undefined;
}

/** Compose the AI image brief with church-appropriate guardrails baked in. */
export function composeImageBrief({ title, thesis, scripture }) {
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

/** Title font-size (px) that keeps a 2-line clamp legible as the title grows. */
export function titleFontSize(title) {
  const n = title.trim().length;
  if (n <= 28) return 76;
  if (n <= 44) return 64;
  if (n <= 64) return 54;
  if (n <= 90) return 46;
  return 40;
}

/** Build the full 1200×630 card HTML document. */
export function buildFeaturedCardHtml(data, locale) {
  const L = CARD_LABELS[locale];
  const e = escapeHtml;

  const formattedDate = formatSermonDate(data.sermonDate, locale);
  const eyebrow = e(`${L.kicker} ${L.sep} ${formattedDate}`).toUpperCase();
  const title = e(data.title);
  const fontSize = titleFontSize(data.title);

  const metaParts = [];
  if (data.scripture?.trim()) metaParts.push(e(data.scripture.trim()));
  if (data.preacher?.trim()) metaParts.push(e(data.preacher.trim()));
  const metaHtml =
    metaParts.length > 0
      ? `<p class="meta">${metaParts.join(`<span class="sep">${L.sep}</span>`)}</p>`
      : "";

  const logoHtml = data.logoDataUri
    ? `<img src="${data.logoDataUri}" alt="Iglesia de Cristo Redentor" class="logo" />`
    : `<p class="logo-fallback">Iglesia de Cristo Redentor</p>`;

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

    .bg--fallback {
      background:
        radial-gradient(120% 130% at 82% -10%, rgba(0, 112, 179, 0.55), transparent 60%),
        linear-gradient(135deg, #0F1729 0%, #0A2A44 55%, #0070B3 125%);
    }

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

// ── CLI / IO helpers ────────────────────────────────────────────────────────

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

function log(msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
}

/** Load an env var from process.env or, failing that, .env.local at/above cwd. */
async function loadEnvVar(name) {
  if (process.env[name]) return process.env[name];
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const p = path.join(dir, ".env.local");
    if (existsSync(p)) {
      const text = await readFile(p, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`));
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const DEFAULT_LOCALE = "es-AR";

/** Validate the subset of sermon.json the card needs. Returns error strings (empty = ok). */
function validateSermon(raw) {
  const errs = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["Root must be a JSON object."];
  const s = raw;
  if (typeof s.slug !== "string" || !s.slug.trim()) errs.push("slug: required string");
  if (typeof s.sermonDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.sermonDate))
    errs.push("sermonDate: required YYYY-MM-DD string");
  if (typeof s.preacher !== "string" || !s.preacher.trim()) errs.push("preacher: required string");
  const loc = s.locales?.[DEFAULT_LOCALE];
  if (!loc || typeof loc !== "object") errs.push(`locales.${DEFAULT_LOCALE}: required object`);
  else if (typeof loc.title !== "string" || !loc.title.trim())
    errs.push(`locales.${DEFAULT_LOCALE}.title: required non-empty string`);
  return errs;
}

/** Derive a short scripture string from the es-AR locale (refs array, else structured). */
function deriveScripture(sermon) {
  const fromRefs = pickPrimaryScripture(sermon.locales?.[DEFAULT_LOCALE]);
  if (fromRefs) return fromRefs;
  const sr = Array.isArray(sermon.scriptureReferences) ? sermon.scriptureReferences[0] : undefined;
  if (sr && typeof sr === "object") {
    const loc = sr[DEFAULT_LOCALE] ?? sr;
    const book = loc.book ?? sr.book;
    const chapter = sr.chapter ?? loc.chapter;
    const from = sr.fromVerse ?? loc.fromVerse;
    const to = sr.toVerse ?? loc.toVerse;
    if (book && chapter != null && from != null) {
      return `${book} ${chapter}:${from}${to != null ? `-${to}` : ""}`;
    }
  }
  return undefined;
}

/** Read the light church logo as a base64 data URI (falls back to the primary logo, then null). */
async function loadLogoDataUri() {
  const candidates = [
    "../../../public/assets/img/redentor_logo_light.png",
    "../../../public/assets/img/redentor_logo.png",
  ];
  for (const rel of candidates) {
    try {
      const buf = await readFile(new URL(rel, import.meta.url));
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  log("WARNING: could not read a logo PNG — card will use the text wordmark");
  return null;
}

// ── Image generation (Google Gemini, REST, no SDK) ─────────────────────────────

/**
 * Generate a background image via the Gemini image model.
 * Returns { mime, buffer } or throws. See:
 *   https://ai.google.dev/gemini-api/docs/image-generation
 */
async function generateBackgroundGemini(brief, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: brief }] }],
      // Without an explicit aspect ratio, text-only image generation defaults to
      // 1:1 (square), which would then be center-cropped behind the 1200×630 card
      // and lose composition. 16:9 (1.78) is the closest supported ratio to the
      // card's 1.90 — CSS `cover` trims the small remainder. Field path is
      // generationConfig.imageConfig.aspectRatio (REST), not responseFormat.*.
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "16:9" },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p?.inlineData?.data);
  if (!img) throw new Error("Gemini returned no inline image data");
  return {
    mime: img.inlineData.mimeType ?? "image/png",
    buffer: Buffer.from(img.inlineData.data, "base64"),
  };
}

// ── Card renderer (Playwright screenshot) ──────────────────────────────────────

async function renderCard(html, outPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: FEATURED_WIDTH, height: FEATURED_HEIGHT });
    await page.setContent(html, { waitUntil: "networkidle" });
    // Ensure web fonts are loaded before snapshotting so Playfair/Outfit render.
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outPath, type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
}

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  const flags = new Set(["--no-ai", "--regenerate"]);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (flags.has(a)) {
      out[a.slice(2)] = true;
    } else if (a.startsWith("--")) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) die(2, `error: ${a} requires a value`);
      out[a.slice(2)] = v;
      i += 1;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function usage() {
  process.stderr.write(
    [
      "usage: node .claude/scripts/predica/build-predica-featured.mjs <sermon.json> [options]",
      "",
      "  --out <dir>       Output directory (default: directory of the input JSON)",
      "  --prompt <txt>    Override the auto-derived image brief",
      "  --no-ai           Skip the AI background; render the typographic fallback",
      "  --regenerate      Re-roll the AI image, ignoring any cached featured.bg.png",
      "  --provider <name> Image provider (only 'gemini' is supported)",
      "  --model <name>    Gemini model (default: gemini-2.5-flash-image)",
      "",
    ].join("\n"),
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    usage();
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const a = parseArgs(argv);
  const jsonPath = a._[0];
  if (!jsonPath) {
    usage();
    die(2, "error: a path to sermon.json is required");
  }

  const provider = a.provider ?? "gemini";
  if (provider !== "gemini") die(2, `error: unsupported --provider '${provider}' (only 'gemini')`);
  const model = a.model ?? "gemini-2.5-flash-image";

  const outDir = a.out ? path.resolve(a.out) : path.dirname(path.resolve(jsonPath));

  // Read + parse + validate sermon.json
  let sermon;
  try {
    sermon = JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (e) {
    die(2, `error: cannot read or parse '${jsonPath}': ${e.message}`);
  }
  const errs = validateSermon(sermon);
  if (errs.length > 0) {
    process.stderr.write("error: invalid sermon.json:\n");
    for (const err of errs) process.stderr.write(`  - ${err}\n`);
    process.exit(2);
  }

  await mkdir(outDir, { recursive: true });

  const localeData = sermon.locales[DEFAULT_LOCALE];
  const title = localeData.title;
  const scripture = deriveScripture(sermon);
  const cardData = {
    title,
    sermonDate: sermon.sermonDate,
    preacher: sermon.preacher,
    scripture,
    logoDataUri: await loadLogoDataUri(),
  };

  const bgPath = path.join(outDir, "featured.bg.png");
  const outPath = path.join(outDir, "featured.png");

  // ── Resolve the background: cache → AI → fallback ──
  let usedAi = false;
  let backgroundBuffer = null;

  if (!a["no-ai"]) {
    if (existsSync(bgPath) && !a.regenerate) {
      log(`using cached background: ${bgPath}`);
      backgroundBuffer = await readFile(bgPath);
      usedAi = true;
    } else {
      const apiKey = await loadEnvVar("GEMINI_API_KEY");
      if (!apiKey) {
        log("note: GEMINI_API_KEY not set — using the typographic fallback card");
      } else {
        const brief = a.prompt ?? composeImageBrief({ title, thesis: localeData.thesis, scripture });
        log(`generating background via ${model}...`);
        try {
          const { buffer } = await generateBackgroundGemini(brief, apiKey, model);
          await writeFile(bgPath, buffer);
          backgroundBuffer = buffer;
          usedAi = true;
          log(`  background written: ${bgPath}`);
        } catch (e) {
          log(`WARNING: image generation failed (${e.message}) — using the typographic fallback`);
        }
      }
    }
  } else {
    log("--no-ai: rendering the typographic fallback card");
  }

  if (backgroundBuffer) {
    cardData.backgroundDataUri = `data:image/png;base64,${backgroundBuffer.toString("base64")}`;
  }

  // ── Render the card ──
  const html = buildFeaturedCardHtml(cardData, DEFAULT_LOCALE);
  try {
    await renderCard(html, outPath);
    log(`  card written: ${outPath}`);
  } catch (e) {
    die(1, `render error: ${e.message ?? String(e)}`);
  }

  // Final machine-readable line on stdout (everything else went to stderr).
  process.stdout.write(
    JSON.stringify({
      ok: true,
      featured: outPath,
      background: usedAi ? bgPath : null,
      usedAi,
      fallback: !usedAi,
    }) + "\n",
  );
  process.exit(0);
}

// Guard: only run as the entry point, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
