---
description: Turn a sermon recording into a review-ready bilingual website post. Runs the local /predica pipeline — transcribe (whisper.cpp) → ★ correct transcript → write a bilingual sermon.json → two branded PDFs (Card C) → a Contentful DRAFT in production → a WhatsApp share text → ★ human review. Draft-only and send-only: nothing is ever auto-published or auto-sent. Two human gates.
argument-hint: "[<audio-path>] [--dry-run]"
---

# /predica — sermon → bilingual Contentful draft + PDFs + WhatsApp (local, on-demand)

Orchestrates four `predica-*` subagents and Card C's PDF script to turn one Sunday recording into a
review-ready, bilingual website post (audio player + downloadable branded PDF per language) plus a
ready-to-paste WhatsApp message. You (the main thread) run this step by step; spawn subagents only at the
points marked **(subagent: …)**. The two **★ HUMAN GATE ★** steps stay in this conversation — never delegate
or auto-skip them. See `tasks/specs/sermon-pipeline.md` §7–§9.

## Hard rules (all steps)

- **Draft-only.** Nothing is ever published. The `predica-publisher`'s allowlist omits every `publish_*`,
  and it writes only a **DRAFT** to `production`. A human reviews and Publishes at Gate 2.
- **Send-only-by-human.** The WhatsApp message is composed, never sent.
- **Two gates are mandatory.** Gate 1 (human corrects the transcript) and Gate 2 (human reviews the draft +
  publishes) both stop and wait in this conversation.
- **Never write the `master` alias.** All Contentful writes target the `production` env as a DRAFT (server
  backstop: `PROTECTED_ENVIRONMENTS=master,production`).
- **Secret hygiene.** Never print the CMA token, Mongo URI, or any secret — reference variable names only.
  Per-sermon working files live under `tasks/predicas/<slug>/` (gitignored); temp files use `600` perms.
- **`--dry-run`** stops after the PDFs (step 4) — **no Contentful writes, no WhatsApp finalize**. It prints
  every action it would take.

## 0. Pre-flight

1. Read `.claude/config.json` → pin `config.predica` (audioInbox, artifactsDir, contentfulSpaceId,
   contentfulEnv, defaultContentfulLocale, locales, whatsappLocale, siteBaseUrl, scriptureVersion, whisper,
   audio, pdf, featured, entryBuilder, agents, gates). Resolve `MAIN_REPO_ROOT` (`git rev-parse --show-toplevel`).
2. Parse `$ARGUMENTS`:
   - `$1` (optional) = audio path. If omitted, pick the **newest** file in `config.predica.audioInbox`
     (`ls -t` filtered to audio extensions). Quote the path (church folders have spaces + accents).
   - `--dry-run` → boolean.
   - Resolve `sermonDate`: parse a leading `YYYYMMDD` in the filename → `YYYY-MM-DD`; else use the file's
     mtime date and note the assumption.
   - Resolve `preacher`: parse the filename (e.g. `… - Prédica - Jonathan.m4a` → `Jonathan …`); if only a
     first name, leave it for the writer/publisher to match against an existing `author` and note it.
3. **Tooling check** (Bash): `ffmpeg`, `ffprobe`, `config.predica.whisper.bin` + `.model` all exist; and
   Chromium for the PDF (`pnpm exec playwright install chromium` if `renderPdfs` later errors with a missing
   browser). Stop with a precise message if a hard dependency is missing.
4. **Contentful env check** (skip on `--dry-run`). `mcp__contentful__list_environments(spaceId)` and confirm
   `config.predica.contentfulEnv` (`production`) exists and is accessible.
5. **Provisional slug + artifacts dir.** Derive a provisional slug from the filename (transliterate, lowercase,
   dash-collapse) — used only for the temp dir. `mkdir -p <artifactsDir>/<provisional-slug>/`. (The writer's
   title-derived slug is canonical; reconcile in step 3.)

## 1. Transcribe — (subagent: `config.predica.agents.transcriber`)

Dispatch `predica-transcriber` with `audioPath`, `slugDir`, and `config.predica.{whisper,audio}`. It returns
`{ durationSeconds, transcriptTxt, audioMp3, archive, … }`. Surface the transcript path and duration.

## 2. ★ HUMAN GATE 1 — correct the transcript ★

Print the absolute path to `transcript.txt` and ask the user **explicitly**:

> "Transcript ready at `<…>/transcript.txt` (`<mm:ss>`). Please review and correct it in place — names,
> scripture references, and any theology — then tell me to continue. I'll wait."

**Wait for the user to confirm.** Do not proceed until they do. (Never auto-skip — the transcript is the
source of truth for everything downstream.)

## 3. Write the bilingual sermon — (subagent: `config.predica.agents.writer`)

Dispatch `predica-writer` with `slugDir`, the corrected `transcript.txt`, `sermonDate`, `preacher`,
`durationSeconds`, `config.predica.scriptureVersion`, and the serviceLabel defaults. It writes `sermon.json`
and returns the **canonical** `slug`.

Then **validate + reconcile** (Bash):

- `node <config.predica.entryBuilder> <slugDir>/sermon.json` — must exit 0 (schema valid). On errors, show
  them and re-dispatch the writer to fix (max 2 attempts) before stopping.
- If the writer's canonical slug differs from the provisional dir name, rename the dir to the canonical slug
  and update `slugDir`. Re-run the PDF/publisher against the canonical paths.
- Show the user a one-glance sanity line: title (es/en), thesis, main points, key quotes, scripture refs.

## 4. Generate the branded PDFs + featured image — (Card C + featured-image scripts)

1. **PDFs.** Bash: `node <config.predica.pdf.script> <slugDir>/sermon.json` → `predica.es-AR.pdf` +
   `predica.en-US.pdf` in `slugDir`. If it fails for a missing browser, run
   `pnpm exec playwright install chromium` once and retry. Confirm both PDFs exist with non-zero size.
2. **Featured image.** Bash: `node <config.predica.featured.script> <slugDir>/sermon.json` → `featured.png`
   (1200×630) in `slugDir`. This generates an AI background (Google Gemini) themed to the sermon, with the
   branded title/date overlaid. **It degrades gracefully:** with no `GEMINI_API_KEY` (or on any API failure)
   it renders an on-brand typographic card instead — the script still exits 0 and writes `featured.png`.
   Confirm `featured.png` exists with non-zero size. (The image is a **draft default**; the human approves or
   replaces it at Gate 2.)

> **`--dry-run` stops here.** Print the dry-run summary (transcript, sermon.json, both PDFs, `featured.png`,
> the slug, and the Contentful/WhatsApp actions that WOULD run) and **end** — no Contentful writes, no
> WhatsApp finalize.

## 5. Publish the DRAFT — (subagent: `config.predica.agents.publisher`)

Dispatch `predica-publisher` with `slugDir`, `sermon.json`, the canonical `finalSlug`,
`config.predica.{contentfulSpaceId,contentfulEnv,entryBuilder,assetUploader,entryCreator}`, the two `pdfPaths`,
the `audioMp3` path, and the `featured.png` path. It uploads the audio + both PDFs + the featured image (via the
CMA scripts), upserts both-locale `bibleVerse` refs, links the preacher, and creates the bilingual **DRAFT**
`sermon` entry, returning `{ entryId, editUrl, finalSlug, assetIds, deferred[], published:false }`. The
featured image is attached as a **draft default** (the human can replace it at Gate 2). If it reports a slug
bump (collision), thread the new `finalSlug` forward.

## 6. Compose the WhatsApp text — (subagent: `config.predica.agents.whatsapp`)

Dispatch `predica-whatsapp` with `slugDir`, `sermon.json`, the publisher's `finalSlug`,
`config.predica.siteBaseUrl`, and `config.predica.whatsappLocale`. It writes `whatsapp.txt` using the
deterministic canonical URL `${siteBaseUrl}/es-AR/predicas/<finalSlug>` and returns the message — **never sent**.

## 7. ★ HUMAN GATE 2 — review, promote, publish, share ★

Print a single summary block and **stop** (no further action):

- **Transcript:** `<…>/transcript.txt`
- **sermon.json:** `<…>/sermon.json`
- **PDFs:** `<…>/predica.es-AR.pdf`, `<…>/predica.en-US.pdf`
- **Contentful DRAFT (production):** `<editUrl>` — status **draft, not published** (audio + both PDFs +
  the featured image already attached)
- **Featured image:** `<…>/featured.png` — generated as a **draft default** (review it; replace in Contentful
  with a real photo if you prefer)
- **WhatsApp (es-AR):** `<…>/whatsapp.txt` — canonical URL `<…>` (verify the production domain)

Then tell the user, verbatim intent:

> "Done — everything is a **draft**. To go live: in Contentful (production) review both locales and the
> **featured image** (replace it if you'd rather use a photo), and **Publish** (the publish webhook
> revalidates the site). Then paste the WhatsApp text. **No agent publishes or sends.**"

**Never move any Trello card to Done. Never publish. Never send.**

## Failure handling

If any subagent or script fails, stop at that step, surface the exact error (failing command + stderr / the
agent's `{ ok:false, error }`), and leave all artifacts in `slugDir` for inspection. Re-running `/predica` on
the same audio resumes cleanly: ffmpeg uses `-y`, the slug-collision check prevents duplicate entries, and the
artifacts dir is reused. Cap any auto-retry at **2 attempts** per step, then hand back to the human.
