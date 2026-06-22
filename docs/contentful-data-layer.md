# Contentful Data Layer

> **Purpose:** How content gets from Contentful onto a page — the hand-written GraphQL convention in `lib/contentful/`, the single `site-content` cache tag, draft/preview, and on-demand revalidation. Also: why `codegen.ts` is irrelevant.
> **Last reviewed:** 2026-06-21

## The shape of it

Every piece of page content is read from Contentful's GraphQL API by a small getter in `lib/contentful/`. There is **no Contentful SDK, no Apollo client, and no generated types** — each getter builds a GraphQL query string by hand and POSTs it through a single helper.

```
lib/contentful/fetch.ts        fetchGraphQL(query, preview)   ← the one transport
lib/contentful/get*.ts         one getter per content type     ← the query strings
src/app/[locale]/**            RSC pages call the getters       ← the consumers
```

> This is the app's **read** path (Delivery/Preview GraphQL API). There is a separate,
> agent-only **write** path: Claude Code agents talk to Contentful's Management API through
> the Contentful MCP server (token-based, writes scoped to a sandbox environment). The
> two never mix — see `docs/contentful-mcp.md`.

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

Each getter follows the same template (see `lib/contentful/getPage.ts`, `getBlogPostPages.ts`, `getContentCollection.ts`, `getEventBanner.ts`, `getFooter.ts`, `getNavigationMenu.ts`, `getSeo.ts`, `getContactForm.ts`, plus the per-component getters `getCtaComponent`, `getDuplexComponent`, `getHeroBannerComponent`, `getTextBlockComponent`, `getSingleEmailForm`):

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

## Ignore `codegen.ts`

`codegen.ts` and the `@graphql-codegen/*` packages are present but **unused**. There is no generated GraphQL client, no `graphql.ts` output wired into the app, and the build does not depend on codegen. For the data layer, ignore it entirely — the hand-written getters above are the whole story. (If the team ever adopts codegen, that would be a deliberate migration documented here; until then, do not reference generated types that don't exist.)

## Adding a new content type — checklist

1. Model the type in Contentful with a `machineName` (or equivalent) lookup field, per-locale.
2. Add `lib/contentful/getYourType.ts` following the getter template; define `GRAPHQL_FIELDS`; reshape if helpful.
3. Add/extend a type in `lib/contentful/types.ts` or `src/types/` to match the selection.
4. Render it from the appropriate RSC under `src/app/[locale]/`, passing `locale` and `await shouldUseDraftMode()`.
5. If it's part of a `Page`'s section unions, add an inline fragment in `getPage.ts` and a branch in the component resolver.
6. Confirm the Contentful publish webhook is wired (it already revalidates `"site-content"`, so no per-type wiring is needed).
