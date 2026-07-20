# ICR-149 — Sermon interpreter + audio-language write-side mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `/predica` to populate the Contentful `sermon.audioLanguages` + `sermon.interpreter` fields for an interpreted sermon, so provenance lives as data (driving ICR-146's badge + credit) instead of prose.

**Architecture:** Two hand-mirrored builders (`sermonEntry.ts` canon + `build-sermon-entry.mjs` twin the orchestrator runs) gain two non-localized fields, gated on `sermon.interpreted`. The publisher resolves the interpreter to an `author` entry and threads its id through `links.json`. The writer is told never to emit an interpreted-live blockquote. A new parity test binds the two builders so they can't drift.

**Tech Stack:** TypeScript, Vitest, Node ESM (`.mjs`), Contentful CMA (via committed scripts). No Zod (hand-rolled validator). No Contentful model change.

## Global Constraints

- **Commit type `chore`** (Jira Task). PR **title** decides the release; `chore` is the only no-release type here (`.releaserc.json`: `feat`→minor, `fix`/`perf`/`docs`→patch, `chore`→false). This work is `chore`.
- **Functional-first, no classes** — pure functions + plain objects; model outcomes as return values (repo convention).
- **Non-localized fields MUST be wrapped with `atDefault(...)`** (default-locale-keyed), exactly like `preacher`/`slug`/`durationSeconds`.
- **A non-interpreted run MUST emit byte-identical `fields` to today** (AC4) — both new fields gated on `sermon.interpreted`.
- **The interpreter is NEVER added to `additionalPreacherIds`** (AC2) — it links the dedicated `interpreter` field only.
- **Interpreter-email create fallback is the fixed `info@idcredentor.org`** — never a name-derived slug.
- **No Contentful content-model change, no i18n/locale-JSON, no env/CSP/Mongo.** Fields already exist since ICR-146's migration 13.
- **`.env.local` is already present in the worktree at `apps/web/.env.local`** (copied at setup). Do not re-copy.
- Commands: `pnpm --filter @idcr/web test <pattern>` (Vitest single-run), `pnpm type-check`, `pnpm lint`, `pnpm build`, `pnpm predica:smoke`. Run from the worktree root.

---

## File Structure

- **Modify** `apps/web/src/utils/predica/sermonEntry.ts` — the canonical builder + `SermonDocument`/`ResolvedLinks` types.
- **Modify** `apps/web/src/utils/predica/sermonEntry.test.ts` — unit cases for the two new fields.
- **Create** `apps/web/src/utils/predica/sermonEntry.parity.test.ts` — `.ts`↔`.mjs` fields-parity guard.
- **Modify** `.claude/scripts/predica/build-sermon-entry.mjs` — mirror the mapping; accept optional `interpreter.email`.
- **Modify** `.claude/agents/predica-publisher.md` — interpreter→author resolution + `interpreterId` in `links.json` + output.
- **Modify** `.claude/agents/predica-writer.md` — the no-blockquote rule + optional `interpreter.email` note.

---

## Task 1: TS builder mapping + types + unit tests (CP1)

**Files:**

- Modify: `apps/web/src/utils/predica/sermonEntry.ts` (`SermonDocument.interpreter` at :117-121, `ResolvedLinks` at :131-143, `buildSermonEntryFields` non-localized block ending :346)
- Test: `apps/web/src/utils/predica/sermonEntry.test.ts` (`describe("buildSermonEntryFields")`, :218-322)

**Interfaces:**

- Consumes: existing `entryLink(id)` (`:249`), `atDefault(value)` (`:257`), `PREDICA_LOCALES`.
- Produces: `ResolvedLinks.interpreterId?: string`; `SermonDocument.interpreter?: { name: string; email?: string } | null`; `buildSermonEntryFields` now emits `fields.audioLanguages` + `fields.interpreter` when interpreted.

- [ ] **Step 1: Write the failing tests.** Append these cases inside `describe("buildSermonEntryFields")` in `sermonEntry.test.ts` (the shared `sermon` fixture is defined at :209-216; it has no `interpreted`):

```ts
it("derives audioLanguages + links the interpreter for an interpreted sermon", () => {
  const fields = buildSermonEntryFields(
    { ...sermon, interpreted: true, interpreter: { name: "Jonathan Hanegan" } },
    { preacherId: "PRE1", interpreterId: "INT1" },
  );
  expect(fields.audioLanguages).toEqual({ "es-AR": ["es-AR", "en-US"] });
  expect(fields.interpreter).toEqual({
    "es-AR": { sys: { type: "Link", linkType: "Entry", id: "INT1" } },
  });
});

it("sets audioLanguages but omits the interpreter link when no interpreterId resolved", () => {
  const fields = buildSermonEntryFields(
    { ...sermon, interpreted: true, interpreter: { name: "Jonathan Hanegan" } },
    { preacherId: "PRE1" },
  );
  expect(fields.audioLanguages).toEqual({ "es-AR": ["es-AR", "en-US"] });
  expect(fields.interpreter).toBeUndefined();
});

it("emits NEITHER field for a non-interpreted sermon (byte-identical baseline, AC4)", () => {
  const fields = buildSermonEntryFields(sermon, {
    preacherId: "PRE1",
    interpreterId: "INT1",
  });
  expect(fields.audioLanguages).toBeUndefined();
  expect(fields.interpreter).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests, verify they fail.**

Run: `pnpm --filter @idcr/web test sermonEntry`
Expected: the first two new cases FAIL (`audioLanguages`/`interpreter` are `undefined`); TypeScript also flags `interpreterId` as an unknown `ResolvedLinks` property.

- [ ] **Step 3: Extend the types.** In `sermonEntry.ts`, replace the `interpreter` field + its doc comment (`:117-121`):

```ts
  /**
   * The live interpreter (ICR-147). NOT a preacher — never added to
   * {@link SermonDocument.additionalPreachers} and never rendered in the byline.
   * Since ICR-149 the interpreter IS linked as an `author` entry via the sermon's
   * dedicated, non-localized `interpreter` field (distinct from `preacher`). Required when
   * `interpreted` is true; drives the WhatsApp credit. `email` is optional and used only to
   * create the author entry when none with this name exists (publisher falls back to
   * info@idcredentor.org).
   */
  interpreter?: { name: string; email?: string } | null;
```

Add to `ResolvedLinks` (after `additionalPreacherIds`, `:138`):

```ts
  /**
   * The interpreter's `author` entry id (ICR-149). Populated by the publisher ONLY for an
   * interpreted run; links the dedicated non-localized `interpreter` field (NOT a preacher).
   */
  interpreterId?: string;
```

- [ ] **Step 4: Add the mapping block.** In `buildSermonEntryFields`, immediately after the `audio` link block (`if (links.audioAssetId) { … }`, ends `:346`) and before the `// Localized text` comment:

```ts
if (sermon.interpreted) {
  fields.audioLanguages = atDefault(["es-AR", "en-US"]);
  if (links.interpreterId) {
    fields.interpreter = atDefault(entryLink(links.interpreterId));
  }
}
```

- [ ] **Step 5: Run the tests, verify they pass.**

Run: `pnpm --filter @idcr/web test sermonEntry`
Expected: PASS (all prior cases + the 3 new ones).

- [ ] **Step 6: type-check + lint.**

Run: `pnpm type-check && pnpm lint`
Expected: both pass (no errors in `sermonEntry.ts`/`.test.ts`).

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/utils/predica/sermonEntry.ts apps/web/src/utils/predica/sermonEntry.test.ts
git commit -m "chore(ICR-149): map audioLanguages + interpreter in the TS sermon-entry builder"
```

---

## Task 2: `.mjs` mirror + optional-email validation + parity test (CP2)

**Files:**

- Modify: `.claude/scripts/predica/build-sermon-entry.mjs` (`buildSermonEntryFields` at :116-147; `validateSermonForEntry` interpreter block at :183-200)
- Create: `apps/web/src/utils/predica/sermonEntry.parity.test.ts`

**Interfaces:**

- Consumes: the `.mjs` CLI `node build-sermon-entry.mjs <sermonJson> --entry --links <links.json>` → prints the `fields` JSON to stdout (the publisher redirects it to `contentful-entry.fields.json`, `predica-publisher.md:95`). Confirm the exact arg parsing by reading the `.mjs` arg parser before writing the test.
- Produces: the `.mjs` builder emits `audioLanguages`/`interpreter` identically to the TS canon; the validator accepts an optional `interpreter.email`.

- [ ] **Step 1: Write the failing parity test.** Create `apps/web/src/utils/predica/sermonEntry.parity.test.ts`:

```ts
/**
 * PARITY TEST (ICR-149).
 *
 * apps/web is the Vercel Root Directory, so app code cannot import out of itself into
 * .claude/. The sermon-entry builder therefore exists twice: the canonical TypeScript
 * (sermonEntry.ts) and the .mjs twin the /predica publisher actually executes. A hand-mirrored
 * builder that silently drifts from its canon is an invisible-compounding bug — so the mirror is
 * bound here rather than by a "MUST mirror" comment (closes the ICR-147 stray observation).
 *
 * Each case runs the SAME sermon + links through BOTH impls; the twin's stdout JSON must deep-equal
 * the TS `fields`. Break either builder and this goes red.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  buildSermonEntryFields,
  type ResolvedLinks,
  type SermonDocument,
  type SermonLocaleContent,
} from "@src/utils/predica/sermonEntry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/web/src/utils/predica -> repo root is five levels up.
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const TWIN = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/build-sermon-entry.mjs",
);

/** Run the twin exactly as the publisher does: fields JSON on stdout. */
function runTwinEntry(sermon: SermonDocument, links: ResolvedLinks): unknown {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sermon-parity-"));
  const sermonPath = path.join(dir, "sermon.json");
  const linksPath = path.join(dir, "links.json");
  writeFileSync(sermonPath, JSON.stringify(sermon));
  writeFileSync(linksPath, JSON.stringify(links));
  const res = spawnSync(
    "node",
    [TWIN, sermonPath, "--entry", "--links", linksPath],
    {
      encoding: "utf8",
    },
  );
  if (res.status !== 0)
    throw new Error(`twin exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

const localeContent = (s: string): SermonLocaleContent => ({
  title: `Title ${s}`,
  thesis: `Thesis ${s}`,
  mainPoints: [`Point ${s}`],
  excerpt: `Excerpt ${s}`,
  seoTitle: `SEO ${s}`,
  seoDescription: `Desc ${s}`,
  keywords: [`kw-${s}`],
  content: [{ type: "p", text: `Body ${s}` }],
});

const baseSermon: SermonDocument = {
  slug: "el-perdon-de-jesus",
  sermonDate: "2026-06-07",
  preacher: "Doug Wagner",
  internalName: "Prédica · 2026-06-07 · Doug Wagner",
  durationSeconds: 1651,
  scriptureReferences: [
    {
      chapter: "18",
      fromVerse: "10",
      "es-AR": {
        book: "Juan",
        verseContent: "Entonces Simón Pedro…",
        bibleVersion: "NVI",
      },
      "en-US": {
        book: "John",
        verseContent: "Then Simon Peter…",
        bibleVersion: "NIV",
      },
    },
  ],
  locales: { "es-AR": localeContent("es"), "en-US": localeContent("en") },
};

const CASES: Array<{
  name: string;
  sermon: SermonDocument;
  links: ResolvedLinks;
}> = [
  {
    name: "interpreted sermon with a resolved interpreter link",
    sermon: {
      ...baseSermon,
      interpreted: true,
      interpreter: { name: "Jonathan Hanegan" },
    },
    links: {
      preacherId: "PRE1",
      interpreterId: "INT1",
      scriptureRefIds: ["BV1"],
      audioAssetId: "AUD1",
      featuredImageAssetId: "IMG1",
      pdfAssetIds: { "es-AR": "PDFES", "en-US": "PDFEN" },
    },
  },
  {
    name: "non-interpreted sermon (byte-identical baseline)",
    sermon: baseSermon,
    links: {
      preacherId: "PRE1",
      scriptureRefIds: ["BV1"],
      audioAssetId: "AUD1",
    },
  },
];

describe("build-sermon-entry.mjs is in fields-parity with sermonEntry.ts", () => {
  it.each(CASES)("$name", ({ sermon, links }) => {
    expect(runTwinEntry(sermon, links)).toEqual(
      buildSermonEntryFields(sermon, links),
    );
  });
});
```

- [ ] **Step 2: Run the parity test, verify it fails.**

Run: `pnpm --filter @idcr/web test sermonEntry.parity`
Expected: the interpreted case FAILS — the twin's payload lacks `audioLanguages`/`interpreter` while the TS canon has them. (The non-interpreted case should already pass; if it FAILS, the mirror has **pre-existing** drift unrelated to this ticket — surface it as a stray observation in `tasks/todo.md`, do not silently "fix" unrelated behavior.)

- [ ] **Step 3: Mirror the mapping in the `.mjs`.** In `build-sermon-entry.mjs` `buildSermonEntryFields`, immediately after the `audio` line (`if (links.audioAssetId) …`, `:128`):

```js
if (sermon.interpreted) {
  fields.audioLanguages = atDefault(["es-AR", "en-US"]);
  if (links.interpreterId)
    fields.interpreter = atDefault(entryLink(links.interpreterId));
}
```

- [ ] **Step 4: Accept an optional `interpreter.email` in the validator.** In `validateSermonForEntry`, inside the existing `if (s.interpreter != null) { … }` block (`:183-193`), after the name-check `if (…) errs.push("interpreter: must be an object…")`, add:

```js
if (s.interpreter.email != null && typeof s.interpreter.email !== "string")
  errs.push("interpreter.email: must be a string when present");
```

- [ ] **Step 5: Run parity + validator + smoke, verify green.**

Run: `pnpm --filter @idcr/web test sermonEntry && pnpm predica:smoke`
Expected: parity PASS (both cases), all `sermonEntry` unit + validator tests PASS, `predica:smoke` PASS.

- [ ] **Step 6: type-check + lint.**

Run: `pnpm type-check && pnpm lint`
Expected: both pass.

- [ ] **Step 7: Commit.**

```bash
git add .claude/scripts/predica/build-sermon-entry.mjs apps/web/src/utils/predica/sermonEntry.parity.test.ts
git commit -m "chore(ICR-149): mirror the fields in build-sermon-entry.mjs + add a parity test"
```

---

## Task 3: publisher interpreter→author resolution + writer no-blockquote rule (CP3, AI-prompt sensitive)

**Files:**

- Modify: `.claude/agents/predica-publisher.md` (step 3 resolution `:67-75`; `links.json` schema `:90-95`; output JSON `:126`)
- Modify: `.claude/agents/predica-writer.md` (Interpreted-sermons section `:74-90`; contract note)

**Interfaces:**

- Consumes: `sermon.json.interpreted` + `interpreter:{name,email?}`; the CMA `create-contentful-entry.mjs --content-type author` path; `ResolvedLinks.interpreterId` (Task 1).
- Produces: `links.json.interpreterId`; the entry builder (Task 1/2) emits `interpreter` from it.

- [ ] **Step 1: Add interpreter resolution to the publisher.** In `predica-publisher.md`, after the "Co-preachers" bullet in step 3 (`:75`), add a new bullet:

```markdown
- **Interpreter (interpreted sermons).** When `sermon.json.interpreted === true`, resolve the
  `interpreter.name` to an `author` the same way as the preacher: `search_entries({ content_type:"author",
"fields.name": "<interpreter.name>", limit:5, environmentId:"production" })` → reuse the matching id.
  If none, create it via `node <entryCreator> --content-type author --fields <file> --space <s> --env <e>`
  with `{ internalName:{["es-AR"]:name}, name:{["es-AR"]:name}, email:{["es-AR"]:<email>} }`, where
  `<email> = interpreter.email` when present, else the fixed **`info@idcredentor.org`** (the church general
  address — a clear placeholder the human corrects at Gate 2; **never** a name-derived slug). Collect the id
  as `interpreterId`. **Never** add the interpreter to `additionalPreacherIds` — they did not preach; it links
  the dedicated `interpreter` field only. Absent/skip for a non-interpreted sermon.
```

- [ ] **Step 2: Add `interpreterId` to the `links.json` schema.** In step 6 (`:90-95`), extend the `links.json` shape and its prose to include `interpreterId?` (present only for interpreted runs), e.g. change the JSON to:

```markdown
`{ preacherId, additionalPreacherIds?:[...], interpreterId?, scriptureRefIds:[...], pdfAssetIds:{ "es-AR":…, "en-US":… }, audioAssetId:…, featuredImageAssetId:…, sourceSha256? }`
```

Add a sentence: `include interpreterId from step 3 only for an interpreted sermon; the entry builder emits the sermon's dedicated interpreter field from it.`

- [ ] **Step 3: Add `interpreterId` to the output JSON.** In the "Output" block (`:126`), add `"interpreterId": "<id>"` (or note it is omitted for non-interpreted runs) alongside `preacherId`.

- [ ] **Step 4: Add the no-blockquote rule to the writer.** In `predica-writer.md`, after item 4 of "Interpreted sermons (ICR-147)" (`:90`), add item 5:

```markdown
5. **Never emit a provenance blockquote.** Do NOT add an "interpreted live" / "preached in English,
   interpreted into Spanish" `blockquote` or paragraph to `content[]`. This fact is carried by the sermon's
   `audioLanguages` + `interpreter` fields (ICR-149) and rendered by the page (ICR-146) — prose would duplicate
   it and cannot drive the badge or the credit.
```

Also extend item 1 (`:78`) to note the optional email:

```markdown
1. **Record it.** `sermon.json` MUST carry `"interpreted": true` and
   `"interpreter": { "name": "<Full Name>" }` (optionally `"email": "<addr>"` — used only to create the
   interpreter's `author` entry when none exists; omit if unknown and the publisher falls back to
   info@idcredentor.org). Never add the interpreter to `additionalPreachers` — they are not a preacher.
```

- [ ] **Step 5: Grep-verify the prose contracts.**

Run:

```bash
grep -n "interpreterId" .claude/agents/predica-publisher.md
grep -n "info@idcredentor.org" .claude/agents/predica-publisher.md
grep -niE "never emit a provenance blockquote|interpreted live" .claude/agents/predica-writer.md
grep -n "additionalPreacherIds" .claude/agents/predica-publisher.md   # confirm interpreter is NOT added there
```

Expected: `interpreterId` appears in the publisher (resolution + links.json + output); `info@idcredentor.org` present; the writer's no-blockquote rule present; the interpreter is never listed under `additionalPreacherIds`.

- [ ] **Step 6: Full verify (standard depth).**

Run: `pnpm --filter @idcr/web test && pnpm type-check && pnpm lint && pnpm build`
Expected: all green. (`.env.local` is already in `apps/web/`, so the build's page-data collection has `NEXT_PUBLIC_BASE_URL`.)

- [ ] **Step 7: Commit.**

```bash
git add .claude/agents/predica-publisher.md .claude/agents/predica-writer.md
git commit -m "chore(ICR-149): resolve interpreter→author in publisher; forbid the interpreted blockquote in writer"
```

---

## Self-Review

**Spec coverage:**

- R1 (map both fields, TS) → Task 1 Step 4. R2 (types + stale comment) → Task 1 Step 3. R3 (`.mjs` mirror + optional-email validator) → Task 2 Steps 3-4. R4 (publisher resolution + `links.json` + output) → Task 3 Steps 1-3. R5 (writer no-blockquote + email note) → Task 3 Steps 4. R6 (unit + parity tests) → Task 1 Step 1 + Task 2 Step 1.
- ACs: AC1 (populated draft) → Task 1+3; AC2 (linked as author, not additionalPreachers) → Task 3 Step 1 + grep Step 5; AC3 (no blockquote, grep-verifiable) → Task 3 Step 4-5; AC4 (Spanish-only no regression) → Task 1 non-interpreted case + Task 2 parity baseline; AC5 (`pnpm test` green + parity) → Task 2 Step 5 + Task 3 Step 6.

**Placeholder scan:** none — every code/prose step shows the actual content.

**Type consistency:** `interpreterId` (ResolvedLinks) and `interpreter: {name, email?}` (SermonDocument) are defined in Task 1 and consumed identically in Tasks 2-3; `buildSermonEntryFields` signature unchanged (`(sermon, links, options?)`). The `.mjs` block matches the TS block field-for-field (the parity test enforces it).

**Note on pre-existing drift:** if Task 2's non-interpreted parity baseline fails, that is a real pre-existing `.ts`↔`.mjs` divergence, not this ticket's regression — record it in `tasks/todo.md` tagged `ICR-149` and surface to the orchestrator rather than expanding scope.
