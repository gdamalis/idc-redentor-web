# Architecture

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** The big picture of how the IDC Redentor website is put together — the App Router structure, the two data paths, the request lifecycle, where each concern lives, and the security posture. Read this first; the other engineering docs drill into one area each.
> **Last reviewed:** 2026-06-21

## What this is

A bilingual (es-AR / en-US) **content-managed informational site** for Iglesia de Cristo Redentor, built on **Next.js 16** (App Router) + **React 19**, with **Contentful** as the CMS, **Tailwind CSS 4** for styling, and **next-intl** for localization. It is deployed on **Vercel** (production + a preview deployment per pull request). There is **no authentication, no RBAC, no payments, and no AI** — almost every byte of the page is read from Contentful and rendered in a Server Component.

The one stateful reader feature is an anonymous blog "like", and the contact form persists messages. Those are the only writes the app performs, and they go to MongoDB — never to Contentful.

## Directory map

```
idc-redentor-website/
├── src/
│   ├── app/
│   │   ├── [locale]/                # locale-scoped pages (es-AR | en-US)
│   │   │   ├── page.tsx             # Home
│   │   │   ├── who-is-jesus/        # ¿Quién es Jesús?
│   │   │   ├── community/           # Mission, values, Creed/Credo
│   │   │   ├── come-meet-us/        # Service time + address + map
│   │   │   └── blog/[slug]/         # Blog index + article pages
│   │   └── api/                     # Route handlers (no auth)
│   │       ├── likes/               # GET/POST blog likes
│   │       ├── subscribe/           # POST → Resend (per-locale audience)
│   │       ├── revalidate/          # POST → revalidateTag + per-locale subscriber broadcast
│   │       └── draft/{enable,disable}/  # Contentful preview toggles
│   ├── components/                  # UI + feature components
│   │   └── features/contact-form/   # contactFormAction.ts (Server Action)
│   ├── service/                     # MongoDB + email services
│   │   ├── database.service.ts      # cached MongoClient
│   │   ├── like.service.ts          # likes collection
│   │   ├── contact.service.ts       # contact collection
│   │   ├── contact-form-email.service.ts
│   │   ├── mailing.service.ts       # adapter selector (MAIL_PROVIDER)
│   │   ├── mailing/{sendgrid,resend}.adapter.ts
│   │   └── subscribe.ts             # client → /api/subscribe
│   ├── templates/                   # HTML email templates + engine
│   ├── i18n/{config,routing,request}.ts
│   ├── types/                       # shared TS types + environment.d.ts
│   ├── utils/                       # cn(), formatDate, etc.
│   └── proxy.ts                     # next-intl middleware (exports `proxy`)
├── lib/
│   ├── contentful/                  # the GraphQL data layer (get*.ts)
│   └── metadata.ts                  # buildPageMetadata / buildArticleMetadata / JSON-LD
├── config/headers.js                # security headers + CSP
├── public/locales/{es-AR,en-US}.json  # UI strings
├── public/assets/                   # images + svg (@icons alias)
└── docs/                            # these docs + docs/product (the church brain)
```

## The two data paths

Keep these mentally separate — they never cross.

### 1. Contentful → RSC (everything you read on a page)

```
Contentful Space
   │  hand-written GraphQL query string (locale + preview args)
   ▼
lib/contentful/fetch.ts   →  fetchGraphQL(query, preview)
   │  POST graphql.contentful.com, next: { tags: ["site-content"] }
   ▼
lib/contentful/get*.ts    →  getPage, getBlogPostPage, getContentCollection, getEventBanner,
   │                          getFooter, getNavigationMenu, getSeo, getContactForm, …
   ▼
src/app/[locale]/**       →  React Server Component renders the data
```

This is the primary path. There is **no Contentful SDK and no generated client** — each getter writes its own GraphQL string. Caching and invalidation ride on the single `"site-content"` cache tag. Full detail in [`contentful-data-layer.md`](./contentful-data-layer.md).

### 2. MongoDB → API / Server Action (the only writes)

```
src/service/database.service.ts   →  cached MongoClient, db "website"
   ├── like.service.ts     ← /api/likes (GET/POST)          collection: likes
   └── contact.service.ts  ← contactFormAction (Server Action)  collection: contact
```

MongoDB holds exactly two collections. Nothing else in the app writes to a database. Detail in [`likes-and-mongodb.md`](./likes-and-mongodb.md).

## Request lifecycle (a page render)

1. A request for `/{locale}/{path}` hits the edge. **`src/proxy.ts`** (next-intl middleware) runs first: it short-circuits OPTIONS, bypasses static assets, and otherwise resolves/validates the locale. The matcher skips `_next`, `_vercel`, `api`, and `trpc`.
2. The matching `src/app/[locale]/…/page.tsx` Server Component runs. It calls one or more `lib/contentful/get*.ts` getters with the resolved `locale` and the result of `shouldUseDraftMode()`.
3. `generateMetadata` (where present) calls `lib/metadata.ts#buildPageMetadata`, which fetches the page's `Seo` entry and emits title/description/OG/Twitter/canonical/hreflang. See [`seo-and-metadata.md`](./seo-and-metadata.md).
4. The page renders server-side. Interactive bits (`'use client'`) hydrate on the client — the like button, the contact form, the subscribe box.
5. `config/headers.js` attaches the security headers + CSP to the response.

API routes and the contact-form Server Action follow their own short lifecycles (validate input → call a service → return JSON / an action result).

## Draft / preview vs. published

`lib/contentful/draftMode.ts#shouldUseDraftMode()` returns `true` when **any** of: Next.js draft mode is enabled (via `/api/draft/enable`), `NODE_ENV === "development"`, or `VERCEL_ENV === "preview"`. When true, getters pass `preview: true` and `fetchGraphQL` uses the **Preview** access token, so editors see drafts in dev and on every Vercel preview deployment automatically. Production (`VERCEL_ENV=production`) shows only published content unless an editor explicitly enables draft mode.

## Revalidation

Contentful content is cached and revalidated **on demand**, not on a timer. A Contentful publish webhook calls `POST /api/revalidate` with header `x-vercel-reval-key`. The route checks it against `CONTENTFUL_REVALIDATE_SECRET` and calls `revalidateTag("site-content", "max")`, which drops the cache for every `fetchGraphQL` request (all are tagged `"site-content"`). Revalidation runs first and unconditionally; the same route then fires an **isolated** per-locale subscriber broadcast when the published entry is a blog post or sermon (a notify failure never breaks revalidation). See [`contentful-data-layer.md`](./contentful-data-layer.md) and [`forms-and-email.md`](./forms-and-email.md).

## Internationalization

next-intl drives both routing and message lookup. Default locale **`es-AR`**, secondary **`en-US`**. Content text comes from Contentful per-locale; chrome/UI strings come from `public/locales/{es-AR,en-US}.json`. Locale alternates (hreflang) are generated by `buildLocaleAlternates()` and attached in `lib/metadata.ts`. Full detail in [`i18n.md`](./i18n.md).

## Security posture

- **`config/headers.js`** applies to every path: `Strict-Transport-Security` (2-year, preload), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection`, `X-DNS-Prefetch-Control`, and a **Content-Security-Policy**.
- The CSP `frame-ancestors` allows the Contentful web app (`app.contentful.com`, `app.eu.contentful.com`) so editors can preview in-context. `script-src`/`connect-src` allowlist Google Tag Manager / Analytics and Vercel scripts; `img-src` allowlists the Contentful image CDNs (`images.ctfassets.net`, `images.eu.ctfassets.net`) and `images.unsplash.com`. `next.config.ts` mirrors those image hosts in `images.remotePatterns`.
- **Treat `config/headers.js` and the CSP as a security-sensitive surface.** Adding a third-party script/pixel means updating the CSP; the harness lists `config/**` among its sensitive paths.
- **No auth means no session/cookie attack surface beyond the anonymous `_visitor_id` cookie** used by likes (httpOnly, SameSite=Lax, secure in production). The only PII the app handles is contact-form submissions and newsletter emails — keep that surface small (see [`forms-and-email.md`](./forms-and-email.md)).

## Path aliases

From `apps/web/tsconfig.json`:

| Alias       | Resolves to           |
| ----------- | --------------------- |
| `@src/*`    | `src/*`               |
| `@lib/*`    | `lib/*`               |
| `@public/*` | `public/*`            |
| `@icons/*`  | `public/assets/svg/*` |

Use them instead of long relative paths. `vite-tsconfig-paths` makes them work under Vitest too.

## A note on `codegen.ts`

`codegen.ts` and the `@graphql-codegen/*` dependencies are **aspirational and currently unused**. The data layer is entirely hand-written GraphQL strings. Do not assume a generated client exists; if you need types, read them from `lib/contentful/types.ts` and `src/types/`. See [`contentful-data-layer.md`](./contentful-data-layer.md).
