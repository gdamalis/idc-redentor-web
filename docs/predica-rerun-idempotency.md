# /predica — re-run idempotency (detect → ask → regenerate in place)

How re-running `/predica` on a sermon that was already processed stays **safe and intentional** instead of
piling up duplicates. This is the sermon-entry + transcript + asset layer; the **verse** side (one shared
`bibleVerse` per passage) is documented separately in [`predica-bibleverse-reuse.md`](./predica-bibleverse-reuse.md).

## The problem it fixes

A naive re-run used to: re-transcribe the audio (clobbering the human-corrected transcript), create a **second**
sermon entry at `<slug>-2`, upload **duplicate** assets (audio + 2 PDFs + featured image) every time, and never
ask. Nothing was ever cleaned up.

## Two detection points

The canonical slug only exists **after the writer runs** (it is derived from the title, not the filename), so
detection happens in two places:

1. **Transcript reuse — pre-flight, by audio hash.** The orchestrator computes `sha256` of the incoming audio
   and scans `tasks/predicas/*/` (comparing `links.json.sourceSha256`, else hashing each `source.*`). On a
   match with a non-empty `transcript.txt`, it **reuses that corrected transcript and skips transcription +
   Gate 1**, regenerating only the downstream content. A *different* recording for the same Sunday won't match
   and is treated as fresh (re-transcribe + Gate 1). The transcriber also refuses to overwrite an existing
   `transcript.txt` as a backstop.
2. **Sermon detection — ★ Gate 0, after the writer.** With the canonical slug known, the orchestrator looks the
   sermon up in Contentful `production` by `fields.slug` (+ `sermonDate`, and scans for earlier `-N`
   duplicates). If found, it **stops and asks the human** before any write.

## Gate 0 — the approval (it protects human edits)

Regenerating overwrites whatever a human did at Gate 2 — corrected text in either locale, a featured image they
swapped for a real photo, the publish itself. So Gate 0 names that consequence and asks to proceed, plus whether
to **regenerate or keep** the current featured image. If the entry is already **published**, update-in-place
keeps it live (no 404 gap) but the new content lands as a draft change the human must **Publish again**. On
decline, nothing is written.

## Regenerate = update in place (never delete the entry)

On approval the publisher runs in `mode: "update"`:

- **Sermon entry:** `create-contentful-entry.mjs --id <entryId>` — GET the current version, PUT the full
  regenerated `fields`. Same entry id (the `editUrl` bookmark stays valid), no `-2` duplicate, no live-page-down
  window. No publish call.
- **Owned assets** (audio, both PDFs, and the featured image **iff** the human chose to regenerate it): upload
  new → relink on the entry → delete the superseded old ones (resolved from the entry's prior links, not just
  `links.json`).
- **Verses:** never deleted as part of sermon cleanup — they are shared site-wide. Legacy per-sermon verses that
  the new version-scoped keys orphan are removed **only** when proven unreferenced (see below).

## The only delete path — `delete-contentful.mjs`

The publisher's MCP allowlist is read-only; all deletes go through this one committed script:

- Hard-refuses the `master` alias (same guard as the create/upload scripts).
- Deletes only **explicit ids** (`--entry-id` / `--asset-id`, comma-separated) — never by slug/query.
- **Unpublish-then-delete** (a bare `DELETE` on a published object errors).
- `--guard-referenced` + `--except <id>`: before deleting, it refuses any id still linked by another entry
  (`links_to_entry` / `links_to_asset`). This is what keeps a **shared** verse (cited by another sermon or the
  Creed) safe — guarded ids are skipped, not fatal.

## The manifest — `tasks/predicas/<slug>/links.json`

Records `preacherId`, `scriptureRefIds[]`, `pdfAssetIds{es-AR,en-US}`, `audioAssetId`, `featuredImageAssetId`,
plus the re-run fields `sermonEntryId` and `sourceSha256`. Cleanup treats it as a **hint** — when fields are
absent (e.g. a manifest written before a feature landed), ids are re-resolved from the Contentful entry itself.

## Touch points

- `.claude/commands/predica.md` — pre-flight transcript reuse; **Gate 0**; threads `mode`/`entryId`/`replaceFeatured` to the publisher.
- `.claude/agents/predica-publisher.md` — mode routing; update-in-place; conditional featured upload; step-8 cleanup.
- `.claude/agents/predica-transcriber.md` — never-overwrite guard; emits `sourceSha256`.
- `.claude/scripts/predica/create-contentful-entry.mjs` — `--id` update-in-place path.
- `.claude/scripts/predica/delete-contentful.mjs` — the guarded delete path (new).
