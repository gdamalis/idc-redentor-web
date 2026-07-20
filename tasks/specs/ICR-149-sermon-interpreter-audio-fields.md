# ICR-149 — Populate the sermon interpreter + audio-language fields from /predica

**Jira:** https://divinelab.atlassian.net/browse/ICR-149 · **Type:** Task → commit `chore` · **QA Depth:** standard · **Component:** Website
**Branch:** `chore/ICR-149-sermon-interpreter-audio-fields`

> Design gate ran (AI-prompt sensitive area). Both blockers **ICR-146** (fields + UI + human Contentful
> cutover — live-verified) and **ICR-147** (flags + `sermon.json` `interpreted`/`interpreter` + voice
> guard) are **Done**. This ticket adds only the `/predica` **write-side mapping**; it does **not** change
> the Contentful content model (both fields already exist since ICR-146's migration 13), so it does **not**
> trip the Contentful model-change gate.

---

## 1. Dependencies Check (all satisfied)

| Dependency                                                                                                                                           | State          | Evidence                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sermon.audioLanguages` (`Array<Symbol>`, items `in:["es-AR","en-US"]`, non-localized) exists in prod Contentful                                     | ✅             | `mcp__contentful__get_content_type sermon` prod `publishedVersion 5`; migration `apps/web/scripts/contentful/migrations/13-add-sermon-audio-fields.cjs:36-58` |
| `sermon.interpreter` (`Link<Entry>→author`, non-localized) exists in prod Contentful                                                                 | ✅             | same                                                                                                                                                          |
| `author` content type: required fields `internalName`, `name` (unique), `email` (required, regex `^\w[\w.-]*@([\w-]+\.)+[\w-]+$`); `avatar` optional | ✅             | `get_content_type author` prod `publishedVersion 3` — **drives the interpreter-email design below**                                                           |
| `SermonDocument.interpreted` / `interpreter` present in `sermon.json` contract                                                                       | ✅             | `sermonEntry.ts:116-121` (ICR-147)                                                                                                                            |
| `--interpreted` / `--interpreter "<name>"` flags parsed + threaded                                                                                   | ✅             | ICR-147 (`predica.md`)                                                                                                                                        |
| `read side` defaults absent `audioLanguages` → `["es-AR"]`                                                                                           | ✅             | `lib/contentful/getSermons.ts:194-197` `normalizeAudioLanguages`                                                                                              |
| No automated `.ts`↔`.mjs` parity test yet (sync via doc comments only)                                                                               | ⚠️ closed here | this spec adds `sermonEntry.parity.test.ts`                                                                                                                   |

---

## 2. Requirements (numbered, code-level)

**R1 — Map both fields in `buildSermonEntryFields()` (`apps/web/src/utils/predica/sermonEntry.ts`).**
Insert, immediately after the `audio` block (currently ends `sermonEntry.ts:346`), inside the non-localized
section:

```ts
if (sermon.interpreted) {
  fields.audioLanguages = atDefault(["es-AR", "en-US"]);
  if (links.interpreterId) {
    fields.interpreter = atDefault(entryLink(links.interpreterId));
  }
}
```

- `audioLanguages` is **derived** from `sermon.interpreted` (not read from `sermon.json`); ICR-146's read-mapper
  already defaults absent → `["es-AR"]`, so a Spanish-only sermon needs no field. Emitting `["es-AR","en-US"]`
  satisfies the item validation `in:["es-AR","en-US"]`.
- `interpreter` is emitted only when **both** `sermon.interpreted` **and** `links.interpreterId` are present
  (mirrors the existing "link fields included only when resolved" style, `sermonEntry.ts:313-314`). Uses the
  existing `entryLink()` (`:249`) — identical Link shape to `preacher`.
- Both wrapped with the existing `atDefault()` (`:257`) — **non-localized**, exactly like `preacher`/`slug`/`durationSeconds`.

**R2 — Extend `SermonDocument.interpreter` to carry an optional email + fix the stale doc comment**
(`sermonEntry.ts:117-121`). Change the type to `{ name: string; email?: string } | null` (mirrors
`additionalPreachers: Array<{ name: string; email?: string }>` at `:109`). **Correct the doc comment**: it
currently says _"never linked as an `author`"_ — that was ICR-147's pre-field understanding. It IS now linked
as an `author` via the dedicated `interpreter` Link field (distinct from `preacher`/`additionalPreachers`); it
is never a **preacher**. Add `ResolvedLinks.interpreterId?: string` (`sermonEntry.ts:131-143`) with a doc
comment noting it is populated only for interpreted runs and links the dedicated `interpreter` field.

**R3 — Mirror R1+R2 in `.claude/scripts/predica/build-sermon-entry.mjs`.** The `.mjs`
`buildSermonEntryFields()` (~`:116-147`) hand-mirrors the `.ts`; add the identical `audioLanguages`/`interpreter`
block at the mirrored position. Extend `validateSermonForEntry()` (~`:155-200`, already guards `interpreter`
shape) to accept an **optional** `interpreter.email` (validate it is a non-empty string **iff present**; never
required — the publisher supplies a fallback). Keep the existing rule (`interpreter.name` required when
`interpreted` is true).

**R4 — Interpreter → `author` link resolution in `.claude/agents/predica-publisher.md`.** Add interpreter
resolution alongside the preacher/co-preacher path (step 3, `:67-75`):

- When `sermon.json.interpreted === true`, take `interpreter.name`. `search_entries({ content_type:"author",
"fields.name": "<interpreter.name>", limit:5, environmentId:"production" })`. Reuse the matching entry id.
- If none, create via `create-contentful-entry.mjs --content-type author --fields <file>` with
  `{ internalName:{["es-AR"]:name}, name:{["es-AR"]:name}, email:{["es-AR"]: <email>} }`, where
  `<email> = interpreter.email ?? "info@idcredentor.org"`.
- The fallback is the **fixed church general address `info@idcredentor.org`** — NOT a name-derived slug. A slug
  like `jonathan-hanegan@idcredentor.org` reads as a real personal mailbox that does not exist; the generic
  `info@` is a real, valid address that unambiguously signals "placeholder — unknown interpreter email." It is a
  **reviewed draft default** the human corrects at Gate 2, exactly like the featured-image default. (It passes the
  `author.email` regex, so the create never fails.)
- Collect the id as **`interpreterId`**. **Never** add it to `additionalPreacherIds` (AC2).
- Add `interpreterId` to the `links.json` written in step 6 (`:90-95`) and to its doc comment; the entry builder
  emits the `interpreter` field from it (R1). Add `interpreterId` to the returned JSON (step 8 output, `:126`).

**R5 — Explicit no-blockquote rule in `.claude/agents/predica-writer.md`.** In the "Interpreted sermons
(ICR-147)" section (ends at item 4, `:90`), add a new item 5: **never emit an "interpreted live" provenance
blockquote** (or any editorial "preached in English, interpreted into Spanish" paragraph) in `content[]` — the
`audioLanguages` + `interpreter` fields are the data that carries this now; prose would duplicate it and can't
drive the badge. Also note in item 1 that `interpreter` MAY carry an optional `email` (used to create the
author entry when the interpreter has no existing `author`; omit if unknown → deterministic fallback applies).

**R6 — Tests.** Extend `sermonEntry.test.ts` (`describe("buildSermonEntryFields")`, `:194-322`) and add the
standalone parity test (§9).

---

## 3. Data Model Changes

**No Contentful content-model change** (both fields already exist since ICR-146). Only the local `sermon.json`
TS contract changes:

```ts
// sermonEntry.ts — SermonDocument
interpreter?: { name: string; email?: string } | null;   // was: { name: string } | null

// sermonEntry.ts — ResolvedLinks
interpreterId?: string;   // NEW — resolved author id for the dedicated `interpreter` Link; interpreted runs only
```

CMA `fields` payload emitted for an interpreted sermon (additions only):

```jsonc
{
  "audioLanguages": { "es-AR": ["es-AR", "en-US"] }, // atDefault-wrapped, non-localized
  "interpreter": {
    "es-AR": {
      "sys": { "type": "Link", "linkType": "Entry", "id": "<authorId>" },
    },
  },
}
```

`links.json` gains `"interpreterId": "<id>"` (present only for interpreted runs).

---

## 4. API / Contract Changes

No HTTP API. The affected contracts are (a) `sermon.json` (adds optional `interpreter.email`), (b) `links.json`
(adds optional `interpreterId`), and (c) the CMA `sermon` `fields` payload (adds `audioLanguages` + `interpreter`
when interpreted). All three are additive and optional; a non-interpreted run emits **byte-identical** output to
today (AC4). There is no Zod in this pipeline; validation is the hand-rolled `validateSermonForEntry()` (R3).

---

## 5. New / Modified Files

| File                                                    | Change                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/src/utils/predica/sermonEntry.ts`             | R1 (map both fields), R2 (interpreter `{name,email?}`, fix stale comment, add `interpreterId`) |
| `apps/web/src/utils/predica/sermonEntry.test.ts`        | R6 — `audioLanguages` (interpreted/not) + `interpreter` (with/without id) cases                |
| `apps/web/src/utils/predica/sermonEntry.parity.test.ts` | **NEW** — `.ts`↔`.mjs` fields parity, modeled on `voiceProfile.parity.test.ts`                 |
| `.claude/scripts/predica/build-sermon-entry.mjs`        | R3 — mirror the mapping; accept optional `interpreter.email` in the validator                  |
| `.claude/agents/predica-publisher.md`                   | R4 — interpreter→author resolution + `interpreterId` in `links.json` + output                  |
| `.claude/agents/predica-writer.md`                      | R5 — no-blockquote rule + optional `interpreter.email` note                                    |

No changes to: Contentful migrations, `getSermons.ts`, UI components, locale JSON, env, CSP, Mongo.

---

## 6. Data flow (no UI)

```
/predica --interpreted --interpreter "Jonathan Hanegan"
   │
   ├─ predica-writer  → sermon.json { interpreted:true, interpreter:{ name[, email?] } }   (R5: no blockquote)
   │
   └─ predica-publisher
        ├─ resolve interpreter → author id  (reuse by name │ create from {name, email ?? derived})   (R4)
        ├─ links.json { …, interpreterId }
        └─ build-sermon-entry.mjs --entry --links links.json                                   (R3 mirror)
              → contentful-entry.fields.json { …, audioLanguages, interpreter }                 (R1)
              → create-contentful-entry.mjs (DRAFT, never publish)
                    → ICR-146 read side (getSermons) + UI render the badge + interpreter credit
```

---

## 7. Edge Cases

1. **Non-interpreted sermon** (`interpreted` absent/false) → neither `audioLanguages` nor `interpreter` emitted → **byte-identical** to today. (AC4; enforced by the parity test + a regression case.)
2. **`interpreted:true` but `interpreter.name` missing/empty** → `validateSermonForEntry()` already **refuses** (ICR-147, `:196-199`). Unchanged.
3. **`interpreted:true`, interpreter author already exists by name** (the real Jonathan Hanegan case — he is himself a preacher) → **reuse** the existing author id; no creation, no email needed.
4. **`interpreted:true`, no existing author, no `interpreter.email`** → create with the fixed default `info@idcredentor.org` (the church general address — a clear placeholder, never a name-derived slug); human corrects at Gate 2.
5. **`interpreted:true`, no existing author, `interpreter.email` supplied** → create with that email.
6. **`interpreted:true` but `links.interpreterId` unresolved** (resolution failed) → `audioLanguages` still set, `interpreter` link omitted — a degraded-but-valid **draft** (matches the existing "link only when resolved" invariant); human sees the missing credit at Gate 2. Not an error.
7. **Stray `interpreter` object with `interpreted:false`** → both fields gated on `sermon.interpreted`, so nothing is emitted; the publisher only resolves an `interpreterId` when interpreted. No accidental link.
8. **`interpreter.email` present but malformed** → the validator checks it is a non-empty string; the Contentful `author.email` regex is the final gate on PUBLISH (human Gate 2). We do not re-implement the regex in the validator (single source of truth = Contentful).

---

## 8. i18n

**None.** No `public/locales/*.json` change. The interpreter credit + audio-language badge strings were added by
**ICR-146**; the WhatsApp interpreter credit is es-AR-only agent prose (ICR-147). This ticket only populates
data. The `i18n-messages` sensitive area is **not** touched.

---

## 9. Testing Strategy

**Unit (`sermonEntry.test.ts`), extend `describe("buildSermonEntryFields")`:**

- interpreted + `interpreterId` → asserts `fields.audioLanguages` deep-equals `{ "es-AR": ["es-AR","en-US"] }` **and** `fields.interpreter` deep-equals `atDefault(entryLink(id))`.
- interpreted, **no** `interpreterId` → `audioLanguages` present, `interpreter` **absent**.
- non-interpreted → **neither** field present (regression / AC4).
- (validator) optional `interpreter.email`: present-and-valid accepted; absent accepted; `interpreted:true` + missing `interpreter.name` still rejected.

**Parity (`sermonEntry.parity.test.ts`, NEW):** model on `voiceProfile.parity.test.ts` — feed a representative
interpreted `sermon.json` + `links.json` through **both** the TS `buildSermonEntryFields()` and the `.mjs`
(`node build-sermon-entry.mjs --entry --links …`), and assert the two `fields` JSON payloads are **deep-equal**.
This is the enforceable guard that the hand-mirrored builders cannot drift (closes the ICR-147 stray
observation that no such test existed).

**Manual smoke (post-merge / QA):** `pnpm predica:smoke` still green; a dry interpreted run's
`contentful-entry.fields.json` carries both fields. Full interpreted publish is a **fresh `/predica` run**
(the old 2026-07-12 draft is gone — see §11), deferred to real use, not this PR.

**QA type:** `chore` — pure pipeline util + agent-prompt + tests; **no** rendered UI or API route in the diff,
**no** deployed target needed (reconcile against the real `git diff` at the QA step).

---

## 10. Implementation Checkpoints

**CP1 — `sermonEntry.ts` mapping + types + tests (TDD).**

- Files: `sermonEntry.ts` (R1, R2), `sermonEntry.test.ts` (R6 unit cases).
- TDD: write the failing unit cases first (assert the two fields for an interpreted doc; assert absence for a non-interpreted doc), watch them fail, then add the R1 block + R2 type/comment changes, watch them pass.
- Verify: `pnpm --filter @idcr/web test sermonEntry`, `pnpm type-check`, `pnpm lint`.
- Commit: `chore(ICR-149): map audioLanguages + interpreter in the TS sermon-entry builder`

**CP2 — `.mjs` mirror + validator + parity test.**

- Files: `build-sermon-entry.mjs` (R3), `sermonEntry.parity.test.ts` (NEW).
- TDD: add the parity test first (it fails while the `.mjs` lacks the fields), then mirror the mapping + optional-email validation, watch parity + validator tests pass.
- Verify: `pnpm --filter @idcr/web test sermonEntry`, `pnpm predica:smoke`, `pnpm type-check`, `pnpm lint`.
- Commit: `chore(ICR-149): mirror the fields in build-sermon-entry.mjs + add a parity test`

**CP3 — publisher + writer prompt updates (AI-prompt sensitive).**

- Files: `predica-publisher.md` (R4), `predica-writer.md` (R5).
- No unit test (prose); verify by careful read + grep assertions: publisher `links.json` schema + resolution mention `interpreterId`; writer contains an explicit "no blockquote" rule (grep-verifiable, AC3) and the optional-`email` note; `additionalPreacherIds` never receives the interpreter.
- Verify: `pnpm test` (full, still green), `pnpm build` (standard depth).
- Commit: `chore(ICR-149): resolve interpreter→author in publisher; forbid the interpreted blockquote in writer`

---

## 11. Open Questions / Notes

- **For the human (non-blocking):** the shipped 2026-07-12 interpreted sermon draft (`4Tp4Qg3SGEIEIJn09w5OjW`)
  is **gone** from Contentful (prod/master/staging all 404 — verified during refinement). Original AC4 ("migrate
  that entry") is therefore **dropped**, not done. If that sermon is still wanted, run a **fresh**
  `/predica --interpreted "Jonathan Hanegan"` once this ships (source on disk under
  `tasks/predicas/2026-07-12_lo-negue-y-aun-asi-me-amo-la-historia-de-pedro/`). Please confirm the deletion was
  intentional (plausibly Gate-2 review, given ICR-147's documented interpreter-fidelity issues).
- **Interpreter email fallback is the fixed `info@idcredentor.org`** (not a name-derived slug) — a clear, honest
  placeholder the human corrects at Gate 2, consistent with the pipeline's "human reviews drafts at Gate 2"
  philosophy. No new command flag is added (keeps this ticket out of ICR-147's flag surface; the fallback already
  satisfies AC1's "no hand-editing in the Contentful UI").
