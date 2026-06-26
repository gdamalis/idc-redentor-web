# /predica — bibleVerse reuse (dedup)

How the `/predica` pipeline avoids creating duplicate `bibleVerse` Contentful entries: the **same passage
in the same translation is stored once and reused across sermons**, and re-running a sermon never piles up
duplicates.

## The dedup key — a derived, version-scoped `internalName`

Every `bibleVerse` entry's `internalName` is **derived deterministically** from the passage + Spanish
version — it is **not** authored by the writer and does **not** contain the per-sermon slug:

```
"<book es> <chapter>:<fromVerse>[-<toVerse>] (<bibleVersion es>)"
  → "Joel 2:13 (NVI)"   ·   "Mateo 9:12-13 (NVI)"   ·   "Efesios 2:11-22 (NVI)"
```

Built once by `buildBibleVerseInternalName()` in `src/utils/predica/sermonEntry.ts` (canonical, Vitest-tested)
and mirrored in its runnable twin `.claude/scripts/predica/build-sermon-entry.mjs`. Consequences:

- **Same passage → same key → reuse.** Two different sermons that both quote Joel 2:13 (NVI) resolve to the
  identical `internalName`, so they link the **same** entry.
- **Version-scoped on purpose.** `"Joel 2:13 (NVI)"` and `"Joel 2:13 (RVR1960)"` are different keys, so a
  translation switch never reuses the wrong text. (This is why the RVR1960→NVI transition is safe: a re-run
  in NVI will not reuse the old RVR1960 entries.)
- **Stable across runs.** Because it's derived (not authored), an LLM cannot drift the key between runs.
  Writers must use **full canonical Spanish book names** (`Efesios`, `1 Corintios`) so keys match.

There is **no Contentful schema change**: `internalName` is the existing required `Symbol` and the
`bibleVerse` displayField. Contentful enforces no uniqueness on it — dedup is application-level (below).

## Enforcement — a deterministic upsert in the CMA script

Reuse is **not** left to the agent remembering to search. `.claude/scripts/predica/create-contentful-entry.mjs`
accepts `--upsert-by-internal-name`:

1. GET `…/entries?content_type=bibleVerse&fields.internalName=<key>&limit=1` (read; management token).
2. On a hit → return the existing `entryId` with `reused:true`, **without writing**.
3. On no hit → create the draft as usual, `reused:false`.

The `predica-publisher` (step 4) calls the builder's `--bible` output and runs the upsert per ref, collecting
the returned ids in order. The script keeps its existing guarantees: **no publish call** and it **hard-refuses
the `master` alias**. The publisher's MCP allowlist remains **read-only**.

## Re-run safety for the sermon entry

The same passage is reused, but the **sermon** entry must not silently duplicate either. This is handled by
the re-run idempotency layer (full detail in [`predica-rerun-idempotency.md`](./predica-rerun-idempotency.md)):
a **★ Gate 0 ★** in the orchestrator detects an existing sermon by slug (keying "published" on the presence
of `sys.publishedVersion` — never `publishedCounter`) and, on human approval, **regenerates it by
update-in-place** (`create-contentful-entry.mjs --id`, same id) instead of creating a `<slug>-2` duplicate.
The publisher never bumps the slug; on an unexpected create-mode collision it aborts rather than duplicate.

## Files

| File                                                  | Role                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/utils/predica/sermonEntry.ts`                    | `buildBibleVerseInternalName()` (canonical) + `buildBibleVerseFields()` |
| `.claude/scripts/predica/build-sermon-entry.mjs`      | runnable twin; `--bible` emits the derived key                          |
| `.claude/scripts/predica/create-contentful-entry.mjs` | `--upsert-by-internal-name` (search-then-reuse-or-create)               |
| `.claude/agents/predica-publisher.md`                 | step 4 upsert; step 2 re-run guard                                      |
| `.claude/agents/predica-writer.md`                    | scripture contract: no authored `internalName`; canonical book names    |

## Verifying

```bash
# Derived keys (RVR/NVI per the sermon.json):
node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json> --bible | grep internalName

# Live read-only upsert against an existing key → reused:true, no write:
node .claude/scripts/predica/create-contentful-entry.mjs \
  --content-type bibleVerse --upsert-by-internal-name \
  --fields <fields-with-existing-internalName>.json --space <space> --env production
```
