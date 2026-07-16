# Contentful Data Layer

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** How content gets from Contentful onto a page — the hand-written GraphQL convention in `lib/contentful/`, the single `site-content` cache tag, draft/preview, and on-demand revalidation. Also: why `codegen.ts` is irrelevant.
> **Last reviewed:** 2026-07-14

## The shape of it

Every piece of page content is read from Contentful's GraphQL API by a small getter in `lib/contentful/`. There is **no Contentful SDK, no Apollo client, and no generated types** — each getter builds a GraphQL query string by hand and POSTs it through a single helper.

```
lib/contentful/fetch.ts        fetchGraphQL(query, preview)   ← the one transport
lib/contentful/get*.ts         one getter per content type     ← the query strings
src/app/[locale]/**            RSC pages call the getters       ← the consumers
```

> This is the app's **read** path (Delivery/Preview GraphQL API). There are two separate
> **write** paths: Claude Code agents talk to Contentful's Management API through the
> Contentful MCP server (token-based, writes scoped to a sandbox environment) — see
> `docs/architecture/contentful-mcp.md` — and, since ICR-114, the **app runtime itself**
> holds a Management token for one narrow purpose (the Predica PDF regen cron, below).
> Neither write path mixes with the read path above.

## `fetchGraphQL` — the only transport

`lib/contentful/fetch.ts`:

```ts
export async function fetchGraphQL(query: string, preview = false) {
  return fetch(
    `https://graphql.contentful.com/content/v1/spaces/${process.env.CONTENTFUL_SPACE_ID}`,
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

Three things to internalize:

1. **`preview` flips the token.** `true` → Preview API token (drafts); `false` → Delivery API token (published only). Getters pass `preview` based on `shouldUseDraftMode()` (below).
2. **Every request is tagged `"site-content"`.** This single tag is what `/api/revalidate` invalidates. There are no per-entry tags — one publish drops the whole content cache, which is fine for a small site.
3. **It returns the raw JSON envelope** (`{ data, errors }`). Getters reach into `data?.data?.<collection>?.items` and are responsible for null-safety. There is no thrown error on a GraphQL `errors` payload — treat missing data defensively.

## The getter convention

Each getter follows the same template (see `lib/contentful/getPage.ts`, `getBlogPostPages.ts`, `getContentCollection.ts`, `getEventBanner.ts`, `getFooter.ts`, `getNavigationMenu.ts`, `getSeo.ts`, `getContactForm.ts`, `getSermons.ts`, plus the per-component getters `getCtaComponent`, `getDuplexComponent`, `getHeroBannerComponent`, `getTextBlockComponent`, `getSingleEmailForm`):

```ts
import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  …field selection, with inline fragments (... on TypeName { … }) for unions/components…
`;

export async function getThing(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        thingCollection(
          locale: "${locale}",
          where: { machineName: "${name}" },
          limit: 1,
          preview: ${isDraftMode ? "true" : "false"}
        ) { items { ${GRAPHQL_FIELDS} } }
      }`,
    isDraftMode,
  );
  return data?.data?.thingCollection?.items[0];
}
```

Conventions that hold across all getters:

- **`GRAPHQL_FIELDS` is a module-level constant** holding the field selection, kept separate from the query wrapper. Reuse it across the list/single variants of the same type (e.g. `getBlogPostPages.ts` shares one `GRAPHQL_FIELDS` between `getLatestBlogPostPages`, `getBlogPostPage`).
- **`locale` is interpolated into the query** as `locale: "${locale}"`. Contentful resolves the right translation server-side; the caller passes the next-intl locale.
- **`preview` is interpolated twice** — once as the GraphQL `preview:` argument and once as the `fetchGraphQL` second arg (token selection). Keep them in sync.
- **Entries are matched by a machine-name field** in a `where` clause (`machineName`, `internalName` for navigation, `slug` for blog posts) — never by Contentful entry id. This lets editors compose pages without code changes.
- **Composition uses inline GraphQL fragments.** A `Page` (`getPage.ts`) pulls `topSectionCollection`, `pageContent`, and `extraSectionCollection`, each a union of `ComponentCta`, `ComponentDuplex`, `ComponentHeroBanner`, `ComponentTextBlock`, plus `ContentCollection` and `EventBanner` in `pageContent`. The `__typename` + `sys.id` on every item let the renderer dispatch to the right React component.
- **Getters do light reshaping, not validation.** `getPage`/`getFooter`/`getContentCollection`/`getContactForm` flatten the `…Collection.items` envelope into a friendlier object (e.g. `socialLinksCollection.items` → `socialLinks`). They do not Zod-validate Contentful responses — content is trusted, but be null-safe.

### A caution: string interpolation

Queries are assembled by template-literal interpolation of `locale`, `name`, and `slug`. Those values are app-controlled (locale comes from the validated routing set; machine names/slugs come from Contentful's own data or static routes), so this is acceptable here — but **never interpolate untrusted user input into a query string.** If a future feature needs user-driven Contentful queries, parameterize them or strictly allowlist the input.

## Types

Types live in `lib/contentful/types.ts` (e.g. `RichTextField`, `ContentfulImage`, `ContentItem`, `ContentCollection`) and `src/types/` (`BlogPost`, `Seo`/`SeoContent`, `ContactDetails`). They are written by hand to match the `GRAPHQL_FIELDS` selections. When you change a getter's field selection, update the matching type.

## Rich text

Rich-text fields come back as Contentful's `{ json: Document }` shape and are rendered with `@contentful/rich-text-react-renderer`. `lib/contentful/rich-text-options.tsx` exports reusable render-option objects (`sectionDescriptionOptions`, `cardDescriptionOptions`) that style `BLOCKS.PARAGRAPH` with Tailwind classes. Blog post bodies additionally request `content { json links { … } }` so embedded assets and entry hyperlinks (e.g. links to other `BlogPostPage`s) can be resolved during rendering.

## Draft / preview

`lib/contentful/draftMode.ts`:

```ts
export async function shouldUseDraftMode(): Promise<boolean> {
  const { isEnabled } = await draftMode(); // manual toggle via /api/draft/enable
  if (isEnabled) return true;
  if (process.env.NODE_ENV === "development") return true; // local dev
  if (process.env.VERCEL_ENV === "preview") return true; // every PR preview
  return false;
}
```

So editors get drafts automatically in local dev and on **every Vercel preview deployment**, and can opt into drafts in production by hitting `/api/draft/enable?secret=…&locale=…` (validates `CONTENTFUL_PREVIEW_SECRET`, enables Next draft mode, redirects to `/{locale}`). `/api/draft/disable` turns it back off. Always call `shouldUseDraftMode()` in a Server Component before calling getters; never hard-code `preview: true`.

> Environment topology + the content/model workflow: see `docs/architecture/contentful-environments.md`.

## Live Preview

Editors can open the home + community/Creed pages inside Contentful's **Live Preview** pane — on the
**staging** deployment (the standing target) or on any per-PR preview — and see field edits reflect in
real time, plus an inspector overlay that click-jumps from rendered content back to the field being
edited. Additive and **draft-only**; the production fetch path, `/api/revalidate`, and `revalidateTag`
above are untouched. First-pass scope is the **home** + **community/Creed** components only — other
content types are not yet live-wired.

**Why a draft-gated client boundary.** `src/components/shared/contentful-preview/ContentfulPreviewProvider.tsx`
wraps `@contentful/live-preview`'s `ContentfulLivePreviewProvider` and is mounted in
`[locale]/layout.tsx` **only when `await shouldUseDraftMode()` is true**. Pages/layout stay RSC; this
is the one new `'use client'` boundary at the root, so the SDK's JS bundle ships only on draft
renders — production visitors get zero live-preview code (RSC-first, per the repo's minimize-`'use
client'` rule). Each in-scope component follows the same **view / `*Live` wrapper** split: the
existing presentational view gains an optional `inspectorProps` accessor spread onto its editable
elements, and a thin `'use client'` `<Component>Live` sibling calls the shared
`useLivePreview(raw, locale)` hook (`src/components/shared/contentful-preview/useLivePreview.ts`)
and renders the view with live data + inspector props. The page branches
`isEnabled ? <XLive raw={raw} locale={locale}/> : <XView content={map(raw)}/>` so the non-draft path
never even imports the client wrapper's runtime behavior beyond the branch itself.

**Why getters return raw data.** `useContentfulLiveUpdates` (inside `useLivePreview`) subscribes to
field-level postMessage updates from the Contentful pane, and it needs the **untransformed** GraphQL
entry node to match updates against — not a reshaped view model. `getContentCollection` therefore
stopped reshaping its response; it now returns the raw node, and a new pure
`lib/contentful/mapContentCollection.ts` reproduces the old `{ title, description, creedItems, image }`
shape for the non-draft render path (same behavior, including the pre-existing always-`undefined`
`image`). `getSection`-backed getters (`getHeroBannerComponent`, `getCtaComponent`,
`getTextBlockComponent`) already returned raw nodes, so they needed no getter change. **Every
live-editable node needs `sys { id }` + `__typename`** in its `GRAPHQL_FIELDS` selection — including
nested union members, e.g. `... on BeliefItem` inside `ContentCollection`, so each Creed item is
individually inspectable rather than only the parent collection.

**CSP env-gating.** `config/headers.js` delegates to the pure, unit-tested
`buildSecurityHeaders({ previewLike })` in `config/securityHeaders.js`, branching on a single flag:

```js
const previewLike = VERCEL_ENV === "preview" || NODE_ENV === "development";
```

- **Production** (default branch): strict clickjacking protection — `X-Frame-Options: SAMEORIGIN`
  **and** `frame-ancestors 'self'` (no Contentful origins). Production is never Contentful-framable.
- **Preview / dev** (`previewLike`): `X-Frame-Options` is **omitted entirely** and `frame-ancestors`
  additionally allows `https://app.contentful.com` and `https://app.eu.contentful.com`.

The **same** flag also drives `shouldUseDraftMode()` (`lib/contentful/draftMode.ts`), so one condition
turns on draft content **and** opens the frame. Across the three Vercel tiers:

| Tier                 | Host                          | `previewLike` | Contentful-framable? | Live Preview role                                  |
| -------------------- | ----------------------------- | :-----------: | :------------------: | -------------------------------------------------- |
| **Production**       | `www.idcredentor.org`         |       ✗       |        **No**        | Deliberately never a preview target                |
| **Preview** (per-PR) | `*-git-<branch>-*.vercel.app` |       ✓       |         Yes          | Works, but the host changes every PR               |
| **Staging**          | `staging.idcredentor.org`     |       ✓       |         Yes          | **Stable host → the standing Live Preview target** |

Staging is a Vercel **branch** deployment, so Vercel injects `VERCEL_ENV=preview` there — the same
branch as a per-PR preview, but on a hostname that doesn't rot when a PR merges.

All other CSP directives (`script-src`, `connect-src`, `img-src`, `media-src`) are identical across
envs. **Gotcha:** `X-Frame-Options` and `frame-ancestors` both control framing, but browsers honor
whichever is stricter — leaving `X-Frame-Options: SAMEORIGIN` set on preview would silently block
the Contentful iframe even with a fully correct CSP. It must be genuinely absent, not merely relaxed.
`next.config.ts`'s `headers()` runs at build time, so each Vercel deployment bakes the branch for its
own `VERCEL_ENV` — a local `pnpm build` (no `VERCEL_ENV`) always resolves to the strict/production
branch, which is safe by default.

**Editor setup (one-time, human).** Live Preview needs **no secret, no cookie, and no query string** —
`previewLike` alone serves draft content _and_ allows the Contentful iframe. So a Content Preview URL
is simply **the page's own URL** on a framable host.

In Contentful → **Settings → Content preview**, create **two** preview environments:

| Preview environment | Content Preview URL                                  |
| ------------------- | ---------------------------------------------------- |
| Home                | `https://staging.idcredentor.org/{locale}`           |
| Community / Creed   | `https://staging.idcredentor.org/{locale}/community` |

`{locale}` is `es-AR` (the default) or `en-US`.

**Why two.** Contentful configures a preview URL **per content type**, but here entry→page is
**many-to-many**: the same content type — and even the same _entry_ — renders on both pages
(`contactCta` is a `section`; `ourMissionCollection` is a `contentCollection`; both appear on home
**and** on community). No single URL per content type can disambiguate, so the editor chooses the
preview environment instead. The rule generalizes: **one preview environment per page**, not per type —
a future content type on a third page needs a third preview environment.

> ⚠️ **Two unrelated things are called "staging".** The Vercel **staging deployment** (a hosting tier)
> is not the Contentful **`staging` environment** (the model-work content env — see
> `contentful-environments.md`). A Live Preview target must read the content env editors actually
> author in: `lib/contentful/fetch.ts` resolves `CONTENTFUL_ENVIRONMENT ?? "master"`, and the `master`
> alias points at `production`, where editors author. So **`CONTENTFUL_ENVIRONMENT` must stay unset on
> the staging deployment** (it is). Setting it to `staging` would silently aim the preview pane at the
> model-work env — blank or stale content, with **no error**.

**Not `/api/draft/enable`.** That route is not on the Live Preview path at all. Its only remaining role
is the **production draft opt-in**: it validates `CONTENTFUL_PREVIEW_SECRET`, enables Next draft mode,
and **always redirects to `/{locale}`** (the home page — it cannot deep-link to `/community` or a blog
post); `/api/draft/disable` turns it back off. Never use it as a Content Preview URL, and **never paste
the value** of `CONTENTFUL_PREVIEW_SECRET` into a Contentful settings field — reference secrets by
**name** only.

Production has no Content Preview URL by design: it is intentionally not Contentful-framable (see CSP
env-gating above).

> Actually performing this Contentful configuration is **ICR-135** (human-only — no MCP/CMA path exists
> for content-preview settings).

## On-demand revalidation

Published content is cached until a publish event invalidates it. The flow:

```
Editor publishes in Contentful
   │  webhook → POST /api/revalidate, header x-vercel-reval-key
   ▼
src/app/api/revalidate/route.ts
   │  if (secret !== process.env.CONTENTFUL_REVALIDATE_SECRET) → 401
   ▼
revalidateTag("site-content")   →  drops every fetchGraphQL cache entry
```

`CONTENTFUL_REVALIDATE_SECRET` is **required at runtime but missing from `.env.example`** — set it in the environment and configure the Contentful webhook to send the matching `x-vercel-reval-key` header. Because all requests share one tag, a single publish refreshes the entire site's content cache on next request.

## A second webhook + the app runtime's first CMA write path (ICR-114)

The publish webhook above is not the only one. A **separate** Contentful webhook — configured on
**draft save / `auto_save`**, not publish — sends `POST /api/predica/regenerate-pdf` with header
`x-predica-regen-key` whenever a preacher edits a sermon draft. It only marks a MongoDB job dirty
(see `docs/architecture/likes-and-mongodb.md`); a debounced Vercel Cron does the actual work. Full flow:
`docs/architecture/predica-pdf-mirrors-post.md` (Part B).

That cron's write-back (`apps/web/src/service/predica/contentfulWriteBack.ts`) is the **first time the app
runtime** — not just a `.claude` script run by an agent — holds a Contentful **Management** (write) token.
It uses the `contentful-management` SDK to upload a new PDF asset and swap it onto the sermon entry, DRAFT
only, never publishing.

**A subtle gotcha worth internalizing: `CONTENTFUL_ENVIRONMENT` has two different defaults depending on
which path reads it.**

| Path                                 | Default when `CONTENTFUL_ENVIRONMENT` is unset | Behavior on `master*`                                                             |
| ------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| **Read** (`lib/contentful/fetch.ts`) | the `master` **alias**                         | normal — this is the production read path                                         |
| **Write** (`contentfulWriteBack.ts`) | the concrete `production` **environment**      | **hard-refused** — the guard rejects `master`/`master-*` before building a client |

Why: a CMA write must land on a real, addressable environment, never an alias — writing "through" an alias
is exactly the kind of operation Contentful's environment model is designed to prevent, and it's also the
same invariant the local `.claude/scripts/predica/*.mjs` scripts already enforce (see
`docs/architecture/contentful-environments.md`). Today `master` and `production` resolve to the same
underlying environment, so this split is invisible in normal operation — but the write guard exists so that
if `master` is ever repointed to a new environment during a migration, the regen cron cannot write to the
wrong (old) one just because it inherited the alias default.

## Ignore `codegen.ts`

`codegen.ts` and the `@graphql-codegen/*` packages are present but **unused**. There is no generated GraphQL client, no `graphql.ts` output wired into the app, and the build does not depend on codegen. For the data layer, ignore it entirely — the hand-written getters above are the whole story. (If the team ever adopts codegen, that would be a deliberate migration documented here; until then, do not reference generated types that don't exist.)

## Adding a new content type — checklist

1. Model the type in Contentful with a `machineName` (or equivalent) lookup field, per-locale.
2. Add `lib/contentful/getYourType.ts` following the getter template; define `GRAPHQL_FIELDS`; reshape if helpful.
3. Add/extend a type in `lib/contentful/types.ts` or `src/types/` to match the selection.
4. Render it from the appropriate RSC under `src/app/[locale]/`, passing `locale` and `await shouldUseDraftMode()`.
5. If it's part of a `Page`'s section unions, add an inline fragment in `getPage.ts` and a branch in the component resolver.
6. Confirm the Contentful publish webhook is wired (it already revalidates `"site-content"`, so no per-type wiring is needed).

## Adding a field to an existing type's `GRAPHQL_FIELDS` — the whole-query trap

Because every getter hand-assembles its own GraphQL query string, adding a field to an **existing**
type is a two-step change with an ordering hazard that a codegen-based data layer would catch at
build time and this one does not:

1. Add the field to the type in Contentful (a `contentful-migration` script under
   `scripts/contentful/migrations/`).
2. Add the field name to the getter's `GRAPHQL_FIELDS` constant.

**Do these out of order — ship step 2 to an environment that hasn't had step 1 applied — and the
whole query breaks, not just the new field.** Contentful's GraphQL API validates the query against
the content model of the environment it targets; a field that does not exist there fails the
_entire_ document (`Cannot query field "x" on type "Y"`). `fetchGraphQL` never throws on a GraphQL
`errors` payload — it just resolves to `{ data: null, errors: [...] }` — so every getter's
null-safe reach-in (`data?.data?.<collection>?.items`) quietly returns `undefined` / `[]`, with
**no error surfaced anywhere** in logs or in what the page renders. Concretely, for a broken sermon
query: `getSermon()` → `undefined` → every sermon detail page 404s; `getAllSermons()` → `[]` → the
archive renders empty; `getLatestSermons()` → `[]` → the home-page sermon section empties too.

**The rule this creates, for every future field addition, not just this one:** a Contentful model
change must be **promoted to the environment the running code reads from _before_** that code is
deployed there — never after. For the ordinary small/additive case, that means Contentful **Merge**
`staging → production` lands **before** the PR's prod deploy, per the "Scenario B" playbook in
`docs/architecture/contentful-environments.md`. There is no schema check at build time and no
codegen to catch a mismatch early (see "Ignore `codegen.ts`" above) — a bad ordering only surfaces
at request time, in production, as a page that silently 404s or a list that silently empties.

### Worked example — sermon `audioLanguages` + `interpreter` (ICR-146)

`sermon` gained two additive, optional, non-localized fields
(`lib/contentful/getSermons.ts`, `src/types/Sermon.ts`):

- **`audioLanguages`** — `Array<Symbol>`, items validated `in: ["es-AR", "en-US"]`. It is an
  **array, not an enum with a `"bilingual"` member**: "bilingual" isn't a language the recording is
  _in_, it's a fact about which languages _are_ in it, and an array absorbs a third language later
  (e.g. a guest preacher's own language) with no breaking schema change — an enum would need a new
  member for every language combination.
- **`interpreter`** — `Link<Entry> -> author`, structurally identical to `preacher`. It is
  deliberately its **own field, not a third entry in `additionalPreachers`**: an interpreter did
  not preach the message, and folding them into the preacher byline would misattribute the sermon's
  authorship to someone who was relaying it live, not delivering it. Keeping it separate is also
  what lets `SermonHeader` render a distinctly-labeled "Interpretado por" credit instead of a
  preacher name.

**The `absent ⇒ ["es-AR"]` default survives the backfill — it is not a one-time migration shim.**
`normalizeAudioLanguages()` (`src/utils/sermon/audioLanguage.ts`), called from `mapSermon()`, treats
an absent, empty, or all-unrecognized `audioLanguages` as `["es-AR"]`. That default has to keep
working forever, not just until the backfill migration (`13b-backfill-sermon-audio.mjs`) runs once:
a human editing a sermon in the Contentful web app can leave the field blank, and — until ICR-147
wires it into `/predica` — a sermon created by the pipeline will too. Every sermon must stay
renderable with the field entirely absent, indefinitely.

**Staging is a content-_model_ work env, not a content mirror — plan data-migration validation
accordingly.** At the time this backfill script was validated, `staging` held 1 sermon entry
against production's 5, and did not contain the one entry that exercises the script's riskiest
paths (removing a hand-written interpreter blockquote; the republish-only-if-already-published
rule). A `--dry-run` of a data-migration script against `staging` cannot validate paths that
`staging`'s content doesn't exercise — there's no substitute for real data. What validated those
paths instead: unit tests pinned against the real rich-text document copied verbatim from the live
production entry, including a negative control proving a legitimate closing scripture blockquote
survives. A human-run `--dry-run` against `production` — right before the real run, at cutover — is
still the last check; it validates the plan against the actual data the script will touch.
