# Contentful Model Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the Contentful content model from ~29 → ~14 types (delete dead types, retire the vestigial page-builder, merge overlapping types) and land the cross-cutting fixes (env-override, contact-form, JSON-LD, privacy page) as one atomic epic PR + one Contentful alias cutover, with the rendered site unchanged except three approved surfaces.

**Architecture:** All Contentful model + entry changes are made in the `agent-sandbox` environment via committed, idempotent `contentful-migration` scripts (`scripts/contentful/`). The app gains a `CONTENTFUL_ENVIRONMENT` override so local + the epic's Vercel preview read `agent-sandbox` while production keeps reading the `master` alias. Code and model move together; at the end a human re-points the `master` alias → `agent-sandbox` at the same moment the PR merges. `master-0.0.1` stays as instant rollback.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript (strict), Contentful (GraphQL Delivery/Preview read path + CMA via `contentful-migration` write path), next-intl, Tailwind v4, Vitest, pnpm.

**Source docs (read before starting):** `docs/contentful-model-optimization-plan.md` (the approved spec — schemas, runbook, visible-change disclosures) and `docs/contentful-model-audit.md` (the audit). This plan is the executable form of the spec's §6 commit sequence.

## Global Constraints

- **Package manager:** `pnpm` only. Type-check command is **hyphenated**: `pnpm type-check`.
- **Verification gate (every task):** `pnpm type-check && pnpm lint && pnpm test && pnpm build` must pass before commit.
- **Default locale `es-AR`**, secondary `en-US`. Every user-facing string must exist in **both** `public/locales/es-AR.json` and `public/locales/en-US.json`.
- **Migrations never target `master`.** The runner uses `CONTENTFUL_ENVIRONMENT` (default `agent-sandbox`); the MCP enforces `PROTECTED_ENVIRONMENTS=master`.
- **CMA token** `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` is read from the environment, never committed. `.env*` is gitignored.
- **Conventional Commits**, header ≤ 100 chars. Types: `feat`/`fix`/`refactor`/`chore`/`docs`/`test`/`ci`.
- **Code conventions:** `interface` over `type`; avoid enums (const maps); `??` over `||`; RSC-first; named exports; `handle*` handlers; `cn()` for classes; path aliases `@lib/* @src/* @public/* @icons/*`.
- **Visual parity:** the rendered site must be byte-for-byte identical EXCEPT three approved changes — (a) new privacy page + footer link (Task 11), (b) blog category shown in Spanish on es-AR (Task 7), (c) contact-form verse shows even without an image (Task 9).
- **Branch:** `refactor/ICR-76-contentful-model-optimization`. One epic branch, staged commits, one PR. Do **not** push or open the PR until the full pre-cutover verification (Task 12) passes.

---

## File Structure

**New files**
- `scripts/contentful/run.mjs` — idempotent migration runner (applies a numbered migration to `$CONTENTFUL_ENVIRONMENT`).
- `scripts/contentful/migrations/01-delete-quote-strip-phantoms.cjs` … `08-standardize-naming.cjs` — one migration per model-changing task.
- `lib/contentful/getSection.ts` — unified getter for the merged `section` type (Task 5).
- `lib/contentful/getChurchInfoTopic.ts` — getter for the privacy/terms page (Task 11).
- `src/app/[locale]/[topic]/page.tsx` — privacy/terms route (Task 11).
- `lib/jsonLd.ts` (or extend `lib/metadata.ts`) — `buildOrganizationJsonLd`, `buildEventJsonLd` (Task 10).
- `src/components/shared/json-ld/JsonLd.tsx` — tiny server component wrapping `<script type="application/ld+json">` (Task 10).
- Vitest specs alongside the getters/builders they cover.

**Modified files** (exact lines in each task)
- `lib/contentful/fetch.ts`, `src/types/environment.d.ts`, `.env.example`, `package.json` (Task 0)
- `src/app/[locale]/blog/page.tsx`; delete `lib/contentful/getPage.ts`, `lib/contentful/getDuplexComponent.ts`, `src/components/features/component-resolver/*` (Task 2)
- `lib/contentful/getContentCollection.ts` + `CreedSection` consumer (Task 3)
- `lib/contentful/getHeroBannerComponent.ts`, `getCtaComponent.ts`, `getTextBlockComponent.ts`; `OurMissionCta.tsx`, `ComponentCta.tsx`, `InfoCommunity.tsx`, `InfoConnect.tsx`, `PhotoGrid.tsx`; the home/community/come-meet-us/blog-post pages (Task 5)
- `lib/contentful/getContactForm.ts` (Task 6)
- `src/components/features/contact-form/ContactForm.tsx`, both locale JSONs (Task 9)
- `lib/metadata.ts`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/come-meet-us/page.tsx`, `src/app/[locale]/blog/[slug]/page.tsx`, `lib/contentful/getEventBanner.ts` (Task 10)
- `src/components/.../Footer` + footer getter (Task 11)

---

## Conventions for migration tasks

Each model-changing task follows the same rhythm (substitutes for the TDD red/green of pure code):

1. **Confirm live shape** — use the Contentful MCP (`get_content_type`, `search_entries`) against `agent-sandbox` to confirm the current fields/entries the migration will touch. Never assume; the audit is a guide, the live model is truth.
2. **Write the migration script** — concrete `contentful-migration` code, guarded for idempotency (check existence before create/delete).
3. **Dry-run then apply** — `node scripts/contentful/run.mjs <NN> --dry-run` then without the flag, against `agent-sandbox`.
4. **Verify in-CMS** — re-query via MCP to confirm the model/entries match the target.
5. **Verify rendered** — run the app locally against `agent-sandbox` (`CONTENTFUL_ENVIRONMENT=agent-sandbox pnpm dev`), smoke the affected route(s).
6. **Code + tests** — make the matching code change with Vitest where the project tests it (getter shape-mappers, builders, utils).
7. **Gate + commit.**

---

### Task 0: Environment override + migration tooling scaffold (S1 · ICR-72)

**Files:**
- Modify: `lib/contentful/fetch.ts:3-20`
- Modify: `src/types/environment.d.ts` (Contentful block)
- Modify: `.env.example` (Contentful section)
- Modify: `package.json` (devDependency + script)
- Create: `scripts/contentful/run.mjs`
- Create: `scripts/contentful/migrations/.gitkeep`

**Interfaces:**
- Produces: `fetchGraphQL(query, preview)` now targets `process.env.CONTENTFUL_ENVIRONMENT ?? "master"`. The runner `node scripts/contentful/run.mjs <NN> [--dry-run]` applies `scripts/contentful/migrations/<NN>-*.cjs` to `$CONTENTFUL_ENVIRONMENT` (default `agent-sandbox`).

- [ ] **Step 1: Add env override to `fetch.ts`.** Replace the body of `fetchGraphQL` so the URL includes an environment segment:

```ts
export async function fetchGraphQL(query: string, preview = false) {
  const environment = process.env.CONTENTFUL_ENVIRONMENT ?? "master";
  return fetch(
    `https://graphql.contentful.com/content/v1/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${environment}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${
          preview
            ? process.env.CONTENTFUL_PREVIEW_ACCESS_TOKEN
            : process.env.CONTENTFUL_ACCESS_TOKEN
        }`,
      },
      body: JSON.stringify({ query }),
      next: { tags: ["site-content"] },
    },
  ).then((response) => response.json());
}
```

- [ ] **Step 2: Type the variable.** In `src/types/environment.d.ts`, under the Contentful vars, add:

```ts
CONTENTFUL_ENVIRONMENT?: string;
```

- [ ] **Step 3: Document it.** In `.env.example`, in the Contentful block, add:

```bash
# Optional. Defaults to the `master` alias. Set to `agent-sandbox` locally to test model changes.
# CONTENTFUL_ENVIRONMENT=master
```

- [ ] **Step 4: Add migration tooling.** Run:

```bash
pnpm add -D contentful-migration contentful-management
```

- [ ] **Step 5: Write the runner** `scripts/contentful/run.mjs`:

```js
// Usage: node scripts/contentful/run.mjs 01 [--dry-run]
// Applies scripts/contentful/migrations/<NN>-*.cjs to $CONTENTFUL_ENVIRONMENT (default agent-sandbox).
import { runMigration } from "contentful-migration";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [num, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "agent-sandbox";

if (environmentId === "master") {
  throw new Error("Refusing to run migrations against master. Set CONTENTFUL_ENVIRONMENT.");
}
const dir = join(here, "migrations");
const file = readdirSync(dir).find((f) => f.startsWith(`${num}-`));
if (!file) throw new Error(`No migration found for prefix ${num} in ${dir}`);

await runMigration({
  filePath: join(dir, file),
  spaceId: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN,
  environmentId,
  yes: !dryRun,
  ...(dryRun ? { dryRun: true } : {}),
});
console.log(`Applied ${file} to ${environmentId}${dryRun ? " (dry-run)" : ""}`);
```

- [ ] **Step 6: Wire the npm script.** In `package.json` `scripts`, add:

```json
"contentful:migrate": "node scripts/contentful/run.mjs"
```

- [ ] **Step 7: Verify default behavior is unchanged.** Run `CONTENTFUL_ENVIRONMENT=` `pnpm build` (var unset) — build succeeds and pages render from `master`. Then run `CONTENTFUL_ENVIRONMENT=agent-sandbox pnpm dev`, open `http://localhost:3000/es-AR`, confirm the home page renders (it reads `agent-sandbox`). Clear `.next` (`rm -rf .next`) when switching envs.

- [ ] **Step 8: Verify the runner connects (no-op).** Create a throwaway `scripts/contentful/migrations/00-noop.cjs` exporting `module.exports = function (migration) {};`, run `CONTENTFUL_ENVIRONMENT=agent-sandbox node scripts/contentful/run.mjs 00 --dry-run`, confirm it connects and reports no changes, then delete `00-noop.cjs`.

- [ ] **Step 9: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add lib/contentful/fetch.ts src/types/environment.d.ts .env.example package.json pnpm-lock.yaml scripts/contentful
git commit -m "chore(ICR-72): support CONTENTFUL_ENVIRONMENT override + migration tooling scaffold"
```

---

### Task 1: Delete `componentQuote` + strip phantom validations (T1 + T3 · ICR-66)

**Files:**
- Create: `scripts/contentful/migrations/01-delete-quote-strip-phantoms.cjs`
- (No app code — `componentQuote` has no getter; phantoms are validation-only.)

- [ ] **Step 1: Confirm live shape (MCP).** Against `agent-sandbox`: `get_content_type` for `componentQuote` (expect 0 entries, name "[UNUSED] Quote component"), and read the rich-text validations on `componentHeroBanner.bodyText` and `componentCta.subline` (expect an `embedded-entry-inline` validation listing `nt_mergetag`), and `componentDuplex` validations referencing `post`. Record the exact validation arrays so the script edits match.

- [ ] **Step 2: Write the migration** `01-delete-quote-strip-phantoms.cjs`:

```js
module.exports = function (migration, { makeRequest }) {
  // T1 — delete the unused quote type (0 entries). Idempotent: editContentType throws if absent;
  // guard by checking existence first via the derive-free deleteContentType (safe to re-run only if present).
  migration.deleteContentType("componentQuote");

  // T3 — strip nt_mergetag from surviving rich-text fields.
  const hero = migration.editContentType("componentHeroBanner");
  hero.editField("bodyText").validations([
    // Re-state the validation array WITHOUT the nt_mergetag entry — copy the confirmed array from Step 1,
    // removing any { nodes: { "embedded-entry-inline": [...] } } entry that links nt_mergetag.
  ]);
  const cta = migration.editContentType("componentCta");
  cta.editField("subline").validations([/* confirmed array minus nt_mergetag */]);
};
```

> Note: `topicPerson` disappears with `componentQuote`; `post`/`nt_mergetag` on `componentDuplex` are handled in Task 2 (the type is deleted there). If running Task 1 standalone before Task 2, also strip them on `componentDuplex` here.

- [ ] **Step 3: Dry-run + apply.** `CONTENTFUL_ENVIRONMENT=agent-sandbox node scripts/contentful/run.mjs 01 --dry-run` → review the plan → re-run without `--dry-run`.

- [ ] **Step 4: Verify in CMS.** MCP `get_content_type componentQuote` → 404. `get_content_type componentHeroBanner` → `bodyText` validations no longer mention `nt_mergetag`.

- [ ] **Step 5: Verify rendered.** `CONTENTFUL_ENVIRONMENT=agent-sandbox pnpm build` succeeds; home + community + blog render unchanged (nothing referenced `componentQuote`).

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add scripts/contentful/migrations/01-delete-quote-strip-phantoms.cjs
git commit -m "refactor(ICR-66): delete unused componentQuote and strip phantom validation refs"
```

---

### Task 2: Retire the page-builder render path; slim `page`; drop `componentDuplex` (T4+T5+T6, S4 moot · ICR-73)

**Files:**
- Modify: `src/app/[locale]/blog/page.tsx:1-48`
- Delete: `lib/contentful/getPage.ts`, `lib/contentful/getDuplexComponent.ts`, `src/components/features/component-resolver/component-resolver.tsx`, `src/components/features/component-resolver/index.ts`
- Create: `scripts/contentful/migrations/02-retire-page-builder.cjs`

**Interfaces:**
- Consumes: `getCtaComponent(machineName, locale, isDraftMode)` and `<ComponentCta content={...} />` (already used by home/community/blog-post).
- Produces: blog index renders its appended CTA via the named-block pattern; `page` type reduced to `internalName`/`pageName`/`slug`/`seo`.

- [ ] **Step 1: Confirm the blog CTA machineName (MCP).** Against `agent-sandbox`: `get_entry` for the `page` whose `slug`/`machineName` is `blog`; read its `extraSection` reference → the linked `componentCta`'s `machineName`. Record it (call it `BLOG_CTA` below — siblings use `"connect-with-us"`; confirm whether blog reuses it or has its own).

- [ ] **Step 2: Edit `blog/page.tsx`.** Replace imports and the page-builder usage. New file:

```tsx
import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getLatestBlogPostPages } from "@lib/contentful/getBlogPostPages";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { buildPageMetadata } from "@lib/metadata";
import { BlogSection } from "@src/components/features/blog-section";
import { ComponentCta } from "@src/components/features/component-cta";
import { Header } from "@src/components/shared/header";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ machineName: "seo-blog", locale, path: "blog" });
}

export default async function BlogPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Blog");
  const isEnabled = await shouldUseDraftMode();

  const contactCta = await getCtaComponent("connect-with-us", locale, isEnabled); // use BLOG_CTA from Step 1
  const latestPosts = await getLatestBlogPostPages(locale, { isDraftMode: isEnabled });

  return (
    <main>
      <Header titlePath="Blog.header-title" variant="gradient" subtitle={t("header-subtitle")} />
      <BlogSection posts={latestPosts} showHeader={false} />
      {contactCta && <ComponentCta content={contactCta} />}
    </main>
  );
}
```

- [ ] **Step 3: Delete the dead files.**

```bash
git rm lib/contentful/getPage.ts lib/contentful/getDuplexComponent.ts \
  src/components/features/component-resolver/component-resolver.tsx \
  src/components/features/component-resolver/index.ts
```

- [ ] **Step 4: Confirm no dangling imports.** Run:

```bash
grep -rn "getPage\|getDuplexComponent\|component-resolver\|resolveComponents" src lib
```
Expected: no hits except unrelated `targetPage` GraphQL field names. Fix any stragglers.

- [ ] **Step 5: Verify rendered parity.** `CONTENTFUL_ENVIRONMENT=agent-sandbox pnpm dev`; open `/es-AR/blog` and `/en-US/blog`; confirm the appended contact CTA renders identically to before (the only DOM delta is the removed wrapper `<div>`). Confirm home/community/come-meet-us untouched.

- [ ] **Step 6: Write the model migration** `02-retire-page-builder.cjs`:

```js
module.exports = function (migration) {
  // T6 — delete the dead duplex type (1 entry, no getter, never resolved).
  migration.deleteContentType("componentDuplex");

  // T4/T5 — drop the page-builder array fields; keep page as a route/SEO registry.
  const page = migration.editContentType("page");
  page.deleteField("topSection");
  page.deleteField("pageContent");
  page.deleteField("extraSection");
};
```

> If `componentDuplex`'s single entry must be preserved for reference, export it first (MCP `get_entry`) into the commit message or an archive note; the audit says it renders nowhere, so deletion is safe.

- [ ] **Step 7: Dry-run + apply + verify CMS.** Run migration `02` against `agent-sandbox`; MCP-confirm `componentDuplex` is 404 and `page` no longer has the three array fields but retains `internalName`/`pageName`/`slug`/`seo`. Confirm `componentCta.targetPage` / `componentHeroBanner.targetPage` / `menuGroup.groupLink` still resolve `page.slug`.

- [ ] **Step 8: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "refactor(ICR-73): retire page-builder render path, slim page, drop componentDuplex"
```

---

### Task 3: Merge `credo` + `valueItem` → `beliefItem` (T7 · ICR-67)

**Files:**
- Create: `scripts/contentful/migrations/03-merge-belief-item.cjs`
- Modify: `lib/contentful/getContentCollection.ts:1-40` (and the `CreedSection` consumer if it names types)
- Test: `lib/contentful/getContentCollection.test.ts` (shape-mapper)

**Interfaces:**
- Produces: `getContentCollection(...)` returns `creedItems` from the `beliefItem` type (same shape as today); each item gains optional `kind: "Creed" | "Value"`.

- [ ] **Step 1: Confirm live shapes (MCP).** `get_content_type` for `credo` and `valueItem` — confirm they are field-for-field identical (`title`, `description` RT, `bibleVerse`, `image`, `machineName`/`internalName`). `search_entries` to list the 7 `credo` + 3 `valueItem` entry IDs and which collection references them. Read `getContentCollection.ts` to see how both are currently queried/merged into `creedItems`.

- [ ] **Step 2: Write the failing shape-mapper test.** In `getContentCollection.test.ts`, assert the getter maps a `beliefItem`-shaped GraphQL response into the existing `creedItems` shape (same keys the renderer reads today), including `kind`. Use a fixture mirroring the confirmed fields.

- [ ] **Step 3: Run it — expect FAIL** (`pnpm test getContentCollection`) because the getter still queries `credo`/`valueItem`.

- [ ] **Step 4: Write the migration** `03-merge-belief-item.cjs`:

```js
module.exports = function (migration) {
  const belief = migration
    .createContentType("beliefItem")
    .name("Belief Item")
    .displayField("internalName");
  belief.createField("internalName").name("Internal Name").type("Symbol").required(true);
  belief.createField("machineName").name("Machine Name").type("Symbol").required(true);
  belief.createField("title").name("Title").type("Symbol");
  belief.createField("description").name("Description").type("RichText");
  belief.createField("bibleVerse").name("Bible Verse").type("Link").linkType("Entry"); // structured in Task 4
  belief.createField("image").name("Image").type("Link").linkType("Asset");
  belief
    .createField("kind")
    .name("Kind")
    .type("Symbol")
    .validations([{ in: ["Creed", "Value"] }]);

  // Entry remap: derive a beliefItem per credo (kind=Creed) and per valueItem (kind=Value),
  // copying identical fields, then update referencing collections, then delete the old types.
  // contentful-migration derive copies fields 1:1; reference rewiring + old-type deletion is done
  // via the contentful-management pass in run-time companion `03b` (see Step 5) because derive
  // cannot rewrite inbound links. Confirm the exact reference fields from Step 1.
};
```

- [ ] **Step 5: Reference rewiring + cleanup.** Because `contentful-migration` `deriveLinkedEntries` copies fields but does not repoint inbound references, perform the remap with `contentful-management` inside the same script file (export an async `module.exports` that the runner awaits) OR a sibling `03b-rewire.mjs`: for each `credo`/`valueItem` entry, create a `beliefItem` with identical field values + `kind`, repoint the `contentCollection`/inline references from the old entry to the new one, publish, then delete the old entries and (once empty) `deleteContentType("credo")` and `deleteContentType("valueItem")`. Keep it idempotent (skip entries whose `beliefItem` twin already exists, matched by `machineName`).

- [ ] **Step 6: Apply + verify CMS.** Run `03` against `agent-sandbox`. MCP: `beliefItem` count = 10; `credo`/`valueItem` = 404; the collections now link `beliefItem`s; `kind` set correctly (7 Creed, 3 Value).

- [ ] **Step 7: Update the getter.** Edit `getContentCollection.ts` to query `beliefItemCollection` (instead of `credoCollection`/`valueItemCollection`), mapping to the same `creedItems` output plus `kind`. Keep the public return shape identical.

- [ ] **Step 8: Run the test — expect PASS.** `pnpm test getContentCollection`.

- [ ] **Step 9: Verify rendered parity.** Local against `agent-sandbox`: `/es-AR` (home Values) and `/es-AR/community` (Creed) render identically — same items, order, text.

- [ ] **Step 10: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add scripts/contentful/migrations lib/contentful/getContentCollection.ts lib/contentful/getContentCollection.test.ts
git commit -m "refactor(ICR-67): merge credo + valueItem into beliefItem"
```

---

### Task 4: Standardize `beliefItem.bibleVerse` on the structured type (T9 · ICR-68)

**Files:**
- Create: `scripts/contentful/migrations/04-structured-bibleverse.mjs` (contentful-management — entry creation + linking)
- Modify: the Creed/Values verse renderer (`CreedSection` or the `beliefItem` card component) to read the structured `bibleVerse`.

**Interfaces:**
- Consumes: structured `bibleVerse` fields `book`/`chapter`/`fromVerse`/`toVerse`/`verseContent`/`bibleVersion` (the existing type, used today only by `contactForm`).
- Produces: each `beliefItem.bibleVerse` links a structured `bibleVerse` entry; the renderer outputs the verse identically to today.

- [ ] **Step 1: Confirm current verse shape (MCP + code).** Determine how Creed/Values verses are stored today (the audit says "freeform rich text inside credo/valueItem"): read a `beliefItem` entry's `bibleVerse`/`description` and the renderer to find where the verse text currently comes from. Record the source field + the exact rendered output (reference label + text) for parity.

- [ ] **Step 2: Write the entry migration** `04-structured-bibleverse.mjs` (contentful-management): for each `beliefItem` that has a freeform verse, parse the reference into `book`/`chapter`/`fromVerse`/`toVerse`/`verseContent`/`bibleVersion`, create a structured `bibleVerse` entry, link it on `beliefItem.bibleVerse`, publish. Idempotent: skip items already linking a structured verse. Leave the old freeform field in place until parity is confirmed, then remove it in a follow-up edit within this script.

- [ ] **Step 3: Apply + verify CMS.** Run against `agent-sandbox`; MCP-confirm each `beliefItem` links a structured `bibleVerse` with correct fields.

- [ ] **Step 4: Update the renderer.** Point the Creed/Values verse rendering at the structured `bibleVerse` (reuse the existing `BibleVerse` component used by the contact form if its markup matches; otherwise format to match the prior output exactly).

- [ ] **Step 5: Verify rendered parity (the 🟡 to watch).** Local against `agent-sandbox`: community Creed + home Values verses look **identical** to before (same reference formatting, same text). Screenshot-compare if unsure.

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "refactor(ICR-68): standardize beliefItem bibleVerse on the structured type"
```

---

### Task 5: Merge promo blocks → `section` with a `layout` enum (T8 · ICR-75)

**Files:**
- Create: `scripts/contentful/migrations/05-merge-section.mjs`, `lib/contentful/getSection.ts`
- Modify/replace: `lib/contentful/getHeroBannerComponent.ts`, `getCtaComponent.ts`, `getTextBlockComponent.ts`
- Modify: `src/components/features/our-mission-cta/OurMissionCta.tsx`, `component-cta/ComponentCta.tsx`, `info-community/InfoCommunity.tsx`, `info-connect/InfoConnect.tsx`, `photo-grid/PhotoGrid.tsx`
- Modify: `src/app/[locale]/page.tsx`, `community/page.tsx`, `come-meet-us/page.tsx`, `blog/[slug]/page.tsx`
- Test: `lib/contentful/getSection.test.ts`

**Interfaces:**
- Produces: `getSection(machineName, locale, isDraftMode)` returns a `Section` with `layout: "hero" | "cta" | "textBlock"`, `headline`, optional `subHeadline`, `body` (RichText `{ json }`), `ctaText`, `targetPage { slug }`, `urlParameters`, `image { url title width height }`, `images: { items: [...] }`. The three old getters become thin wrappers over `getSection` (or are replaced at call sites).
- Consumes: target schema §5.1 of the spec. **Unified rich-text field is `body`** (renderers read `content.body.json`). **Unified subhead is `subHeadline`.** **Gallery field is `images` (`imagesCollection`).**

- [ ] **Step 1: Confirm live shapes (MCP + code).** `get_content_type` for `componentHeroBanner`, `componentCta`, `componentTextBlock`; read each getter and each renderer to record the exact field each component reads today (esp. `OurMissionCta` `bodyText.json`, `InfoCommunity` `body.json`, `InfoConnect` `body.json`, `ComponentCta` `urlParameters`, community `imagesCollection`→`PhotoGrid`).

- [ ] **Step 2: Write the failing getter test.** `getSection.test.ts`: given a `section` GraphQL response for each `layout`, assert `getSection` maps to the `Section` interface (esp. `body.json` present, `images.items` preserved for `textBlock`).

- [ ] **Step 3: Run it — expect FAIL** (`getSection` not implemented).

- [ ] **Step 4: Write the model migration** `05-merge-section.mjs` (contentful-management for entry remap; `contentful-migration` for the type): create `section` per spec §5.1 (`layout` required enum; `internalName`/`machineName` required; optional `headline`/`subHeadline`/`body`/`ctaText`/`targetPage`/`urlParameters`/`image`/`images`[max 5]). Then for each hero/cta/textBlock entry: create a `section` with `layout` set, mapping `bodyText`|`subline`|`body` → `body`, `subHeadline`|`subtitle` → `subHeadline`, carrying `images` for textBlock and `image`/`ctaText`/`targetPage`/`urlParameters` as applicable; repoint inbound references (home, community, come-meet-us, blog-post call sites resolve by `machineName`, so keep the **same `machineName`** values so getters keep finding them); publish; delete old entries; `deleteContentType` for the three old types. **Do NOT carry `additionalImages`** (dead). Idempotent by `machineName`.

- [ ] **Step 5: Apply + verify CMS.** Run against `agent-sandbox`; MCP-confirm 4 `section` entries (hero, 2× textBlock, cta) with correct `layout`, the textBlock sections retain `images`, and the three old types are 404.

- [ ] **Step 6: Implement `getSection.ts`.** Query `sectionCollection(where: { machineName })` selecting the full superset; map to the `Section` interface. Then make `getHeroBannerComponent`/`getCtaComponent`/`getTextBlockComponent` either re-export thin wrappers calling `getSection` (preserving their current call signatures) or update the four pages to call `getSection` directly. Prefer thin wrappers to minimize call-site churn.

- [ ] **Step 7: Run the getter test — expect PASS.**

- [ ] **Step 8: Update renderers to the unified field names.** In `OurMissionCta.tsx` change `bodyText` → `body`. `InfoCommunity.tsx` / `InfoConnect.tsx` already read `body` — confirm unchanged. `ComponentCta.tsx` reads `ctaText`/`targetPage`/`urlParameters` — confirm unchanged (it doesn't render `subline`). `PhotoGrid.tsx` reads `images` items — confirm unchanged (the page passes `section.imagesCollection.items`). Update each page's prop types if the getter return type name changed.

- [ ] **Step 9: Verify rendered parity (CRITICAL — PhotoGrid).** Local against `agent-sandbox`: home hero, all three CTAs (home/community/blog-post), community text block **and its PhotoGrid** (guard at `community/page.tsx:66` must still fire), come-meet-us text block — all byte-for-byte identical. If the PhotoGrid vanished, `images` was dropped — fix the migration.

- [ ] **Step 10: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "refactor(ICR-75): merge hero/cta/textBlock into section with a layout enum"
```

---

### Task 6: Remove dead fields (T10 · ICR-69)

**Files:**
- Create: `scripts/contentful/migrations/06-remove-dead-fields.cjs`
- Modify: `lib/contentful/getContactForm.ts:29` (drop `validation` from the query)

- [ ] **Step 1: Confirm dead (MCP + grep).** Confirm `menuGroup.featuredPages` is queried nowhere (`grep -rn featuredPages src lib`) and `formField.validation` is requested at `getContactForm.ts:29` but never mapped/read (`grep -rn "\.validation\b" src lib` → none). `componentHeroBanner.additionalImages` was already removed with Task 5.

- [ ] **Step 2: Write the migration** `06-remove-dead-fields.cjs`:

```js
module.exports = function (migration) {
  migration.editContentType("menuGroup").deleteField("featuredPages");
  migration.editContentType("formField").deleteField("validation");
};
```

- [ ] **Step 3: Apply + verify CMS.** Run `06` against `agent-sandbox`; MCP-confirm both fields are gone.

- [ ] **Step 4: Drop the dead query field.** In `getContactForm.ts`, remove `validation` from `GRAPHQL_FIELDS` (line ~29).

- [ ] **Step 5: Verify rendered parity.** Local against `agent-sandbox`: navbar mega-menu groups and the contact form render unchanged.

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add scripts/contentful/migrations/06-remove-dead-fields.cjs lib/contentful/getContactForm.ts
git commit -m "refactor(ICR-69): remove dead fields (menuGroup.featuredPages, formField.validation)"
```

---

### Task 7: Localize `blogPostPage.category` (T11 · ICR-70) — 🟦 intended visible change

**Files:**
- Create: `scripts/contentful/migrations/07-localize-category.cjs`
- Modify: the blog category renderer + getter if the field shape changes.

- [ ] **Step 1: Confirm current shape (MCP + code).** Read `blogPostPage.category` (non-localized English enum `Community`/`Events`/`Spiritual Growth`) and where it's rendered. Decide the approach: (a) enable field localization and set es-AR values per entry, or (b) keep the enum as a stable key and map to a localized display label via i18n. **Prefer (b)** (stable key + i18n labels) — it avoids per-entry CMS edits and keeps the enum as a machine key.

- [ ] **Step 2 (approach b): Add i18n labels.** In both locale files add a `BlogCategory` namespace mapping each enum key to a label — es-AR: `{ "Community": "Comunidad", "Events": "Eventos", "Spiritual Growth": "Crecimiento Espiritual" }`; en-US: identical-to-key English labels.

- [ ] **Step 3: Render via the label.** Where the category is displayed, translate the key: `t(\`BlogCategory.${post.category}\`)`. (If the renderer is an RSC, use `getTranslations`; if client, `useTranslations`.)

- [ ] **Step 4: Migration (only if approach a).** If localization of the Contentful field is chosen instead, `07-localize-category.cjs` enables the locale on the field; then set es-AR values per entry via contentful-management. (Skip if approach b.)

- [ ] **Step 5: Verify rendered.** Local against `agent-sandbox`: `/es-AR/blog` shows Spanish category labels; `/en-US/blog` shows English. This is the approved 🟦 change.

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "feat(ICR-70): localize blogPostPage.category for es-AR"
```

---

### Task 8: Standardize naming `internalName` + `machineName` (T12 · ICR-71)

**Files:**
- Create: `scripts/contentful/migrations/08-standardize-naming.cjs`
- Modify: getters that reference the renamed fields (`getNavigationMenu.ts`, the `menuGroup` inline fragment, `getSeo.ts`).

- [ ] **Step 1: Confirm divergences (MCP).** `menuGroup` uses `internalTitle`; `seo` display field is `name`; `navigationMenu` is looked up by `internalName` with no `machineName`. Record exact getter query fields that reference these.

- [ ] **Step 2: Write the migration** `08-standardize-naming.cjs`: for each divergent type, add the standardized field and copy values, then update getters before deleting the old field (two-step to avoid a query break). Concretely: `menuGroup` — create `internalName`, derive from `internalTitle`, (after getter update) delete `internalTitle`; `seo` — add `machineName` if missing and ensure `internalName` exists; `navigationMenu` — add `machineName`. Keep idempotent.

- [ ] **Step 3: Apply (additive phase) + update getters.** Run the additive part; update `getNavigationMenu.ts`, the `menuGroup` fragment, and `getSeo.ts` to read the standardized fields. Verify locally against `agent-sandbox` that nav/footer/SEO metadata are unchanged.

- [ ] **Step 4: Apply (cleanup phase).** Delete the now-unused old fields (`menuGroup.internalTitle`, etc.).

- [ ] **Step 5: Verify rendered parity.** Local against `agent-sandbox`: navbar, footer, and `<head>` metadata identical.

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "refactor(ICR-71): standardize on internalName + machineName across content types"
```

---

### Task 9: Contact-form fixes — decouple verse, localize heading (S3 · ICR-49) — 🟡

**Files:**
- Modify: `src/components/features/contact-form/ContactForm.tsx:1,103-130`
- Modify: `public/locales/es-AR.json`, `public/locales/en-US.json`

- [ ] **Step 1: Add the i18n import + hook.** At the top of `ContactForm.tsx` (a `"use client"` component) add `import { useTranslations } from "next-intl";` and inside the component `const t = useTranslations("ContactForm");`.

- [ ] **Step 2: Decouple the verse from the image.** Currently the verse (`:112-116`) is nested inside `{content.image && ( … )}` (`:103-118`). Move it out so it is a sibling conditional within the info column (`<div className="space-y-12">`):

```tsx
{content.image && (
  <div className="hidden lg:block">
    <Image src={content.image.url} className="w-full h-auto rounded-2xl shadow-lg" width={600} height={800} alt={content.image.title} />
  </div>
)}
{content.bibleVerse && (
  <div className="mt-6">
    <BibleVerse {...content.bibleVerse} />
  </div>
)}
```

> Keep the verse's existing wrapper/margins so the image+verse case looks unchanged; only the verse-without-image case newly renders (approved 🟡).

- [ ] **Step 3: Localize the heading.** Replace the hardcoded `Send us a Message` (`:129`) with `{t("send-message-heading")}`.

- [ ] **Step 4: Add the i18n keys (both files).** In `public/locales/es-AR.json` add `"ContactForm": { "send-message-heading": "Envianos un Mensaje" }`; in `public/locales/en-US.json` add `"ContactForm": { "send-message-heading": "Send us a Message" }`.

- [ ] **Step 5: Verify rendered.** Local against `agent-sandbox`: heading shows Spanish on es-AR / English on en-US; the existing image+verse layout is unchanged; (manually) a verse with no image now appears.

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add src/components/features/contact-form/ContactForm.tsx public/locales/es-AR.json public/locales/en-US.json
git commit -m "fix(ICR-49): decouple contact-form verse from image and localize heading"
```

---

### Task 10: JSON-LD structured data (S2 · ICR-27) — invisible

**Files:**
- Modify: `lib/metadata.ts` (add builders; upgrade `Article`→`BlogPosting`)
- Create: `src/components/shared/json-ld/JsonLd.tsx`
- Modify: `src/app/[locale]/layout.tsx` (site-wide Organization/Church), `src/app/[locale]/come-meet-us/page.tsx` (Event/Place), `lib/contentful/getEventBanner.ts` (add `location { lat lon }`)
- Test: `lib/metadata.test.ts` (builder output)

**Interfaces:**
- Produces: `buildOrganizationJsonLd(locale)` → `Church`/`Organization` object; `buildEventJsonLd(eventBanner, locale)` → `Event` + nested `Place`. `<JsonLd data={...} />` renders one `<script type="application/ld+json">`.

- [ ] **Step 1: Confirm sources (code).** Read `lib/metadata.ts:125` (`buildArticleJsonLd`), `getEventBanner.ts` (eventInfo + LocationComponent fields), and the come-meet-us page. Decide church NAP/socials source: **hard-code** the known church name + address + social URLs initially (no getter exists).

- [ ] **Step 2: Write builder tests (failing).** In `lib/metadata.test.ts`, assert `buildOrganizationJsonLd("es-AR")` returns `@type: "Church"`, correct `name`, `address` (PostalAddress), `url`, `logo`, `sameAs`; and `buildEventJsonLd(fixture, "es-AR")` returns `@type: "Event"` with nested `location` `Place` (PostalAddress + optional `geo`).

- [ ] **Step 3: Run tests — expect FAIL.**

- [ ] **Step 4: Implement builders in `lib/metadata.ts`.** Add `buildOrganizationJsonLd` + `buildEventJsonLd` (mirroring `buildArticleJsonLd`'s style + `NEXT_PUBLIC_BASE_URL` derivation). Upgrade `buildArticleJsonLd`'s `@type` from `Article` → `BlogPosting`.

- [ ] **Step 5: Add geo to the fragment.** In `getEventBanner.ts`, extend the LocationComponent fragment with `location { lat lon }` (field exists in Contentful) so `geo` can populate. (Optional; builder must tolerate its absence.)

- [ ] **Step 6: Create `<JsonLd>`** (server component):

```tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
```

- [ ] **Step 7: Wire the call sites.** In `[locale]/layout.tsx` render `<JsonLd data={buildOrganizationJsonLd(locale)} />` once (site-wide). In `come-meet-us/page.tsx` render `<JsonLd data={buildEventJsonLd(eventSundayMeetings, locale)} />` using the already-fetched banner.

- [ ] **Step 8: Run tests — expect PASS;** then validate output with a JSON-LD validator (paste rendered `<script>` JSON). **Confirm zero visual change** (script tags don't render).

- [ ] **Step 9: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "feat(ICR-27): add Organization/Church + Event/Place JSON-LD; Article->BlogPosting"
```

---

### Task 11: Bilingual privacy/terms route (T2 · ICR-74 / ICR-43) — 🟢 new page

**Files:**
- Create: `lib/contentful/getChurchInfoTopic.ts`, `src/app/[locale]/[topic]/page.tsx`
- Modify: the footer component + footer getter (add the privacy link)
- Modify: `public/locales/{es-AR,en-US}.json` (footer link label, if not from Contentful)

**Interfaces:**
- Consumes: the existing `churchInfoTopic` entry (Privacy Policy) — fields confirmed in Step 1.
- Produces: `getChurchInfoTopic(slug, locale, isDraftMode)`; a `/[locale]/[topic]` route rendering its rich-text body + metadata.

- [ ] **Step 1: Confirm `churchInfoTopic` shape (MCP).** `get_content_type churchInfoTopic` + `get_entry` for the Privacy Policy entry: record `slug`/`machineName`, title, rich-text body, and any `seo` link. Choose the route slug (recommend localized `privacidad` / `privacy`, or a generic `[topic]` matching `churchInfoTopic.slug`).

- [ ] **Step 2: Write the getter** `getChurchInfoTopic.ts` (mirror an existing getter): query `churchInfoTopicCollection(where: { slug })` selecting title, body (RichText), seo; map to a typed object; tag `next: { tags: ["site-content"] }` (inherited via `fetchGraphQL`).

- [ ] **Step 3: Write the route** `src/app/[locale]/[topic]/page.tsx` (RSC): `await params`, `setRequestLocale`, fetch by topic slug, `notFound()` if absent, render the rich text via the existing rich-text renderer; add `generateMetadata` using the entry's `seo` (mirror other pages). Ensure the dynamic `[topic]` segment does not shadow existing static routes (`who-is-jesus`, `community`, `come-meet-us`, `blog`) — Next prioritizes static segments, but verify.

- [ ] **Step 4: Add the footer link.** Add a link to the privacy page in the footer (via the footer getter's links or a static localized label key in both locale files).

- [ ] **Step 5: Verify rendered.** Local against `agent-sandbox`: `/es-AR/privacidad` and `/en-US/privacy` (or chosen slug) render the policy with correct metadata; footer link navigates there; existing routes unaffected. This is the approved 🟢 addition.

- [ ] **Step 6: Gate + commit.**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "feat(ICR-74): add bilingual privacy/terms route consuming churchInfoTopic"
```

---

### Task 12: Full pre-cutover verification (gate before PR)

**Files:** none (verification only).

- [ ] **Step 1: Full local pass against the sandbox.** `rm -rf .next && CONTENTFUL_ENVIRONMENT=agent-sandbox pnpm build && CONTENTFUL_ENVIRONMENT=agent-sandbox pnpm start`. Walk every route in both locales: home (hero + Values), who-is-jesus, community (Creed + PhotoGrid), come-meet-us (event + map + contact form + verse + JSON-LD), blog index + a post (BlogPosting JSON-LD + Spanish category), newsletter signup, the new privacy page. Confirm parity vs production except the three approved changes.

- [ ] **Step 2: Validate structured data.** Paste each page's `<script type="application/ld+json">` into a schema validator — Organization/Church (site-wide), Event/Place (come-meet-us), BlogPosting (post). No errors.

- [ ] **Step 3: Confirm the model target.** MCP against `agent-sandbox`: content-type count reduced to ~14 domain + composition + singleton types; `componentQuote`/`componentDuplex`/`credo`/`valueItem`/`componentHeroBanner`/`componentCta`/`componentTextBlock` are gone; `beliefItem`/`section` present; phantoms gone.

- [ ] **Step 4: Full gate.** `pnpm type-check && pnpm lint && pnpm test && pnpm build` green.

- [ ] **Step 5: Set the preview env var.** In Vercel, set `CONTENTFUL_ENVIRONMENT=agent-sandbox` scoped to the `refactor/ICR-76-contentful-model-optimization` branch's Preview, so the PR preview renders the new model.

- [ ] **Step 6: Push + open the PR (draft).** Push the branch; open a PR using the project template; link the spec + this plan + epic ICR-76; **do not** mark ready/merge — the human gates the cutover.

- [ ] **Step 7: Hand off the cutover runbook.** In the PR description, paste the §3.3 runbook so the human re-points the `master` alias → `agent-sandbox` at merge time, with rollback (flip alias back) documented.

---

## Cutover (human-performed — from spec §3.3)

1. Pre-flight: Task 12 green; preview verified; content frozen (or re-synced).
2. Pick a low-traffic minute → re-point `master` alias → `agent-sandbox` (Contentful → Settings → Environments → Aliases).
3. Merge the PR → Vercel deploys the new code to production.
4. `POST /api/revalidate` (or wait for the Contentful publish webhook) to flush `site-content`.
5. Smoke production in both locales.
6. **Rollback if needed:** re-point `master` → `master-0.0.1` and revert the PR.
7. **Housekeeping:** clone a fresh `agent-sandbox` from the new master; update the MCP `ENVIRONMENT_ID`.

---

## Self-Review

**1. Spec coverage** — every spec §6 commit maps to a task: Task 0=commit 0 (S1), 1=commit 1 (T1/T3), 2=commit 2 (T4/T5/T6/S4), 3=commit 3 (T7), 4=commit 4 (T9), 5=commit 5 (T8), 6=commit 6 (T10), 7=commit 7 (T11), 8=commit 8 (T12), 9=commit 9 (S3), 10=commit 10 (S2), 11=commit 11 (T2), 12=pre-cutover gate. The three approved visible changes are flagged on Tasks 11/7/9. No spec section is unmapped.

**2. Placeholder scan** — the migration tasks contain explicit "confirm live shape via MCP" steps (legitimate — the live model is the source of truth, not a TODO). The one open value `BLOG_CTA` (Task 2) and the `validations([...])` arrays (Task 1) are resolved by the preceding MCP confirm step, not left vague. No "add error handling"/"TBD"/"similar to Task N" placeholders.

**3. Type consistency** — the unified `section` field names (`body`, `subHeadline`, `images`) are fixed in Task 5's Interfaces and used identically in its renderer steps. `beliefItem` fields (Task 3) match §5.2 and Task 4's `bibleVerse` link. `getSection`/`getContentCollection`/`getChurchInfoTopic` signatures are stated once and reused. `buildOrganizationJsonLd`/`buildEventJsonLd` names match between Task 10's Interfaces and steps.

**Note on TDD vs migrations:** pure-code tasks (0, 3-getter, 5-getter, 9, 10, 11) use red/green Vitest where the project tests (getter shape-mappers, builders). Model/entry migrations substitute the MCP confirm → dry-run → apply → CMS-verify → render-verify rhythm, since Contentful schema changes can't be unit-tested in this repo.
