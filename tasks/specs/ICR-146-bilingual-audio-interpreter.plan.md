# ICR-146 — Bilingual Audio + Interpreter Credit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` +
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Let a sermon say what language(s) its audio is actually in, and credit the live interpreter
who made it reachable — replacing a hardcoded note that currently tells every English reader
something false.

**Architecture:** Two additive, optional, **non-localized** Contentful fields (`audioLanguages`,
`interpreter`) flow through the hand-written GraphQL read path into a **single pure display rule**
(`getAudioLanguageNotice`) that decides which of three i18n strings to render — or none. The rule
subsumes the old `audio-in-spanish` note rather than sitting beside it, so there is exactly one
mechanism. A committed migration adds the fields; a separate, publish-safe CMA script backfills the
entries.

**Tech Stack:** Next.js 16 (App Router, RSC) · TypeScript strict · next-intl · Contentful GraphQL
(hand-written, no codegen) · `contentful-migration` (model) + `contentful-management` (data) ·
Vitest · Tailwind v4.

---

## Global Constraints

Copied verbatim from the spec. **Every task's requirements implicitly include this section.**

- **Commit type `feat`** → `.releaserc.json` `releaseRules`: `feat`→**minor**, `fix`/`perf`/`docs`→patch,
  `chore`→false. The squash-merge takes its type from the **PR title**, so merging this cuts a
  **minor** release. That is correct and intended for a Story.
- **Functional-first. No `class` declarations.** Model outcomes as return values, never by throwing
  custom `Error` subclasses for control flow.
- **`??` over `||`.** **`interface` over `type`** for object shapes. **No enums — const maps.**
- **Named exports** for components. **RSC-first** — do not add `"use client"` where it is not needed.
- **Every user-facing string must exist in BOTH `es-AR.json` and `en-US.json`.** Never one file only.
- **es-AR copy is voseo-consistent and carries its accents** (`prédica`, `está`, `español`, `inglés`).
  Accents are **correctness defects**, not style — transcribe them character-for-character.
- **NEVER write to the Contentful `master` alias or the `production` env.** The agent writes the
  **`staging`** env only. `run.mjs` refuses `master`/`production`; the MCP runs
  `PROTECTED_ENVIRONMENTS=master,production`. Do not attempt to work around either.
- **Baseline: `pnpm test` = 508 passing / 49 files (`@idcr/web`).** No existing test may disappear.
  After each task, the count only goes **up**.
- **`SERMON_CARD_FIELDS` is OUT OF SCOPE.** Do not add the new fields to it. List-view badges are
  explicitly excluded by the ticket.
- Path aliases: `@src/*` → `src/*`, `@lib/*` → `lib/*`. Work from `apps/web/`.

### ⚠️ Deployment ordering (why this can break production)

Adding the fields to `GRAPHQL_FIELDS` makes the query name fields that **do not exist in the
production model**. Contentful then rejects the _whole_ query → `data: null` → `getSermon()` returns
`undefined` → **every sermon page 404s and the archive empties**.

The model is therefore promoted to production by a **human, BEFORE preview QA and BEFORE the prod
deploy** (agreed at the design gate). Task 5 applies it to `staging` only, then **STOP and ask the
human to run Contentful Merge.** Do not proceed to QA before they confirm.

> **UPDATED 2026-07-14 (after the CP6 staging-drift finding).** The **backfill also moves before the
> deploy**, for the same reason QA needs it: preview renders DRAFT content, so if `13b` has not run,
> every sermon has `audioLanguages` absent ⇒ defaults to `["es-AR"]` ⇒ QA can prove AC2/AC7 but
> **cannot demonstrate AC1 or AC3 at all**. Running it first is safe — the live code does not query
> the new fields, the 2 published sermons only gain an inert field, and the 3 drafts (incl. the
> bilingual one whose blockquote is removed) stay drafts, so no live content changes. Full revised
> runbook: the spec's §2. Do not publish the 2026-07-12 sermon between the backfill and the deploy.

---

## File Structure

| File                                                           | Responsibility                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/utils/sermon/audioLanguage.ts`                            | **The whole display rule.** Pure, no React, no I/O. Exports the normalizer (reused by the mapper) + the notice selector. |
| `src/utils/sermon/audioLanguage.test.ts`                       | Every permutation of the rule.                                                                                           |
| `src/types/Sermon.ts`                                          | `SermonAuthor` (shared by preacher/additionalPreachers/interpreter) + the two new fields.                                |
| `lib/contentful/getSermons.ts`                                 | Read path: query fragment + mapper. Calls the normalizer — never reimplements it.                                        |
| `lib/contentful/getSermons.test.ts`                            | _(exists)_ Mapper behaviour for the new fields.                                                                          |
| `src/components/features/sermon-details/SermonInterpreter.tsx` | Renders the interpreter credit. Avatar + name, **no date**.                                                              |
| `src/components/features/sermon-details/SermonDetails.tsx`     | Renders the notice; the false `audio-in-spanish` block is deleted.                                                       |
| `src/components/features/sermon-details/SermonHeader.tsx`      | Renders the `interpreted-by` block. Keeps the interpreter OUT of `preachers`.                                            |
| `public/locales/{es-AR,en-US}.json`                            | The three notice strings + the `interpreted-by` label. `audio-in-spanish` removed.                                       |
| `src/i18n/messages.test.ts`                                    | Locale key-parity guard (makes AC5 mechanical).                                                                          |
| `scripts/contentful/migrations/13-add-sermon-audio-fields.cjs` | Model change. Idempotent. Staging only.                                                                                  |
| `scripts/contentful/migrations/13b-backfill-sermon-audio.mjs`  | Entry backfill. Publish-safe, idempotent, dry-runnable.                                                                  |

---

## Task 1: The display-rule helper (TDD)

**Files:**

- Create: `apps/web/src/utils/sermon/audioLanguage.ts`
- Test: `apps/web/src/utils/sermon/audioLanguage.test.ts`

**Interfaces:**

- Consumes: `isValidLocale`, `i18n`, `type Locale` from `@src/i18n/config`.
- Produces: `type AudioLanguageNotice = "es" | "en" | "bilingual" | null`;
  `normalizeAudioLanguages(value: readonly string[] | undefined | null): Locale[]` (**guaranteed
  non-empty** — Task 2's mapper depends on this);
  `getAudioLanguageNotice(audioLanguages: readonly string[] | undefined | null, pageLocale: Locale): AudioLanguageNotice`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/sermon/audioLanguage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getAudioLanguageNotice,
  normalizeAudioLanguages,
} from "./audioLanguage";

describe("normalizeAudioLanguages", () => {
  it("defaults absent/empty to the Spanish-only baseline", () => {
    expect(normalizeAudioLanguages(undefined)).toEqual(["es-AR"]);
    expect(normalizeAudioLanguages(null)).toEqual(["es-AR"]);
    expect(normalizeAudioLanguages([])).toEqual(["es-AR"]);
  });

  it("drops unknown locales", () => {
    expect(normalizeAudioLanguages(["es-AR", "fr-FR"])).toEqual(["es-AR"]);
  });

  it("falls back to the baseline when every value is unknown", () => {
    expect(normalizeAudioLanguages(["fr-FR", "de-DE"])).toEqual(["es-AR"]);
  });

  it("collapses duplicates", () => {
    expect(normalizeAudioLanguages(["es-AR", "es-AR"])).toEqual(["es-AR"]);
  });

  it("keeps both locales for a bilingual recording", () => {
    expect(normalizeAudioLanguages(["es-AR", "en-US"])).toEqual([
      "es-AR",
      "en-US",
    ]);
  });
});

describe("getAudioLanguageNotice", () => {
  // The audio matches the page's own language => say nothing. This is what keeps
  // the common case (a Spanish sermon on the Spanish page) visually clean.
  it("renders nothing when the audio is exactly the page language", () => {
    expect(getAudioLanguageNotice(["es-AR"], "es-AR")).toBeNull();
    expect(getAudioLanguageNotice(["en-US"], "en-US")).toBeNull();
  });

  // AC2 + AC7: the 4 legacy sermons have NO audioLanguages field at all and must
  // render exactly as they do today.
  it("treats an absent field as Spanish-only (the legacy sermons)", () => {
    expect(getAudioLanguageNotice(undefined, "es-AR")).toBeNull();
    expect(getAudioLanguageNotice(undefined, "en-US")).toBe("es");
    expect(getAudioLanguageNotice([], "en-US")).toBe("es");
  });

  it("announces a Spanish recording to an English reader", () => {
    expect(getAudioLanguageNotice(["es-AR"], "en-US")).toBe("es");
  });

  // The case the ticket's table omits: an English-only recording on the Spanish page.
  it("announces an English recording to a Spanish reader", () => {
    expect(getAudioLanguageNotice(["en-US"], "es-AR")).toBe("en");
  });

  // AC1: a bilingual recording is announced on BOTH locales — it is never the
  // page's "own" single language, so it is never suppressed.
  it("announces a bilingual recording on both locales", () => {
    expect(getAudioLanguageNotice(["es-AR", "en-US"], "es-AR")).toBe(
      "bilingual",
    );
    expect(getAudioLanguageNotice(["es-AR", "en-US"], "en-US")).toBe(
      "bilingual",
    );
  });

  it("is order-insensitive and duplicate-tolerant", () => {
    expect(getAudioLanguageNotice(["en-US", "es-AR"], "es-AR")).toBe(
      "bilingual",
    );
    expect(getAudioLanguageNotice(["es-AR", "es-AR"], "en-US")).toBe("es");
  });

  it("never renders an unknown language", () => {
    expect(getAudioLanguageNotice(["es-AR", "fr-FR"], "en-US")).toBe("es");
    expect(getAudioLanguageNotice(["fr-FR"], "es-AR")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it FAIL**

```bash
cd apps/web && pnpm vitest run src/utils/sermon/audioLanguage.test.ts
```

**Expected:** FAIL — `Failed to resolve import "./audioLanguage"`. The module does not exist yet.

> **STOP CONDITION:** if this somehow PASSES, stop and report. A passing test before the code exists
> means the test is not exercising what you think it is.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/utils/sermon/audioLanguage.ts`:

```ts
import { i18n, isValidLocale, type Locale } from "@src/i18n/config";

/**
 * Which audio-language notice a sermon page should render, or `null` for none.
 * The union members are also the i18n key suffixes (`Sermons.audio-language.*`),
 * so the compiler ties the rule to the copy.
 */
export type AudioLanguageNotice = "es" | "en" | "bilingual" | null;

/**
 * Sanitize Contentful's `audioLanguages` into a non-empty list of known locales.
 *
 * Absent / empty / all-unknown => `["es-AR"]`. Historically every sermon was
 * preached in Spanish, so "no data" means "Spanish" — that is what lets the 4
 * legacy sermons render correctly with the field entirely absent, WITHOUT a
 * required-field migration (ICR-146 AC2/AC7). The backfill sets explicit values,
 * but this default must survive it: a human authoring in the Contentful UI (or
 * /predica before ICR-147 lands) can still leave the field empty.
 */
export function normalizeAudioLanguages(
  value: readonly string[] | undefined | null,
): Locale[] {
  const known = (value ?? []).filter(isValidLocale);
  const unique = [...new Set(known)];
  return unique.length > 0 ? unique : [i18n.defaultLocale];
}

/**
 * The single display rule: announce the audio's language only when it DIFFERS
 * from the language the visitor is reading. A Spanish sermon on the Spanish page
 * needs no label; the same sermon on the English page does.
 *
 * A bilingual recording is never "exactly the page language", so it is always
 * announced — on both locales.
 */
export function getAudioLanguageNotice(
  audioLanguages: readonly string[] | undefined | null,
  pageLocale: Locale,
): AudioLanguageNotice {
  const languages = normalizeAudioLanguages(audioLanguages);

  if (languages.length > 1) return "bilingual";

  const only = languages[0];
  if (only === pageLocale) return null;

  return only === "es-AR" ? "es" : "en";
}
```

- [ ] **Step 4: Run the test and verify it PASSES**

```bash
cd apps/web && pnpm vitest run src/utils/sermon/audioLanguage.test.ts
```

**Expected:** PASS — 2 suites, 12 tests.

- [ ] **Step 5: Verify the new test file actually EXECUTED and nothing was dropped**

```bash
cd apps/web && pnpm vitest run 2>&1 | tail -5
```

**Expected:** `Test Files 50 passed (50)` and `Tests 520 passed (520)` — i.e. **files 49 → 50** and
tests **508 → 520**. If the file count did NOT go up, your test file is being silently skipped
(ICR-21) — stop and report; do not proceed on a green run that never ran your test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/sermon/
git commit -m "feat(ICR-146): add the sermon audio-language display rule"
```

---

## Task 2: Types + Contentful read path

**Files:**

- Modify: `apps/web/src/types/Sermon.ts`
- Modify: `apps/web/lib/contentful/getSermons.ts` (`GRAPHQL_FIELDS` ~:6-105, `mapSermon` ~:158-192)
- Test: `apps/web/lib/contentful/getSermons.test.ts` _(exists — extend it)_

**Interfaces:**

- Consumes: `normalizeAudioLanguages` from Task 1.
- Produces: `interface SermonAuthor { name: string; avatar?: { url: string; title: string }; email: string }`;
  `Sermon.audioLanguages: Locale[]` (always present, never empty); `Sermon.interpreter?: SermonAuthor`.
  Task 4's components consume these.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/contentful/getSermons.test.ts` (the file already mocks `fetchGraphQL`; the
existing `SERMON_ITEM` fixture deliberately has **no** `audioLanguages`, so it doubles as the
"legacy sermon" case):

```ts
describe("getSermon — audioLanguages + interpreter (ICR-146)", () => {
  it("defaults audioLanguages to ['es-AR'] when the field is absent (legacy sermons)", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([SERMON_ITEM]),
    );

    const result = (await getSermon("la-gracia-de-dios", "es-AR"))!;

    expect(result.audioLanguages).toEqual(["es-AR"]);
  });

  it("passes an explicit bilingual audioLanguages through", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([
        { ...SERMON_ITEM, audioLanguages: ["es-AR", "en-US"] },
      ]),
    );

    const result = (await getSermon("la-gracia-de-dios", "es-AR"))!;

    expect(result.audioLanguages).toEqual(["es-AR", "en-US"]);
  });

  it("sanitizes unknown locales out of audioLanguages", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([
        { ...SERMON_ITEM, audioLanguages: ["es-AR", "fr-FR"] },
      ]),
    );

    const result = (await getSermon("la-gracia-de-dios", "es-AR"))!;

    expect(result.audioLanguages).toEqual(["es-AR"]);
  });

  it("maps interpreter when present, and leaves it undefined when absent", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([
        {
          ...SERMON_ITEM,
          interpreter: {
            name: "Jonathan Hanegan",
            avatar: {
              url: "https://images.ctfassets.net/jh.jpg",
              title: "Jonathan Hanegan",
            },
            email: "jh@example.com",
          },
        },
      ]),
    );

    const withInterpreter = (await getSermon("la-gracia-de-dios", "es-AR"))!;
    expect(withInterpreter.interpreter?.name).toBe("Jonathan Hanegan");

    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([SERMON_ITEM]),
    );
    const without = (await getSermon("la-gracia-de-dios", "es-AR"))!;
    expect(without.interpreter).toBeUndefined();
  });

  it("requests both new fields in the detail query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([SERMON_ITEM]),
    );

    await getSermon("la-gracia-de-dios", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("audioLanguages");
    expect(query).toContain("interpreter");
  });

  // The archive query must stay lean (TOO_COMPLEX_QUERY guard) and renders no
  // badge, so it must NOT gain the new fields.
  it("does NOT request the new fields in the archive query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([SERMON_ITEM]),
    );

    await getAllSermons("es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).not.toContain("audioLanguages");
    expect(query).not.toContain("interpreter");
  });
});
```

- [ ] **Step 2: Run and watch it FAIL**

```bash
cd apps/web && pnpm vitest run lib/contentful/getSermons.test.ts
```

**Expected:** FAIL — `expected undefined to deeply equal [ 'es-AR' ]` (the mapper does not set
`audioLanguages` yet) and `expected '…' to contain 'audioLanguages'`.

- [ ] **Step 3: Update the `Sermon` type**

In `apps/web/src/types/Sermon.ts` — add the import, extract `SermonAuthor`, and replace the three
inline author shapes with it:

```ts
import type { Locale } from "@src/i18n/config";

/** The author shape shared by `preacher`, `additionalPreachers` and `interpreter`. */
export interface SermonAuthor {
  name: string;
  avatar?: {
    url: string;
    title: string;
  };
  email: string;
}
```

Then inside `interface Sermon`, replace the inline `preacher` / `additionalPreachers` shapes and add
the two new fields:

```ts
  preacher: SermonAuthor;
  /**
   * Co-preachers for a multi-preacher service (optional). When present, the byline
   * lists `[preacher, ...additionalPreachers]`; absent for normal single-author sermons.
   */
  additionalPreachers?: SermonAuthor[];

  /**
   * Languages spoken in the audio recording. NON-LOCALIZED in Contentful: one
   * recording serves both locale pages, so both pages see the same value.
   * The mapper guarantees a non-empty array (absent/empty => ["es-AR"]), so
   * consumers never handle undefined.
   */
  audioLanguages: Locale[];

  /**
   * The live interpreter, when the message was interpreted into another language.
   * NOT a preacher: never add this person to the preacher byline (ICR-146 AC3).
   */
  interpreter?: SermonAuthor;
```

- [ ] **Step 4: Add both fields to `GRAPHQL_FIELDS` only**

In `apps/web/lib/contentful/getSermons.ts`, inside **`GRAPHQL_FIELDS`**, add `audioLanguages`
immediately after the `audio { … }` block, and the `interpreter` fragment immediately after the
`preacher { … }` block (it mirrors `preacher` exactly):

```graphql
  audio {
    url
    title
    contentType
    fileName
    size
  }
  audioLanguages
```

```graphql
  preacher {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  interpreter {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
```

**Do NOT touch `SERMON_CARD_FIELDS`.**

- [ ] **Step 5: Update `mapSermon`**

Add the import at the top of `getSermons.ts`:

```ts
import { normalizeAudioLanguages } from "@src/utils/sermon/audioLanguage";
```

Then in `mapSermon`, add the two fields to the returned object (put `audioLanguages` next to `audio`,
and `interpreter` next to `preacher`):

```ts
    audio: item.audio as Sermon["audio"],
    // NOTE: mapSermon serves BOTH the detail query (GRAPHQL_FIELDS, which requests
    // audioLanguages) and the archive query (SERMON_CARD_FIELDS, which does not).
    // Card results therefore get the ["es-AR"] default for a field they never
    // fetched. That is harmless — no card renders it — and deliberate: keeping the
    // field non-optional means no consumer has to handle `undefined`.
    audioLanguages: normalizeAudioLanguages(
      item.audioLanguages as string[] | undefined,
    ),
    interpreter: item.interpreter as Sermon["interpreter"],
```

- [ ] **Step 6: Run the tests and verify they PASS**

```bash
cd apps/web && pnpm vitest run lib/contentful/getSermons.test.ts && pnpm type-check
```

**Expected:** PASS (all existing getSermons tests + the 6 new ones), and `tsc --noEmit` clean.

> If `type-check` errors elsewhere in the repo because some other file used the old inline author
> shape, fix that file to use `SermonAuthor` — do not revert the extraction.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/types/Sermon.ts apps/web/lib/contentful/getSermons.ts apps/web/lib/contentful/getSermons.test.ts
git commit -m "feat(ICR-146): read audioLanguages and interpreter from Contentful"
```

---

## Task 3: i18n keys (both locales) + a parity guard

**Files:**

- Modify: `apps/web/public/locales/es-AR.json` (`Sermons` namespace, ~:31-46)
- Modify: `apps/web/public/locales/en-US.json` (`Sermons` namespace, ~:31-46)
- Create: `apps/web/src/i18n/messages.test.ts`

**Interfaces:**

- Produces: `Sermons.audio-language.{es,en,bilingual}` and `Sermons.interpreted-by` in both files.
  `Sermons.audio-in-spanish` **ceases to exist**. Task 4 consumes these.

- [ ] **Step 1: Write the failing parity test**

Create `apps/web/src/i18n/messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import esAR from "@public/locales/es-AR.json";
import enUS from "@public/locales/en-US.json";

/** Flattens {a:{b:"x"}} => ["a.b"], so a nested key can never drift between locales. */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale message files", () => {
  it("have identical key sets (no key may exist in one file only)", () => {
    const es = flattenKeys(esAR).sort();
    const en = flattenKeys(enUS).sort();

    expect(es.filter((k) => !en.includes(k))).toEqual([]); // missing from en-US
    expect(en.filter((k) => !es.includes(k))).toEqual([]); // missing from es-AR
  });

  it("expose the sermon audio-language notice in both locales", () => {
    for (const messages of [esAR, enUS]) {
      const keys = flattenKeys(messages);
      expect(keys).toContain("Sermons.audio-language.es");
      expect(keys).toContain("Sermons.audio-language.en");
      expect(keys).toContain("Sermons.audio-language.bilingual");
      expect(keys).toContain("Sermons.interpreted-by");
    }
  });

  // AC4: the hardcoded note is GONE, not merely unused.
  it("no longer define the retired audio-in-spanish key", () => {
    for (const messages of [esAR, enUS]) {
      expect(flattenKeys(messages)).not.toContain("Sermons.audio-in-spanish");
    }
  });

  it("keep the en-US Spanish-audio sentence byte-identical to the retired note", () => {
    // AC2: no visual regression for the 4 existing Spanish-only sermons.
    expect(enUS.Sermons["audio-language"].es).toBe(
      "This sermon's audio is in Spanish.",
    );
  });
});
```

- [ ] **Step 2: Run and watch it FAIL**

```bash
cd apps/web && pnpm vitest run src/i18n/messages.test.ts
```

**Expected:** FAIL — the `audio-language.*` keys do not exist, and `audio-in-spanish` still does.

> If the `@public/*` alias does not resolve in Vitest, import via a relative path
> (`../../public/locales/es-AR.json`) instead. Do not add a new alias.

- [ ] **Step 3: Edit `apps/web/public/locales/es-AR.json`**

In the `Sermons` object: **delete** the `"audio-in-spanish"` line and add the new keys. Result:

```json
  "Sermons": {
    "header-title": "Prédicas",
    "header-subtitle": "Mensajes de nuestros cultos dominicales",
    "preached-by": "Predicado por",
    "interpreted-by": "Interpretado por",
    "audio-language": {
      "es": "El audio de esta prédica está en español.",
      "en": "El audio de esta prédica está en inglés.",
      "bilingual": "El audio de esta prédica está en español e inglés."
    },
    "play": "Reproducir",
    "pause": "Pausar",
    "seek": "Buscar",
    "speed": "Velocidad",
    "scripture": "Pasaje bíblico",
    "bibleVersion": "NVI",
    "summary-pdf": "Descargar resumen (PDF)",
    "more-sermons": "Más prédicas",
    "no-sermons": "Aún no hay prédicas publicadas.",
    "view-all": "Ver todas las prédicas"
  },
```

**Check every accent against this block character-for-character**: `Prédicas`, `prédica`, `está`,
`español`, `inglés`, `Pasaje bíblico`, `Más prédicas`, `Aún`. A missing accent is a bug, not a typo.

- [ ] **Step 4: Edit `apps/web/public/locales/en-US.json`**

Same shape:

```json
  "Sermons": {
    "header-title": "Sermons",
    "header-subtitle": "Messages from our Sunday services",
    "preached-by": "Preached by",
    "interpreted-by": "Interpreted by",
    "audio-language": {
      "es": "This sermon's audio is in Spanish.",
      "en": "This sermon's audio is in English.",
      "bilingual": "This sermon's audio is in Spanish and English."
    },
    "play": "Play",
    "pause": "Pause",
    "seek": "Seek",
    "speed": "Speed",
    "scripture": "Scripture",
    "bibleVersion": "NIV",
    "summary-pdf": "Download summary (PDF)",
    "more-sermons": "More sermons",
    "no-sermons": "No sermons published yet.",
    "view-all": "View all sermons"
  },
```

- [ ] **Step 5: Run and verify PASS**

```bash
cd apps/web && pnpm vitest run src/i18n/messages.test.ts
node -e "require('./public/locales/es-AR.json'); require('./public/locales/en-US.json'); console.log('both parse OK')"
```

**Expected:** 4 tests PASS; both JSON files parse.

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/locales/ apps/web/src/i18n/messages.test.ts
git commit -m "feat(ICR-146): add bilingual audio-language and interpreter i18n keys"
```

---

## Task 4: Render the notice and the interpreter credit

**Files:**

- Create: `apps/web/src/components/features/sermon-details/SermonInterpreter.tsx`
- Modify: `apps/web/src/components/features/sermon-details/SermonDetails.tsx` (:29 and :46-51)
- Modify: `apps/web/src/components/features/sermon-details/SermonHeader.tsx` (:12-16, :50-67)
- Modify: `apps/web/src/components/features/sermon-details/index.ts`

**Interfaces:**

- Consumes: `getAudioLanguageNotice`, `AudioLanguageNotice` (Task 1); `Sermon.audioLanguages`,
  `Sermon.interpreter`, `SermonAuthor` (Task 2); the i18n keys (Task 3).
- Produces: `SermonInterpreter({ interpreter }: { readonly interpreter: SermonAuthor })`.

- [ ] **Step 1: Create `SermonInterpreter.tsx`**

```tsx
"use client";

import Image from "next/image";
import { Typography } from "@src/components/ui/typography";
import { getInitials } from "@src/components/features/blog-post-details/AuthorInfo";
import type { SermonAuthor } from "@src/types/Sermon";

interface SermonInterpreterProps {
  readonly interpreter: SermonAuthor;
}

/**
 * Credits the live interpreter of an interpreted message.
 *
 * Deliberately NOT rendered through `AuthorInfo`: that component prints the date
 * beneath the name, and the date already sits under the preacher — repeating it
 * here would read as a second byline.
 *
 * The interpreter is never added to `SermonHeader`'s `preachers` array: an
 * interpreter did not preach, and must never appear in the preacher byline
 * (ICR-146 AC3). The distinct "Interpretado por" label is what keeps the credit
 * honest while still giving the person real visual presence.
 */
export function SermonInterpreter({ interpreter }: SermonInterpreterProps) {
  return (
    <div className="flex items-center gap-4 text-gray-500">
      <div className="relative h-9 w-9 overflow-hidden rounded-full">
        {interpreter.avatar ? (
          <Image
            src={interpreter.avatar.url}
            alt={interpreter.avatar.title}
            fill
            className="object-cover object-top"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs font-semibold"
            aria-label={`${interpreter.name} avatar`}
          >
            {getInitials(interpreter.name)}
          </span>
        )}
      </div>
      <Typography
        component="p"
        variant="overline"
        className="font-semibold tracking-wide dark:text-gray-300"
      >
        {interpreter.name}
      </Typography>
    </div>
  );
}
```

- [ ] **Step 2: Export it from the barrel**

In `apps/web/src/components/features/sermon-details/index.ts`, add:

```ts
export { SermonInterpreter } from "./SermonInterpreter";
```

- [ ] **Step 3: Replace the false note in `SermonDetails.tsx`**

Add the imports:

```ts
import {
  getAudioLanguageNotice,
  type AudioLanguageNotice,
} from "@src/utils/sermon/audioLanguage";
import { i18n, isValidLocale } from "@src/i18n/config";
```

Add the const map above the component (repo convention: const map, never an enum). This also keeps
the i18n key strings out of a template literal, so a typo is a compile error:

```ts
const AUDIO_LANGUAGE_KEYS = {
  es: "audio-language.es",
  en: "audio-language.en",
  bilingual: "audio-language.bilingual",
} as const satisfies Record<Exclude<AudioLanguageNotice, null>, string>;
```

**Delete** line 29 (`const isEnUs = locale === "en-US";`) and replace it with:

```ts
const pageLocale = isValidLocale(locale) ? locale : i18n.defaultLocale;
const audioLanguageNotice = getAudioLanguageNotice(
  sermon.audioLanguages,
  pageLocale,
);
```

**Delete** the entire block at :46-51 and replace it with:

```tsx
{
  /* 3. Audio-language notice — driven ENTIRELY by `audioLanguages`.
            Renders only when the audio's language differs from the page's, so a
            Spanish sermon on the Spanish page stays clean. This SUPERSEDES the old
            hardcoded `audio-in-spanish` note, which told every en-US reader the
            audio was Spanish even when it was not (ICR-146 AC4). */
}
{
  sermon.audio && audioLanguageNotice && (
    <p className="text-sm text-muted-foreground">
      {t(AUDIO_LANGUAGE_KEYS[audioLanguageNotice])}
    </p>
  );
}
```

- [ ] **Step 4: Add the interpreter credit to `SermonHeader.tsx`**

Add the import:

```ts
import { SermonInterpreter } from "./SermonInterpreter";
```

Widen the props `Pick` (:12-16) to include `interpreter`:

```ts
  readonly sermon: Pick<
    Sermon,
    | "title"
    | "thesis"
    | "preacher"
    | "additionalPreachers"
    | "sermonDate"
    | "interpreter"
  >;
```

Immediately **after** the closing `</div>` of the existing preacher block (the one ending at :67,
before the `<Divider />`), insert:

```tsx
{
  /* Interpreter — a distinct, labeled block. NEVER folded into `preachers`:
          an interpreter did not preach (ICR-146 AC3). */
}
{
  sermon.interpreter && (
    <div className="flex flex-col gap-1">
      <Typography
        component="p"
        variant="overline"
        className="text-xs text-muted-foreground uppercase tracking-wide"
      >
        {t("interpreted-by")}
      </Typography>
      <SermonInterpreter interpreter={sermon.interpreter} />
    </div>
  );
}
```

**Do NOT change line 25** (`const preachers = [sermon.preacher, ...(sermon.additionalPreachers ?? [])];`).
The interpreter must not enter that array.

- [ ] **Step 5: Verify the retired key is GONE repo-wide (AC4)**

```bash
cd apps/web && grep -rn "audio-in-spanish" . --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules
```

**Expected:** **zero** output (exit 1).

> Quote the `--include` globs — an unquoted glob dies in zsh and prints nothing, which looks exactly
> like a clean negative (lesson ICR-103). Sanity-check your grep works by first running it for a key
> you know exists, e.g. `grep -rn "preached-by" . --include='*.json' | grep -v node_modules` — that
> MUST print hits. If the control prints nothing, your search is broken, not the codebase clean.

- [ ] **Step 6: Full verification**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-146 && pnpm type-check && pnpm lint && pnpm test 2>&1 | grep -E "Test Files|Tests "
```

**Expected:** type-check clean, lint clean, tests all pass with the file/test count **≥** Task 3's.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/features/sermon-details/
git commit -m "feat(ICR-146): render the audio-language notice and interpreter credit"
```

---

## Task 5: Contentful model migration (STAGING ONLY) — then STOP

**Files:**

- Create: `apps/web/scripts/contentful/migrations/13-add-sermon-audio-fields.cjs`

**Interfaces:**

- Produces: the `sermon.audioLanguages` + `sermon.interpreter` fields in the **`staging`** env.
  Everything downstream (preview QA, the prod deploy) depends on these fields existing in the env the
  app reads.

- [ ] **Step 1: Write the migration**

```js
// ICR-146: express bilingual/interpreted sermon audio.
//
// Adds two ADDITIVE, OPTIONAL, NON-LOCALIZED fields to `sermon`:
//   audioLanguages — Array<Symbol>, items validated in ["es-AR", "en-US"]. Bilingual = both.
//   interpreter    — Link<Entry> -> author. Structurally mirrors `preacher`, but is deliberately
//                    NOT `additionalPreachers`: an interpreter did not preach.
//
// Both are OPTIONAL by design: the 4 existing Spanish-only sermons must stay valid with the field
// entirely absent (the read path defaults absent => ["es-AR"]). Making either field required would
// force a data migration just to keep existing content valid.
//
// NON-LOCALIZED by design: one recording carries both languages, so one value serves both locale
// pages. (Contentful stores non-localized values under the default-locale key, `es-AR`.)
//
// Idempotent: guards on field presence before createField, so a re-run is a no-op.
//
// Applied to `staging` by run.mjs. Promoted to `production` by a HUMAN via Contentful Merge —
// and that promotion MUST happen BEFORE this branch's code is deployed, because the code queries
// these fields and Contentful fails the WHOLE query if they do not exist. See the plan's
// "Deployment ordering" section.
//
// Usage: node scripts/contentful/run.mjs 13 [--dry-run]

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });

  const sermon = items.find((type) => type.sys.id === "sermon");
  if (!sermon) return;

  const hasField = (id) => sermon.fields.some((field) => field.id === id);
  const sermonType = migration.editContentType("sermon");

  if (!hasField("audioLanguages")) {
    sermonType
      .createField("audioLanguages")
      .name("Audio languages")
      .type("Array")
      .localized(false)
      .required(false)
      .items({
        type: "Symbol",
        validations: [{ in: ["es-AR", "en-US"] }],
      });
  }

  if (!hasField("interpreter")) {
    sermonType
      .createField("interpreter")
      .name("Interpreter")
      .type("Link")
      .linkType("Entry")
      .localized(false)
      .required(false)
      .validations([{ linkContentType: ["author"] }]);
  }
};
```

- [ ] **Step 2: Dry-run it against staging**

```bash
cd apps/web && printf 'n\n' | node scripts/contentful/run.mjs 13 --dry-run
```

**Expected:** prints the plan (create 2 fields on `sermon`) and applies **nothing** (the confirm is
declined by the piped `n`).

- [ ] **Step 3: Apply it to staging**

```bash
cd apps/web && node scripts/contentful/run.mjs 13
```

**Expected:** `Applied 13-add-sermon-audio-fields.cjs to staging`.

> `run.mjs` throws if `CONTENTFUL_ENVIRONMENT` is `master` or `production`. Do not override it.

- [ ] **Step 4: Verify idempotency**

```bash
cd apps/web && node scripts/contentful/run.mjs 13
```

**Expected:** succeeds and creates nothing the second time (the guards short-circuit).

- [ ] **Step 5: Verify the fields landed with the right shape**

Read the `staging` `sermon` content type back (Contentful MCP `get_content_type`, or the CMA) and
confirm:

- `audioLanguages`: `type: Array`, `items.type: Symbol`, `items.validations: [{ in: ["es-AR","en-US"] }]`,
  `localized: false`, `required: false`
- `interpreter`: `type: Link`, `linkType: Entry`, `validations: [{ linkContentType: ["author"] }]`,
  `localized: false`, `required: false`

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/contentful/migrations/13-add-sermon-audio-fields.cjs
git commit -m "feat(ICR-146): add audioLanguages and interpreter to the sermon model"
```

- [ ] **Step 7: ★ STOP — HAND OFF TO THE HUMAN ★**

Report to the orchestrator that the model exists in `staging` and that **the human must now run
Contentful Merge (`staging` → `production`) before preview QA and before the prod deploy.**

**Do not** attempt the promotion. **Do not** proceed to QA until the human confirms it is done.

---

## Task 6: The entry backfill script (write + dry-run; DO NOT run against production)

**Files:**

- Create: `apps/web/scripts/contentful/migrations/13b-backfill-sermon-audio.mjs`

**Interfaces:**

- Consumes: the fields created in Task 5.
- Produces: nothing the app imports. This script is run **by a human at cutover**.

- [ ] **Step 1: Write the script**

```js
// ICR-146 (13b): backfill `sermon.audioLanguages` + `sermon.interpreter`, and remove the
// now-redundant hand-written interpreter blockquote from the 2026-07-12 sermon (prose -> data).
//
// SAFETY INVARIANTS (all four matter):
//  1. Refuses the `master` ALIAS by name. Write the concrete env (staging | production), never the
//     alias — the alias is repointed by humans at cutover.
//  2. PUBLISH-SAFE. Republishes ONLY entries that were ALREADY published; NEVER publishes a draft.
//     Publishing a draft here would ship unreviewed content to the live site — including the
//     2026-07-12 sermon, which is deliberately awaiting human review. And a draft-only update does
//     NOT change an entry's published version, so an already-published entry MUST be republished or
//     the CDA keeps serving the old data.
//  3. IDEMPOTENT. Skips entries that already carry a non-empty `audioLanguages`; skips a blockquote
//     that is already gone. Safe to re-run.
//  4. CONTENT-MATCHED node removal. The interpreter note is found by matching its TEXT, never by
//     index — an index-based delete would silently destroy a legitimate closing blockquote if the
//     entry is edited before cutover.
//
// Every sermon is enumerated (not a hardcoded id list) so a sermon published between now and cutover
// still gets its default. Only the known bilingual sermon deviates from the ["es-AR"] default.
//
// Usage:
//   node scripts/contentful/migrations/13b-backfill-sermon-audio.mjs --dry-run
//   CONTENTFUL_ENVIRONMENT=production node scripts/contentful/migrations/13b-backfill-sermon-audio.mjs
import { createClient } from "contentful-management";

const client = createClient(
  { accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN },
  { type: "plain" },
);

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "staging";
const DRY = process.argv.includes("--dry-run");

if (environmentId === "master" || environmentId.startsWith("master-")) {
  throw new Error(
    "Refusing to run against the `master` alias. Target the concrete environment (staging | production).",
  );
}

/** Contentful stores NON-LOCALIZED field values under the default-locale key. */
const DEFAULT_LOCALE = "es-AR";
const SPANISH_ONLY = ["es-AR"];
const BILINGUAL = ["es-AR", "en-US"];

/** 2026-07-12 — Doug Wagner preached in English; Jonathan Hanegan interpreted live into Spanish. */
const BILINGUAL_SERMON_ID = "4Tp4Qg3SGEIEIJn09w5OjW";
const INTERPRETER_AUTHOR_ID = "32VynQChlpA00VsRMtNGJu"; // Jonathan Hanegan (author entry)

/**
 * True for the hand-written interpreter note that this migration replaces with data.
 * Requires BOTH the interpreter's name AND interpretation wording, so an unrelated
 * closing blockquote can never match.
 */
function isInterpreterNote(node) {
  if (node?.nodeType !== "blockquote") return false;
  const text = JSON.stringify(node);
  return text.includes("Jonathan Hanegan") && /interpret/i.test(text);
}

/** Removes the trailing interpreter note from a rich-text document, if present. */
function stripInterpreterNote(doc) {
  if (!doc?.content?.length) return { doc, removed: false };
  const last = doc.content[doc.content.length - 1];
  if (!isInterpreterNote(last)) return { doc, removed: false };
  return { doc: { ...doc, content: doc.content.slice(0, -1) }, removed: true };
}

async function getAllSermons() {
  const out = [];
  let skip = 0;
  for (;;) {
    const page = await client.entry.getMany({
      spaceId,
      environmentId,
      query: { content_type: "sermon", limit: 100, skip },
    });
    out.push(...page.items);
    if (skip + 100 >= page.total) break;
    skip += 100;
  }
  return out;
}

async function run() {
  console.log(
    `== 13b backfill sermon audioLanguages/interpreter in "${environmentId}"${DRY ? " (DRY-RUN — nothing will be written)" : ""} ==`,
  );

  const sermons = await getAllSermons();
  console.log(`Found ${sermons.length} sermon entries.\n`);

  let changed = 0;
  let republished = 0;
  let skipped = 0;

  for (const entry of sermons) {
    const id = entry.sys.id;
    const slug = entry.fields.slug?.[DEFAULT_LOCALE] ?? "(no slug)";
    // Capture BEFORE any update: entry.update() bumps sys.version but leaves
    // publishedVersion alone, so this stays a correct "was it live?" answer.
    const wasPublished = entry.sys.publishedVersion != null;
    const isBilingual = id === BILINGUAL_SERMON_ID;

    const existing = entry.fields.audioLanguages?.[DEFAULT_LOCALE];
    const hasAudioLanguages = Array.isArray(existing) && existing.length > 0;

    const fields = { ...entry.fields };
    const actions = [];

    if (!hasAudioLanguages) {
      fields.audioLanguages = {
        [DEFAULT_LOCALE]: isBilingual ? BILINGUAL : SPANISH_ONLY,
      };
      actions.push(
        `audioLanguages = [${fields.audioLanguages[DEFAULT_LOCALE].join(", ")}]`,
      );
    }

    if (isBilingual && !entry.fields.interpreter?.[DEFAULT_LOCALE]) {
      fields.interpreter = {
        [DEFAULT_LOCALE]: {
          sys: { type: "Link", linkType: "Entry", id: INTERPRETER_AUTHOR_ID },
        },
      };
      actions.push("interpreter = Jonathan Hanegan");
    }

    if (isBilingual && entry.fields.content) {
      const nextContent = {};
      let removedAny = false;
      for (const [locale, doc] of Object.entries(entry.fields.content)) {
        const { doc: stripped, removed } = stripInterpreterNote(doc);
        nextContent[locale] = stripped;
        if (removed) removedAny = true;
      }
      if (removedAny) {
        fields.content = nextContent;
        actions.push(
          "removed the interpreter blockquote (now expressed as data)",
        );
      }
    }

    if (actions.length === 0) {
      skipped++;
      console.log(`  – ${slug} (${id}): already backfilled, skipping`);
      continue;
    }

    console.log(`  ${DRY ? "WOULD UPDATE" : "UPDATING"} ${slug} (${id})`);
    for (const action of actions) console.log(`      · ${action}`);
    console.log(
      wasPublished
        ? `      · published entry → WILL REPUBLISH`
        : `      · draft entry → leaving as a DRAFT (never published by this script)`,
    );

    if (DRY) {
      changed++;
      if (wasPublished) republished++;
      continue;
    }

    const updated = await client.entry.update(
      { spaceId, environmentId, entryId: id },
      { ...entry, fields },
    );
    changed++;

    if (wasPublished) {
      await client.entry.publish(
        { spaceId, environmentId, entryId: id },
        updated,
      );
      republished++;
    }
  }

  console.log(
    `\n${DRY ? "PLAN" : "DONE"}: ${changed} updated, ${republished} republished, ${skipped} already done.`,
  );
  if (!DRY && republished > 0) {
    console.log(
      "Remember: POST /api/revalidate to flush the `site-content` cache tag.",
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run against staging**

```bash
cd apps/web && node scripts/contentful/migrations/13b-backfill-sermon-audio.mjs --dry-run
```

> ⚠️ **CORRECTED 2026-07-14 — this expectation was WRONG, and the run proved it.** `staging` is a
> **model** work-env, not a content mirror: it holds **1** sermon entry, not production's 5, and does
> **not** contain the bilingual sermon. The dry-run below therefore reports `Found 1 sermon entries`
> against staging — that is correct behaviour, not a script bug. **Consequence:** the staging dry-run
> **cannot** exercise the blockquote removal or the republish-if-published branch, so those two paths
> are instead pinned by unit tests against the REAL rich-text document (see the follow-up task after
> this one, `13b-backfill-sermon-audio.test.mjs`). The output below describes what the human will see
> when they dry-run against **production** at cutover — keep it as the acceptance shape for THAT run.

**Expected output shape AGAINST PRODUCTION (the human's step 3)** — it must list **5 sermons**, mark
the 2026-07-12 one bilingual with the interpreter and the blockquote removal, and state for each
whether it would republish:

```
== 13b backfill sermon audioLanguages/interpreter in "staging" (DRY-RUN — nothing will be written) ==
Found 5 sermon entries.

  WOULD UPDATE lo-negue-y-aun-asi-me-amo-la-historia-de-pedro (4Tp4Qg3SGEIEIJn09w5OjW)
      · audioLanguages = [es-AR, en-US]
      · interpreter = Jonathan Hanegan
      · removed the interpreter blockquote (now expressed as data)
      · draft entry → leaving as a DRAFT (never published by this script)
  WOULD UPDATE la-paradoja-de-perder-la-vida-para-encontrarla (7fZsjCXMQKo0PtZqOh7tew)
      · audioLanguages = [es-AR]
      · published entry → WILL REPUBLISH
  ... (3 more)

PLAN: 5 updated, 2 republished, 0 already done.
```

> **STOP CONDITIONS.** If the dry-run says it would republish anything other than exactly the 2
> published sermons, or would publish a draft, or reports 0 entries — **stop and report.** Do not run
> it for real.

- [ ] **Step 3: Do NOT run it against production**

The production run is a **human** step at cutover (see the runbook). The agent's job ends at a
verified dry-run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/contentful/migrations/13b-backfill-sermon-audio.mjs
git commit -m "feat(ICR-146): add the sermon audio-language backfill migration"
```

---

## Task 7: Documentation

**Files:**

- Modify: `docs/architecture/contentful-data-layer.md` (the sermon read path + the new fields)
- Modify: `docs/product/content-types.md` _(if it documents `sermon`'s fields — check first)_

- [ ] **Step 1: Check which docs actually describe the sermon model**

```bash
cd /Users/gabriel/repos/idc-redentor-website && grep -rln "sermon" docs/ | sort
```

- [ ] **Step 2: Document the two fields and the ordering constraint**

Add to the appropriate doc(s):

- `audioLanguages` (`Array<Symbol>`, non-localized, optional, `in: ["es-AR","en-US"]`) and
  `interpreter` (`Link → author`, non-localized, optional) — what they mean and why the interpreter
  is deliberately **not** `additionalPreachers`.
- The `absent ⇒ ["es-AR"]` read-path default and **why it must survive the backfill** (a human
  authoring in the Contentful UI can still leave the field empty).
- **The ordering constraint**, stated plainly: adding a field to a hand-written GraphQL query breaks
  the _entire_ query until that field exists in the target environment, so **a model change must be
  promoted to production BEFORE the code that reads it is deployed.** This is a general trap for this
  repo's hand-written data layer, not a one-off.

Write the docs **inside the worktree** (`docs/` is versioned and must ride the PR — lesson ICR-148).

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(ICR-146): document the sermon audio-language and interpreter fields"
```

---

## Self-Review (completed)

**1. Spec coverage.** R1→T5 · R2→T1 · R3→T2 · R4→T2 · R5→T4 · R6→T4 · R7→T3 · R8→T5+T6 · R9→T2.
All 7 ACs are covered: AC1→T1/T3/T4 · AC2→T1(default)+T3(byte-identical string) · AC3→T4
(`SermonInterpreter` + `preachers` untouched) · AC4→T3(key deleted)+T4(grep proves zero call-sites) ·
AC5→T3(parity test) · AC6→T1(12 tests) · AC7→T1+T2(mapper default, independent of the backfill).

**2. Placeholder scan.** No TBD/TODO. Every code step carries complete code. The only judgement call
left open is _which_ doc file in Task 7, and Step 1 is an exact command that resolves it.

**3. Type consistency.** `normalizeAudioLanguages` / `getAudioLanguageNotice` / `AudioLanguageNotice`
/ `SermonAuthor` / `SermonInterpreter` are named identically everywhere they appear (T1 → T2 → T4).
`audioLanguages` is non-optional `Locale[]` in the type and guaranteed non-empty by the normalizer,
so no consumer handles `undefined`.
