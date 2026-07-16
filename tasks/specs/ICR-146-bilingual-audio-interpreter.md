# ICR-146 — Sermon page: express bilingual/interpreted audio and credit the live interpreter

**Jira:** https://divinelab.atlassian.net/browse/ICR-146
**Issue type:** Story → commit type `feat` → **cuts a MINOR release on merge**
(`.releaserc.json` `releaseRules`: `feat`→minor · `fix`/`perf`/`docs`→patch · `chore`→false. The
squash-merge takes its type from the **PR title**.)
**QA depth:** heavy · **QA type:** ui
**Branch:** `feat/ICR-146-bilingual-audio-interpreter`
**Sensitive areas:** `i18n-messages` · Contentful content-model change · deferred production action

---

## 0. Premise verification (done before this spec was written)

A refined ticket is not a verified one (lessons: ICR-46 / ICR-108 / ICR-111 / ICR-145). Every claim
in the issue was checked against the live Contentful space (`vg9le24yw8hb`) and the code on
`origin/main` @ `3f0fb1c`.

| Ticket claim                                                                   | Verdict                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sermon` type has no way to express audio language or an interpreter           | ✅ confirmed (fields list below)                                                                                                                                              |
| `master` and `staging` are identical for `sermon` (both v4)                    | ✅ confirmed — clean base, no drift                                                                                                                                           |
| `audio` is a single non-localized `Asset` link                                 | ✅ confirmed                                                                                                                                                                  |
| 5 sermon entries exist                                                         | ✅ confirmed                                                                                                                                                                  |
| `4Tp4Qg3SGEIEIJn09w5OjW` (2026-07-12) is still an unpublished draft            | ✅ confirmed (`publishedCounter: 0`)                                                                                                                                          |
| Exactly 2 sermons are currently published                                      | ✅ confirmed — `7fZsjCXMQKo0PtZqOh7tew` (la-paradoja…), `5TfJ1CiUnYQweMT0Mdn25z` (el-deseo-mas-profundo…)                                                                     |
| The interpreter fact is hand-written as a closing `blockquote` in both locales | ✅ confirmed — verbatim text in §6                                                                                                                                            |
| Next migration number is 13                                                    | ✅ confirmed (highest existing: `12-constrain-footer-links.cjs`)                                                                                                              |
| `audio-in-spanish` has exactly one call-site                                   | ✅ confirmed — `SermonDetails.tsx:49`, no other reader                                                                                                                        |
| `SermonDetails.tsx:48-52` is the note                                          | ❌ **off by one** — the real block is **:46–51**, `t()` at **:49**                                                                                                            |
| (not claimed)                                                                  | ❌ **ticket missed `SERMON_CARD_FIELDS`** — a _second_ field-set (`getSermons.ts:119-156`) with its **own duplicated** `preacher` fragment (:141–150). Not a shared constant. |
| (not claimed)                                                                  | ❌ **the display-rule table omits a 5th case** — English-only audio on the es-AR page. The rule implies it; the proposed key set covers it.                                   |

**Jonathan Hanegan already exists as an `author` entry** → `32VynQChlpA00VsRMtNGJu`. No entry needs
creating. Doug Wagner (`7vbPLBMlSUZN8ikicoxkdM`) is already this sermon's `preacher`.

**Non-localized fields are stored under the `es-AR` key only** (verified on `preacher`, `audio`,
`sermonDate`). The backfill must write `audioLanguages`/`interpreter` that way, and the CDA then
serves one value to both locale pages — which is exactly the semantics we want.

---

## 1. Dependencies Check

Everything required already exists. Nothing blocks implementation.

| Needs to exist                                             | Status                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `author` content type with a `name`/`avatar`/`email` shape | ✅ used by `preacher` today                                                 |
| Jonathan Hanegan `author` entry                            | ✅ `32VynQChlpA00VsRMtNGJu`                                                 |
| `contentful-migration` runner                              | ✅ `scripts/contentful/run.mjs` (refuses `master` **and** `production`)     |
| CMA data-migration idiom (`.mjs`, dry-runnable)            | ✅ e.g. `04c-link-beliefitem-verse.mjs`                                     |
| `Locale` type + validator                                  | ✅ `src/i18n/config.ts` — `i18n.locales`, `type Locale`, `isValidLocale()`  |
| Pure-helper + colocated-test idiom                         | ✅ `src/utils/formatDate.ts` + `formatDate.test.ts` (Vitest)                |
| `locale` available in `SermonDetails`                      | ✅ already a prop (`SermonDetails.tsx:16,23`); it already computes `isEnUs` |
| `getInitials()` for avatar fallback                        | ✅ exported from `blog-post-details/AuthorInfo.tsx`                         |

**Baseline to preserve:** `pnpm test` = **508 passing / 49 files** (`@idcr/web`) + 2/1 (`@idcr/ui`).
No test may be silently dropped.

---

## 2. ⚠️ Deployment ordering — READ BEFORE IMPLEMENTING

This is the single highest-risk fact in the ticket, and **the issue's own runbook gets it wrong.**

Adding `audioLanguages` / `interpreter` to `GRAPHQL_FIELDS` makes the sermon query name fields that
**do not exist in the production content model**. Contentful rejects the _entire_ query
(`Cannot query field "audioLanguages" on type "Sermon"`), `fetchGraphQL` returns `data: null`, and
therefore:

- `getSermon()` → `undefined` → **every sermon detail page 404s**
- `getAllSermons()` → `[]` → **the sermon archive renders empty**
- `getLatestSermons()` → `[]` → home-page sermon section empties

So the model promotion is **not a post-merge step. It is a pre-deploy prerequisite.**

**REVISED order (updated 2026-07-14 after the CP6 staging-drift finding — this SUPERSEDES the
design-gate version, which deferred the backfill until after the deploy):**

| #   | Actor     | Action                                                                                                                          |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | agent     | Write `13-add-sermon-audio-fields.cjs`; apply it to the **`staging`** env only. ✅ done (`bb6eb5a`)                             |
| 2   | **HUMAN** | **Contentful Merge `staging` → `production`** (the 2 additive optional fields). Invisible to current prod code and to visitors. |
| 3   | **HUMAN** | Run `13b-backfill-sermon-audio.mjs --dry-run` against `production`, eyeball the plan, then run it for real.                     |
| 4   | agent     | Preview QA — now exercises **every** AC against real data.                                                                      |
| 5   | human     | Merge PR → production deploy — safe, no broken window.                                                                          |
| 6   | **HUMAN** | `POST /api/revalidate` (flush the `site-content` tag).                                                                          |

### Why the backfill moved BEFORE the deploy (it is safe, and it is what makes QA real)

**Why it is safe.** The code currently in production does not query `audioLanguages` or `interpreter`,
so populating them changes nothing a visitor can see:

- The **2 published** sermons gain `audioLanguages: ["es-AR"]` and are republished — an inert field the
  live code ignores. Zero visual change.
- The **3 drafts** (including the 2026-07-12 bilingual sermon) are **left as drafts**. The blockquote
  removal therefore touches **no live content**.

**Why it is necessary.** Preview QA renders **draft** content (`VERCEL_ENV=preview` ⇒
`shouldUseDraftMode()` ⇒ `preview: true`). If the backfill has not run, every sermon has
`audioLanguages` absent ⇒ the mapper defaults to `["es-AR"]` ⇒ QA can prove AC2/AC7 (no regression) but
**cannot demonstrate AC1 (the bilingual notice) or AC3 (the interpreter credit) at all** — no entry
carries the data. Running the backfill first is what lets preview QA exercise the feature it exists to
test, against the real content that will ship.

> ⚠️ **One constraint this creates:** do **not** publish the 2026-07-12 sermon between step 3 and the
> production deploy (step 5). Its interpreter blockquote is gone by then, and the badge that replaces it
> only renders once the new code is live. It is awaiting human review anyway (`/predica` Gate 2), so this
> is the status quo — just do not publish it early.

Because the fields are **additive and optional**, step 2 is a no-op for the code currently in
production. That is what makes doing it early safe.

**No agent ever performs step 2, 3, or 6.** The Contentful cutover is human-only
(`.claude/config.json` → `contentful.cutover.humanGate: true`).

### Staging content drift (discovered at CP6 — it changed how the backfill was validated)

The `staging` Contentful env is a **model** work-env, not a content mirror: it holds **1** sermon entry,
not production's 5, and does **not** contain the bilingual sermon. So the `13b` dry-run against staging
could not exercise the script's two riskiest paths — the blockquote removal and the
republish-only-if-already-published branch.

Rather than defer that to "we'll eyeball it at cutover" (a deferral that lands nowhere), the matcher is
**pinned by unit tests against the real rich-text document** copied verbatim from the live entry
(`13b-backfill-sermon-audio.test.mjs`, 10 tests), including negative controls asserting that a
legitimate closing scripture blockquote (Marcos 16:7) **survives**. Those tests were mutation-checked
(`&&` → `||`) to prove they can actually fail.

The human should still run `--dry-run` against production before the real run — that is step 3.

---

## 3. Requirements

1. **R1 — Content model (`sermon`), additive + optional + non-localized.**
   - `audioLanguages`: `Array<Symbol>`, `localized: false`, `required: false`,
     items validated `in: ["es-AR", "en-US"]`.
   - `interpreter`: `Link<Entry>`, `localized: false`, `required: false`,
     validated `linkContentType: ["author"]`.
   - Neither field may be `required` — the 4 existing Spanish-only sermons must stay valid with the
     field entirely absent (AC2, AC7).

2. **R2 — A pure display-rule helper** at `src/utils/sermon/audioLanguage.ts`, unit-testable with no
   browser and no React. It exports **two** functions — the normalizer is exported because the mapper
   (R4) must reuse it rather than reimplement it; a second copy of this logic is exactly how the two
   drift apart.

   ```ts
   export type AudioLanguageNotice = "es" | "en" | "bilingual" | null;

   /** Absent / empty / all-unknown ⇒ ["es-AR"]. Drops unknown locales; collapses duplicates. */
   export function normalizeAudioLanguages(
     value: readonly string[] | undefined | null,
   ): Locale[];

   export function getAudioLanguageNotice(
     audioLanguages: readonly string[] | undefined | null,
     pageLocale: Locale,
   ): AudioLanguageNotice;
   ```

   Behaviour:
   - Normalize (`normalizeAudioLanguages`): drop values that are not valid locales (`isValidLocale`);
     collapse duplicates; if the result is empty (absent, `[]`, or all-garbage) ⇒ `["es-AR"]`.
     **Guaranteed non-empty.**
   - Reduce: both locales present ⇒ `"bilingual"`; only `es-AR` ⇒ `"es"`; only `en-US` ⇒ `"en"`.
   - Suppress: if the audio is _exactly_ the page's own single language ⇒ return `null`
     (render nothing). `"bilingual"` is never suppressed.
   - Order is irrelevant.

3. **R3 — Read path.** Add `audioLanguages` and an `interpreter { ... on Author { name avatar { url title } email } }`
   fragment (mirroring `preacher`, `getSermons.ts:49-58`) to **`GRAPHQL_FIELDS` only**.
   `SERMON_CARD_FIELDS` is **not** touched — list-view badges are explicitly out of scope.

4. **R4 — Mapper default.** `mapSermon()` sets
   `audioLanguages: normalizeAudioLanguages(item.audioLanguages as string[] | undefined)` — it
   **calls the R2 export, it does not reimplement it** — and maps `interpreter`
   (absent ⇒ `undefined`).
   **Note the shared-mapper subtlety:** `mapSermon()` serves _both_ queries, so card results (which
   never request `audioLanguages`) also receive the `["es-AR"]` default. That is harmless — no card
   renders it — but it is deliberate, not accidental, and is called out in a code comment so a future
   reader does not mistake it for a bug.

5. **R5 — Replace the false note.** Delete the `{sermon.audio && isEnUs && …t("audio-in-spanish")}`
   block (`SermonDetails.tsx:46-51`) and the `isEnUs` local (:29). Render the notice from the helper
   instead, in the same position (directly beneath the player), with the same muted styling. The
   note must be driven **entirely** by `audioLanguages` — one mechanism, not two (AC4).

6. **R6 — Credit the interpreter.** In `SermonHeader.tsx`, below the existing `preached-by` block,
   render an `interpreted-by` block **when `sermon.interpreter` is set**, using the same avatar
   treatment as the preacher (human decision at the design gate) but **without repeating the sermon
   date** — `AuthorInfo` hardcodes a date line, so reusing it verbatim would print the date twice.
   The interpreter must **not** appear in the `preachers` array (`SermonHeader.tsx:25`) and must not
   reach `SermonByline` (AC3).

7. **R7 — i18n.** Add to the `Sermons.*` namespace in **both** locale files; **remove**
   `audio-in-spanish` from both. No key may exist in one file only (AC5).

8. **R8 — Migrations.** Two committed files, following the repo's `NN` (model, `.cjs`) / `NNb`
   (data, `.mjs`) split:
   - `13-add-sermon-audio-fields.cjs` — the model change. Idempotent (guard on field presence before
     `createField`). Applied to `staging` by the agent via `run.mjs`; promoted to production by a
     **human** via Contentful Merge.
   - `13b-backfill-sermon-audio.mjs` — the entry backfill. Dry-runnable, idempotent, and **must not
     publish an entry that was not already published** (see §6).

9. **R9 — Type hygiene.** `preacher`, `additionalPreachers` and (new) `interpreter` are three copies
   of the same inline author shape in `src/types/Sermon.ts`. Extract a single `SermonAuthor`
   interface and use it for all three rather than adding a third duplicate. Pure type refactor —
   identical structure, no behaviour change.

---

## 4. Data Model Changes

### Contentful — `sermon` (space `vg9le24yw8hb`)

```
+ audioLanguages   Array<Symbol>   localized:false  required:false
                   items.validations: [{ in: ["es-AR", "en-US"] }]

+ interpreter      Link<Entry>     localized:false  required:false
                   validations: [{ linkContentType: ["author"] }]
```

Nothing else on the type changes. `audio` stays a single non-localized `Asset` — correct for one
recording that carries both languages.

### TypeScript — `src/types/Sermon.ts`

```ts
import type { Locale } from "@src/i18n/config";

/** The author shape shared by preacher, additionalPreachers and interpreter. */
export interface SermonAuthor {
  name: string;
  avatar?: { url: string; title: string };
  email: string;
}

export interface Sermon {
  // …
  preacher: SermonAuthor;
  additionalPreachers?: SermonAuthor[];

  /**
   * Languages spoken in the audio recording. Non-localized in Contentful: one
   * recording serves both locale pages. The mapper guarantees a non-empty array
   * (absent/empty ⇒ ["es-AR"]), so consumers never handle undefined.
   */
  audioLanguages: Locale[];

  /** Live interpreter, when the message was interpreted. NOT a preacher. */
  interpreter?: SermonAuthor;
  // …
}
```

### MongoDB

None. This ticket touches no collection.

---

## 5. API Changes

**None.** No route handler and no Server Action changes. The only data-layer change is the
hand-written GraphQL read path in `lib/contentful/getSermons.ts`. There is no Zod boundary to add:
the input is Contentful's own response, and the helper sanitizes unknown values structurally
(`isValidLocale`) rather than by schema validation.

---

## 6. The backfill (`13b`) — exact behaviour

Entries, verified live:

| Entry id                 | Sermon                              | Published?    | `audioLanguages` →  | `interpreter` →                             |
| ------------------------ | ----------------------------------- | ------------- | ------------------- | ------------------------------------------- |
| `4Tp4Qg3SGEIEIJn09w5OjW` | 2026-07-12 · Lo negué… (Pedro)      | **draft**     | `["es-AR","en-US"]` | Jonathan Hanegan (`32VynQChlpA00VsRMtNGJu`) |
| `3877ZdNLxXtAJUIEGhnsYY` | 2026-06-28 · Consuelo…              | draft         | `["es-AR"]`         | —                                           |
| `7fZsjCXMQKo0PtZqOh7tew` | 2026-06-21 · La paradoja…           | **published** | `["es-AR"]`         | —                                           |
| `3x35gLRIyOIo9xLNP2qEeD` | 2026-06-14 · Dios toca la puerta    | draft         | `["es-AR"]`         | —                                           |
| `5TfJ1CiUnYQweMT0Mdn25z` | 2026-06-07 · El deseo más profundo… | **published** | `["es-AR"]`         | —                                           |

### Publish safety (the part that can do real damage)

- **Only the 2 already-published entries may be re-published.** A draft-only `entry.update` does not
  change an entry's published version, so without a republish the CDA keeps serving the old data
  (this is the ICR-114 lesson, in reverse).
- **The 3 drafts must stay drafts.** Publishing one would ship unreviewed content to the live site —
  including the 2026-07-12 sermon, which is deliberately awaiting human review.
- Rule the script enforces: `if (entry.sys.publishedVersion != null) republish; else leave as draft.`
  Never publish unconditionally.

### Blockquote removal (the 2026-07-12 draft only)

The last node of `content` in **both** locales is the hand-written interpreter note. It is replaced
by data, so it is removed. Verified verbatim:

- **es-AR:** _"Nota: Doug Wagner predicó este mensaje en inglés y Jonathan Hanegan lo fue
  interpretando al español en vivo. Por eso la grabación se escucha en los dos idiomas."_
- **en-US:** _"Note: Doug Wagner preached this message in English, with live Spanish interpretation
  by Jonathan Hanegan. That is why the recording is in both languages."_

The script must remove the node **by matching its content** (a trailing `blockquote` whose text
contains the interpreter sentence), not blindly by index — the document ends with a `blockquote` only
because of this note, but an index-based delete would silently destroy a legitimate closing quote if
the entry is edited before cutover. If the expected node is **not** found, the script logs and skips
(idempotent re-run), it does not throw.

---

## 7. New / Modified Files

### New

| File                                                                    | Purpose                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/utils/sermon/audioLanguage.ts`                            | The pure display-rule helper (R2).                                        |
| `apps/web/src/utils/sermon/audioLanguage.test.ts`                       | Unit tests — all page-locale × audio permutations + absent/empty/garbage. |
| `apps/web/src/components/features/sermon-details/SermonInterpreter.tsx` | Avatar + name credit block, no date (R6).                                 |
| `apps/web/scripts/contentful/migrations/13-add-sermon-audio-fields.cjs` | Model change (staging; human-promoted to prod).                           |
| `apps/web/scripts/contentful/migrations/13b-backfill-sermon-audio.mjs`  | Entry backfill + blockquote removal + safe republish.                     |

### Modified

| File                                                                | Change                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/contentful/getSermons.ts`                             | `GRAPHQL_FIELDS` += `audioLanguages` + `interpreter` fragment; `mapSermon()` += `normalizeAudioLanguages(...)` + interpreter. `SERMON_CARD_FIELDS` untouched. |
| `apps/web/lib/contentful/getSermons.test.ts`                        | **Already exists** — extend it. Mapper tests: absent ⇒ `["es-AR"]`; explicit values pass through; garbage sanitized; `interpreter` absent ⇒ `undefined`.      |
| `apps/web/src/types/Sermon.ts`                                      | `SermonAuthor` extraction (R9) + `audioLanguages` + `interpreter`.                                                                                            |
| `apps/web/src/components/features/sermon-details/SermonDetails.tsx` | Delete the `audio-in-spanish` block + `isEnUs`; render the helper-driven notice.                                                                              |
| `apps/web/src/components/features/sermon-details/SermonHeader.tsx`  | Render `SermonInterpreter` when `interpreter` is set; keep it out of `preachers`.                                                                             |
| `apps/web/src/components/features/sermon-details/index.ts`          | Export `SermonInterpreter`.                                                                                                                                   |
| `apps/web/public/locales/es-AR.json`                                | `Sermons`: += `audio-language.*`, `interpreted-by`; **−** `audio-in-spanish`.                                                                                 |
| `apps/web/public/locales/en-US.json`                                | Same.                                                                                                                                                         |

---

## 8. Component Hierarchy

```
app/[locale]/predicas/[slug]/page.tsx        (RSC — resolves locale, fetches sermon)
└── SermonDetails                            (RSC, async; receives `locale`)
    ├── SermonHeader                         ("use client")
    │   ├── date overline · title · thesis
    │   ├── [PREDICADO POR]
    │   │   ├── SermonByline   (>1 preacher — avatars + names joined by "·")
    │   │   └── AuthorInfo     (1 preacher — avatar + name + date)
    │   └── [INTERPRETADO POR]               ◀── NEW (only when interpreter set)
    │       └── SermonInterpreter            ◀── NEW: avatar (or initials) + name, NO date
    │
    ├── SermonAudioPlayer                    (when audio present)
    ├── <p> audio-language notice            ◀── REPLACES the hardcoded audio-in-spanish note
    │       rendered iff getAudioLanguageNotice(...) !== null
    │
    ├── PdfDownloadButton
    ├── SermonContent                        (rich text — the interpreter blockquote is removed by 13b)
    ├── ScriptureReferences
    ├── PostActions
    └── RelatedSermons
```

Responsive: the notice is a single muted `<p>` inside the existing `max-w-2xl` column; no layout
change at any breakpoint. `SermonInterpreter` reuses the preacher block's flex/avatar classes, so it
inherits the same behaviour.

---

## 9. Edge Cases

| #   | Case                                                                | Expected                                                                                                                         |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `audioLanguages` **absent** (all 4 legacy sermons, pre-backfill)    | ⇒ `["es-AR"]`. es-AR page: no notice. en-US page: "This sermon's audio is in Spanish." — **byte-identical to today** (AC2, AC7). |
| 2   | `audioLanguages: []` (editor cleared it)                            | Same as absent ⇒ `["es-AR"]`.                                                                                                    |
| 3   | `audioLanguages: ["es-AR","en-US"]`                                 | Notice on **both** locales ("…en español e inglés." / "…in Spanish and English.").                                               |
| 4   | `audioLanguages: ["en-US"]` — **the case the ticket's table omits** | es-AR page: "El audio de esta prédica está en inglés." en-US page: **no notice**.                                                |
| 5   | `audioLanguages: ["es-AR"]`                                         | es-AR: nothing. en-US: the Spanish note.                                                                                         |
| 6   | Order/duplicates: `["en-US","es-AR"]`, `["es-AR","es-AR"]`          | Order-insensitive; duplicates collapse.                                                                                          |
| 7   | Garbage value: `["es-AR","fr-FR"]`                                  | `fr-FR` dropped ⇒ `["es-AR"]`. Never renders an unknown language.                                                                |
| 8   | All-garbage: `["fr-FR"]`                                            | Empty after filtering ⇒ falls back to `["es-AR"]`. Never renders nothing-but-garbage.                                            |
| 9   | **Sermon has no audio at all**                                      | Notice suppressed entirely — it is meaningless without a player. Guard on `sermon.audio` as the current code does.               |
| 10  | `interpreter` set but sermon has no audio                           | Credit still renders (a person interpreted the live message regardless of whether we posted a recording).                        |
| 11  | `interpreter` set on a multi-preacher sermon                        | Interpreter renders in its own block; `preachers` array is untouched, so `SermonByline` never receives them (AC3).               |
| 12  | Interpreter has no `avatar`                                         | Initials fallback via `getInitials()` — same as the preacher path.                                                               |
| 13  | Query runs before the model exists in the target env                | **The whole query fails** → §2. Prevented by ordering, not by code.                                                              |

---

## 10. i18n

Both files, `Sermons.*` namespace (currently 13 keys at `:31-46` in each).

**Removed:** `audio-in-spanish` (its only call-site disappears).

**Added:**

`apps/web/public/locales/es-AR.json`

```json
"audio-language": {
  "es": "El audio de esta prédica está en español.",
  "en": "El audio de esta prédica está en inglés.",
  "bilingual": "El audio de esta prédica está en español e inglés."
},
"interpreted-by": "Interpretado por"
```

`apps/web/public/locales/en-US.json`

```json
"audio-language": {
  "es": "This sermon's audio is in Spanish.",
  "en": "This sermon's audio is in English.",
  "bilingual": "This sermon's audio is in Spanish and English."
},
"interpreted-by": "Interpreted by"
```

Notes:

- `en-US → audio-language.es` is **byte-identical** to today's `audio-in-spanish`. That is what makes
  AC2's "no visual regression" literally true rather than approximately true.
- es-AR copy is **voseo-consistent** with the rest of the file and carries its accents
  (`prédica`, `está`, `español`, `inglés`). Accents are correctness, not style (lesson ICR-49) —
  verify them character-by-character against this spec at review.
- `audio-language.es` in **es-AR.json** is never rendered (that combination returns `null`). It
  exists for key parity, which AC5 requires.
- The consumer uses `t("audio-language.es"|"en"|"bilingual")` keyed by the helper's return value —
  the key suffix is exactly the helper's `AudioLanguageNotice` union, so the compiler ties them
  together.

---

## 11. Testing Strategy

### Unit (Vitest) — the load-bearing coverage

`src/utils/sermon/audioLanguage.test.ts` — the helper is pure, so every AC-relevant permutation is
cheap and deterministic:

| Input               | `pageLocale` | Expect                            |
| ------------------- | ------------ | --------------------------------- |
| `undefined`         | `es-AR`      | `null`                            |
| `undefined`         | `en-US`      | `"es"`                            |
| `[]`                | `en-US`      | `"es"`                            |
| `["es-AR"]`         | `es-AR`      | `null`                            |
| `["es-AR"]`         | `en-US`      | `"es"`                            |
| `["es-AR","en-US"]` | `es-AR`      | `"bilingual"`                     |
| `["es-AR","en-US"]` | `en-US`      | `"bilingual"`                     |
| `["en-US"]`         | `es-AR`      | `"en"`                            |
| `["en-US"]`         | `en-US`      | `null`                            |
| `["en-US","es-AR"]` | `es-AR`      | `"bilingual"` (order-insensitive) |
| `["es-AR","es-AR"]` | `en-US`      | `"es"` (dupes collapse)           |
| `["es-AR","fr-FR"]` | `en-US`      | `"es"` (garbage dropped)          |
| `["fr-FR"]`         | `es-AR`      | `null` (⇒ `["es-AR"]`)            |

Mapper tests: `audioLanguages` absent ⇒ `["es-AR"]`; explicit values pass through; garbage sanitized;
`interpreter` absent ⇒ `undefined`.

**These tests are genuinely new behaviour, so normal TDD RED→GREEN applies** — write them first and
watch them fail (the helper does not exist yet). No mutation-check needed: this is not the
ICR-108/ICR-148 "test against already-correct code" case.

**Confirm the new tests actually EXECUTE.** `vitest.config.ts` includes `src/**` and `lib/**`, so
`src/utils/sermon/*.test.ts` and the extended `lib/contentful/getSermons.test.ts` are both covered —
but verify by the reported file/test **count**, not by a green run. ICR-21 shipped a test file that
was silently skipped (directory absent from the include globs) and still reported green. Baseline is
**508 passing / 49 files**; after CP1–CP3 the file count must go **up**, and no existing test may
vanish.

**i18n parity check:** assert that the `Sermons` key sets of the two locale files are identical and
that `audio-in-spanish` is absent from both. This is what makes AC5 mechanical instead of a
human eyeball.

### Manual smoke (preview, both locales) — after the human promotes the model

Seed permutations in Contentful, then walk `/es-AR/predicas/<slug>` and `/en-US/predicas/<slug>`:
bilingual sermon, Spanish-only sermon, and (if cheap) an English-only sermon.

### Playwright (`config.playwrightProjectMap`)

`apps/web/src/components/**` and `apps/web/lib/contentful/**` both map to `e2ePublic` / `e2eBlog`.
Heavy depth ⇒ the `qa-runner` authors specs per-ticket. E2E must **not** POST to any live
integration (lesson ICR-44).

---

## 12. Implementation Checkpoints

Seven checkpoints (≤ 8, so no split gate).

| #     | Scope                                                                                                                                                                                                     | Files                                                                                 | Verification                                                                                                                                                                                                         | Commit                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **1** | **Helper, TDD.** Write the failing tests first, then `getAudioLanguageNotice`.                                                                                                                            | `src/utils/sermon/audioLanguage.{ts,test.ts}`                                         | RED: tests fail (module absent). GREEN: all 13 rows pass; `pnpm test` = 508 + new, none dropped.                                                                                                                     | `feat(ICR-146): add the sermon audio-language display rule`                |
| **2** | **Types + read path.** `SermonAuthor` extraction; `audioLanguages` + `interpreter` on `Sermon`; `GRAPHQL_FIELDS` + `mapSermon` (+ the shared-mapper comment). `SERMON_CARD_FIELDS` untouched.             | `src/types/Sermon.ts`, `lib/contentful/getSermons.ts` + mapper test                   | `pnpm type-check` clean; mapper tests green.                                                                                                                                                                         | `feat(ICR-146): read audioLanguages and interpreter from Contentful`       |
| **3** | **i18n.** Add `audio-language.*` + `interpreted-by` to both files; delete `audio-in-spanish` from both. Add the key-parity test.                                                                          | `public/locales/{es-AR,en-US}.json`, parity test                                      | Parity test green; both JSON files parse; accents verified against §10.                                                                                                                                              | `feat(ICR-146): add bilingual audio-language and interpreter i18n keys`    |
| **4** | **Render.** Replace the false note in `SermonDetails` (delete `isEnUs`); add `SermonInterpreter` + wire it into `SermonHeader`; export it.                                                                | `SermonDetails.tsx`, `SermonHeader.tsx`, `SermonInterpreter.tsx`, `index.ts`          | `pnpm type-check` + `pnpm lint` + `pnpm test`; `grep -r "audio-in-spanish"` returns **zero** hits repo-wide (AC4).                                                                                                   | `feat(ICR-146): render the audio-language notice and interpreter credit`   |
| **5** | **Model migration.** `13-add-sermon-audio-fields.cjs` (idempotent, guarded). Apply to **`staging`** only.                                                                                                 | `scripts/contentful/migrations/13-*.cjs`                                              | `printf 'n\n' \| node scripts/contentful/run.mjs 13 --dry-run` prints the plan; then apply; then re-read the `staging` type via MCP and confirm both fields with the right validations. Re-run ⇒ no-op (idempotent). | `feat(ICR-146): add audioLanguages and interpreter to the sermon model`    |
| **6** | **Backfill script.** `13b-backfill-sermon-audio.mjs` — dry-runnable, idempotent, publish-safe, content-matched blockquote removal. Run `--dry-run` against staging; **do not** run it against production. | `scripts/contentful/migrations/13b-*.mjs`                                             | Dry-run output lists exactly the 5 entries with the right target values, names the 2 it would republish, and names the 3 it would leave as drafts.                                                                   | `feat(ICR-146): add the sermon audio-language backfill migration`          |
| **7** | **Docs.** Record the new fields + the ordering constraint.                                                                                                                                                | `docs/architecture/contentful-data-layer.md` (and/or `docs/product/content-types.md`) | Docs evaluation at step 13.5.                                                                                                                                                                                        | `docs(ICR-146): document the sermon audio-language and interpreter fields` |

> **Checkpoint 5 is the Contentful model-change gate.** The implementer writes the `staging` env only
> and **never** `master`/`production` — `run.mjs` refuses both by name, and the MCP runs
> `PROTECTED_ENVIRONMENTS=master,production`. Two independent guards.

---

## 13. Open Questions

**None blocking.** Resolved at the design gate (2026-07-14):

1. **Notice copy** → full-sentence style, consistent across all three cases. Chosen so the en-US
   Spanish-only string stays byte-identical to today's.
2. **Interpreter presentation** → the **same avatar card as the preacher**, under a distinct
   `INTERPRETADO POR` label. _(I recommended the lighter no-avatar treatment; the human chose the
   avatar, and it is the better call — it gives real credit, which is the ticket's stated purpose.
   AC3 is satisfied by the distinct label and by keeping the interpreter out of the `preachers`
   array, not by visual de-emphasis. **QA must explicitly assert the interpreter is not listed as a
   preacher.**)_ Adjustment made to the chosen option: the date is **not** repeated under the
   interpreter's name.
3. **Migration structure** → split `13` (model, `.cjs`) / `13b` (data, `.mjs`), with the data script
   runnable against production by a human.
4. **Deployment order** → **the model is promoted to production BEFORE preview QA and before the
   prod deploy** (§2). This corrects the issue's runbook, which placed the promotion after merge and
   would have opened a window where every sermon page 404s.

### Flagged for the human, not blocking

- **`slug` anomaly (out of scope, logged to `tasks/todo.md`).** `sermon.slug` is declared
  `localized: false`, yet all 5 entries store a distinct `en-US` slug. A non-localized field serves
  the default-locale value to every locale, so the en-US slug data may be inert. Possible latent
  routing/SEO bug; unrelated to this ticket. Triage at step 15.
