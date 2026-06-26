# Predica featured-image generator

How the `/predica` pipeline auto-generates a branded **featured image** (a 1200×630 title card) for
each sermon and attaches it to the Contentful **draft** entry. This is the sermon's `featuredImage`
field — which is also its Open Graph / social-share card.

> TL;DR: an AI-generated atmospheric **background** (Google Gemini) + a crisp branded **text overlay**
> (logo + title + date + scripture/preacher), rendered to PNG with Playwright. No API key → an on-brand
> **typographic fallback** card. The image is a **draft default** a human reviews/replaces at Gate 2.

## Why this exists

Sermons are agent-generated drafts. Before this step, `featuredImage` was left empty and deferred to a
human, so fresh drafts had no social card at all (the site falls back to `og_default.jpeg` — see
`lib/sermonMetadata.ts`). Generating a tasteful, on-brand card per sermon gives every prédica a real
hero/social image with zero manual design work, while keeping a human in the loop.

## The two layers

1. **AI background (optional).** Google Gemini (`gemini-2.5-flash-image`, a.k.a. "nano banana") is
   called over plain REST (no SDK) with a composed brief. The image is **non-figurative and
   atmospheric** — landscapes, light, water, stone, fabric — in the brand palette. The brief carries
   hard guardrails (see below). The raw image is cached as `featured.bg.png`.
2. **Branded overlay.** The logo (light variant), an eyebrow (`PRÉDICA · <fecha>`), the title in
   Playfair Display (2-line clamp, auto size-down), a terracotta rule, and a `scripture · preacher`
   meta line are rendered over a legibility scrim via Playwright `page.screenshot` at 1200×630.

If there is no `GEMINI_API_KEY`, the API errors, or `--no-ai` is passed, layer 1 is skipped and the
overlay is rendered on an **on-brand gradient** (slate → blue). The script always exits 0 with a
`featured.png`, so the pipeline never breaks.

The card uses the **es-AR** title only: `featuredImage` is a single Contentful asset keyed at the
default locale (same as blog posts), so there are no bilingual variants.

## Prompt guardrails (church-appropriate)

Baked into `composeImageBrief()` (and asserted by tests):

- **No text** — words, letters, numbers, or typography of any kind (text comes from the overlay).
- **No depiction** of God, Jesus, the Holy Spirit, angels, saints, or any human faces/figures.
- **No crosses/religious icons** as a focal subject, no kitsch, no logos, no watermarks.
- **Non-figurative / environmental only**; keep the lower-left third calm for the overlaid title.

The **human review at Gate 2** is the final safety check on every generated image, and the editor can
replace it with a photograph at any time.

## Files

| File                                                 | Role                                                                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/predica/featuredCard.ts`                  | Pure, Vitest-tested helpers: `composeImageBrief`, `buildFeaturedCardHtml`, `pickPrimaryScripture`, `titleFontSize`, `stripScriptureVersion`. Canonical source of truth. |
| `src/utils/predica/featuredCard.test.ts`             | Unit tests for the above.                                                                                                                                               |
| `.claude/scripts/predica/build-predica-featured.mjs` | Runtime generator. JS twin of the helpers + the Gemini REST call + Playwright screenshot + graceful fallback.                                                           |
| `.claude/config.json` → `predica.featured`           | Script path, provider/model, `apiKeyEnv`, dimensions.                                                                                                                   |

The helpers ↔ `.mjs` duplication mirrors the existing `helpers.ts` ↔ `build-predica-pdf.mjs` pattern
(the `.mjs` runs directly under Node ESM with no build step). Keep the two in sync.

## CLI

```
node .claude/scripts/predica/build-predica-featured.mjs <sermon.json> [options]

  --out <dir>       Output dir (default: directory of the input JSON)
  --prompt "<txt>"  Override the auto-derived image brief (per-sermon creativity)
  --no-ai           Skip the AI background; render the typographic fallback
  --regenerate      Re-roll the AI image, ignoring any cached featured.bg.png
  --provider <name> Image provider (only "gemini" is supported)
  --model <name>    Gemini model (default: gemini-2.5-flash-image)

Output:  <outDir>/featured.png      (the 1200×630 card)
         <outDir>/featured.bg.png   (cached AI background; AI path only)
         stdout: { ok, featured, background, usedAi, fallback }
Exit:    0 card written · 2 usage/input error · 1 render failure
```

`GEMINI_API_KEY` is read from the environment or `.env.local` (name only, never printed). Get one at
<https://aistudio.google.com/apikey>. Cost is ~US$0.04/image (≈ a few US$/year at one sermon/week).

## Pipeline wiring

- **Generated** in `/predica` step 4, right after the PDFs (both are local renders; included in `--dry-run`).
- **Uploaded + linked** by `predica-publisher` (step 5) via the existing `upload-contentful-asset.mjs`
  (`--content-type image/png`); the asset id goes into `links.json` as `featuredImageAssetId`, which
  `build-sermon-entry.mjs` already maps to `fields.featuredImage`.
- **Policy:** `config.predica.assetUploadPolicy.uploadedViaCma` now includes `featuredImage`
  (previously `deferToHumanAtGate2`).
- **Draft-only + Gate 2 safety** are unchanged: the image lands on the agent-sandbox draft; the human
  reviews/replaces it and promotes to master.

## Requirements

Same Chromium dependency as the PDF generator: `pnpm exec playwright install chromium` on a fresh
checkout. The fonts (Playfair Display, Outfit) load from Google Fonts at render time; the script waits
for `document.fonts.ready` before snapshotting.
