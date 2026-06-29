# Predica: the PDF mirrors the post (single-source content model)

**TL;DR.** A sermon has **one body** — the localized rich-text `content[]`. The website post and the
downloadable branded PDF are **two views of that same body**. There is no separately-authored PDF summary
anymore. This is what lets a preacher edit the post in Contentful and have the PDF reflect it (the webhook
regeneration is specced in [`tasks/specs/predica-pdf-regen-webhook.md`](../tasks/specs/predica-pdf-regen-webhook.md)).

## Why this changed

Originally the `/predica` writer produced two things from the transcript:

- a **short summary** (`lead`, `thesis`, `mainPoints`, `keyQuotes`, `scriptureHeadline`, `scriptureRefs`,
  `closing`) that the PDF was built from, and
- the **full restructured transcript** as `content[]`, which became the website post.

Two problems followed:

1. The post was **long** (the whole transcript) while the PDF was a separate **short** summary — two
   different texts to keep coherent.
2. `lead`/`keyQuotes`/`scriptureHeadline`/`scriptureRefs`/`closing` were **PDF-only and lived only in the
   local `sermon.json`** — they never reached Contentful. So a preacher editing the post in Contentful (which
   edits `content[]`) could not change the PDF: the PDF read fields that weren't even on the entry.

## The model now

- **`content[]` is the one body.** The writer produces it as a **medium (~800–1200 word) summary in the
  preacher's voice** — a real article, far shorter than the transcript. It opens with a lead paragraph,
  develops 3–5 movements (`h2`/`h3` + `p`), weaves scripture in as `blockquote`s, includes 1–2 verbatim
  pull-quotes, and closes — all inside `content[]`.
- **The PDF renders that same body.** `buildPdfHtml` (canonical: `apps/web/src/utils/predica/helpers.ts`;
  runtime twin: `.claude/scripts/predica/build-predica-pdf.mjs`) renders, in the same order as the website
  page ([`SermonDetails.tsx`](../apps/web/src/components/features/sermon-details/SermonDetails.tsx)):

  ```
  Cover (logo · date · service · title · byline)
  → content[] body  (h2/h3/p/blockquote/ul/ol; embeddedAsset blocks are skipped — print can't play them)
  → Scripture references  (from structured scriptureReferences, per-locale, fixed "NVI"/"NIV" label)
  → Footer signature
  ```

- **`thesis` / `mainPoints` / `excerpt` / SEO are metadata**, not the PDF body. They power the cards, the SEO
  description, and related sermons. They still live on the Contentful entry; the PDF just doesn't use them.
- **Scripture label.** Like the website's `ScriptureReferences`, the PDF shows the **fixed localized version
  label** ("NVI" for es-AR, "NIV" for en-US), not each verse's stored `bibleVersion` code.

## Multi-preacher services

A multi-preacher post (one service, several short messages) keeps its own shape: per-part **segment PDFs**
(`.claude/scripts/predica/build-predica-segment-pdf.mjs`) mirror each part's section, and the post body
interleaves per-segment audio/PDF players via `embeddedAsset` blocks. `buildPdfHtml` skips `embeddedAsset`
blocks, so it stays focused on the readable body. (Whether webhook regeneration covers multi-preacher posts
is an open item in the Part B spec.)

## Where this lives (keep in sync)

| File | Role |
|------|------|
| `apps/web/src/utils/predica/helpers.ts` | Canonical `buildPdfHtml` — renders `content[]` + scripture refs. Vitest-tested. |
| `.claude/scripts/predica/build-predica-pdf.mjs` | Runtime twin (no build step). Must mirror `helpers.ts`. |
| `apps/web/src/utils/predica/sermonEntry.ts` | `SermonLocaleContent` (no PDF-only fields) + the entry-field builders. |
| `.claude/agents/predica-writer.md` | Writes `content[]` as the medium, voice-faithful summary. |
| `apps/web/src/components/features/sermon-details/` | The website views the PDF mirrors (`SermonDetails`, `SermonContent`, `ScriptureReferences`, `SermonByline`). |

See also [`docs/predica-rerun-idempotency.md`](./predica-rerun-idempotency.md) (regenerate-in-place) and
[`docs/predica-voice-profiles.md`](./predica-voice-profiles.md) (how the body sounds like the preacher).
