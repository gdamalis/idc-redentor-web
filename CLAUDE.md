# CLAUDE.md — idc-redentor-website

## Project Overview

**Iglesia de Cristo Redentor (IDC Redentor)** is the official bilingual (es-AR / en-US) website of the church: informational pages, a blog, community/values content (the Creed/Credo), a worship-service "come meet us" page with map + service times, a newsletter signup, and a contact form. It is the **first custom website** for the community — modern, fast, easy for non-technical editors to maintain, and welcoming to members and visitors.

It is a **content-managed informational site**, not an app: there is **no authentication, no RBAC, no payments, and no in-product AI**. Almost all content is rendered from **Contentful** via hand-written GraphQL in React Server Components. The only stateful reader feature is an anonymous blog "like".

**Version**: 1.10.0 (read from `package.json`) | **Node**: 22.14.0 (`.nvmrc`) | **Package Manager**: pnpm | **Host**: Vercel (production + per-PR preview deploys)

## Commands

> Run everything with **pnpm**. Note `type-check` is **hyphenated** (unlike some sibling projects' `typecheck`). The verifier and QA agents call `pnpm type-check`.

| Command             | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm dev`          | Dev server (Turbopack)                                               |
| `pnpm build`        | Production build                                                     |
| `pnpm start`        | Serve the production build                                           |
| `pnpm lint`         | ESLint (`eslint .`)                                                  |
| `pnpm type-check`   | TypeScript check (`tsc --noEmit`)                                    |
| `pnpm test`         | Vitest, single run (`vitest run`)                                    |
| `pnpm test:watch`   | Vitest in watch mode                                                 |
| `pnpm e2e`          | Playwright (`playwright test`) — config present, no specs in Phase 1 |
| `pnpm format`       | Prettier write                                                       |
| `pnpm format:check` | Prettier check                                                       |
| `pnpm prepare`      | Husky install (runs automatically on `pnpm install`)                 |

## Architecture

See `docs/architecture.md` for the full picture. The short version:

### App Router locale groups

```
src/app/
├── [locale]/                 # es-AR | en-US locale segment
│   ├── page.tsx              # Home
│   ├── who-is-jesus/         # ¿Quién es Jesús?
│   ├── community/            # Mission, values, the Creed/Credo
│   ├── come-meet-us/         # Worship service time + address + map
│   └── blog/[slug]/          # Blog index + article pages
└── api/                      # Route handlers (no auth)
    ├── likes/                # GET/POST blog likes (MongoDB)
    ├── subscribe/            # POST → Mailchimp newsletter
    ├── revalidate/           # POST → revalidateTag("site-content")
    └── draft/{enable,disable}/  # Contentful preview/draft mode toggles
```

There are **no route groups** (`(public)` / `(admin)`) — every page is public and lives directly under `[locale]/`. The contact form is a **Server Action** (`src/components/features/contact-form/contactFormAction.ts`), not an API route.

### Two data paths (keep them separate)

```
Contentful → lib/contentful/fetch.ts (fetchGraphQL) → lib/contentful/get*.ts → RSC page/component
MongoDB    → src/service/database.service.ts (cached client) → like/contact services → API route / Server Action
```

- **Contentful (read-only content)** is the primary source. Each `lib/contentful/get*.ts` getter hand-writes a GraphQL query string with inline `locale:` + `preview:` arguments and POSTs it through `fetchGraphQL`. Every request is tagged `next: { tags: ["site-content"] }` for on-demand revalidation. **`codegen.ts` is unused/aspirational — ignore it; there is no generated client.** See `docs/contentful-data-layer.md`.
- **MongoDB (the only writes)** backs exactly two collections in a database literally named `website`: `likes` (blog post likes) and `contact` (saved contact messages). See `docs/likes-and-mongodb.md`.

### i18n (next-intl)

- Default locale **`es-AR`**, secondary **`en-US`** (`src/i18n/config.ts`, `routing.ts`, `request.ts`).
- UI strings live in `public/locales/{es-AR,en-US}.json` — every user-facing string must exist in **both** files.
- Middleware is in **`src/proxy.ts`** (it exports `proxy`, not `middleware`); the matcher excludes `_next` / `_vercel` / `api` / `trpc` and bypasses static asset extensions.
- `buildLocaleAlternates()` in `src/i18n/config.ts` produces the hreflang alternates used by `lib/metadata.ts`. See `docs/i18n.md`.

### Email & newsletter

- **Transactional email** uses an adapter pattern: `src/service/mailing.service.ts` selects `src/service/mailing/{sendgrid,resend}.adapter.ts` by the `MAIL_PROVIDER` env var. HTML bodies come from `src/templates/`.
- **Newsletter** is **Mailchimp** via `/api/subscribe` (client helper `src/service/subscribe.ts`).
- See `docs/forms-and-email.md` for the contact + subscribe flows and the spam/PII discipline.

### Revalidation & draft mode

- `POST /api/revalidate` requires header `x-vercel-reval-key` to equal `CONTENTFUL_REVALIDATE_SECRET`, then calls `revalidateTag("site-content")`. Wired to a Contentful publish webhook.
- Draft/preview is decided by `lib/contentful/draftMode.ts#shouldUseDraftMode()` — true when Next draft mode is enabled, **or** `NODE_ENV=development`, **or** `VERCEL_ENV=preview`. The preview token + `preview: true` are used when draft is on.

### Security / CSP

- `config/headers.js` sets HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`, `Referrer-Policy`, and a CSP that allowlists GTM/GA, Vercel scripts, and the Contentful image CDNs (`images.ctfassets.net`, `images.eu.ctfassets.net`) plus `images.unsplash.com`. `next.config.ts` mirrors the image hosts in `images.remotePatterns`. Treat `config/headers.js` and the CSP as a security-sensitive surface.

### Path aliases

`@src/*` → `src/*` · `@lib/*` → `lib/*` · `@public/*` → `public/*` · `@icons/*` → `public/assets/svg/*` (from `tsconfig.json`).

## Code Conventions

Distilled from `.cursorrules` (which `AGENTS.md` supersedes). Apply these by default:

- **TypeScript everywhere, strict mode.** Functional/declarative style, DRY, early returns. Structure files as: exports → subcomponents → helpers → types.
- **Prefer `interface` over `type`** for object shapes. **Avoid enums — use const maps.** Use the **`satisfies`** operator for type validation.
- **Prefer nullish coalescing (`??`) over logical or (`||`)**.
- **RSC-first**: favor React Server Components, minimize `'use client'`. Use error boundaries and Suspense for async work.
- **Always `await`** Next.js runtime APIs: `cookies()`, `headers()`, `draftMode()`, `props.params`, `props.searchParams`.
- Forms use `useActionState` (not the deprecated `useFormState`) and the enhanced `useFormStatus`. Minimize client state.
- **Naming**: auxiliary-verb booleans (`isLoading`, `hasError`); `handle*` event handlers; **lowercase-dash directories**; **named exports** for components.
- **UI**: Headless UI + Heroicons / Lucide + Framer Motion; **Tailwind CSS v4**; compose classes with `cn()` (`src/utils/cn`). Validate external input with **Zod** at boundaries (`react-hook-form` + `@hookform/resolvers`).
- **Default site language is `es-AR`**, secondary `en-US`.
- **Commits**: Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `perf`, `docs`, `test`, `ci`), header ≤ 100 chars. `semantic-release` runs on `main`. See `docs/contributing.md`.

## Session naming (ticket-aware)

Sessions are named after the active Trello ticket automatically.

- **The naming is automatic; you don't (and can't) run `/rename` yourself.** `.claude/hooks/session-namer.sh` derives the ticket from the git branch (`<type>/ICR-N-<slug>`) or worktree dir (`.claude/worktrees/ICR-N`) and sets the session title via the `sessionTitle` hook field on `SessionStart` and each `UserPromptSubmit`. Title = `ICR-N-<first ~4 kebab words of the slug>`.
- The hook is idempotent and backs off once the live name carries the ticket, so a manual `/rename` is respected.
- On `main` or any branch without an `ICR-N`, the hook stays silent.
- **Do NOT emit "run `/rename …`" suggestions or apologise for being unable to rename** — the hook already handles it.

## Testing

- **Vitest** (`vitest.config.ts`, jsdom): unit smoke tests for pure utilities (`src/utils/*`, `src/i18n/config#buildLocaleAlternates`, getter shape-mappers). Run `pnpm test` (single pass) or `pnpm test:watch`. No coverage thresholds — coverage is report-only.
- **Playwright** (`playwright.config.ts`): configured with four projects (`e2ePublic`, `e2eBlog`, `apiForms`, `apiLikes`) but **no specs in Phase 1** — the `qa-runner` agent authors specs per-ticket. QA runs against **Vercel preview deployments** (`*.vercel.app`), never production and never a separate staging env (there is none).
- **No Storybook.**
- After any change, evaluate whether a meaningful test is warranted; do not add tests for trivial boilerplate.

## Environment Variables

> ⚠️ **`.env.example` is INCOMPLETE.** It lists only the Contentful + Mailchimp + base-URL vars; several variables that are **required at runtime** (per `src/types/environment.d.ts` and the services) are missing from it. When onboarding or debugging, copy from the **Required** table below, not just from `.env.example`. Fixing `.env.example` to match is a good first ticket.

### Required (must be set for the app to function)

| Variable                          | Purpose                                                           | In `.env.example`? |
| --------------------------------- | ----------------------------------------------------------------- | :----------------: |
| `NEXT_PUBLIC_BASE_URL`            | Canonical base URL for SEO/metadata. Set in Vercel, not committed |         ✅         |
| `CONTENTFUL_SPACE_ID`             | Contentful space                                                  |         ✅         |
| `CONTENTFUL_ACCESS_TOKEN`         | Content Delivery API token (published content)                    |         ✅         |
| `CONTENTFUL_PREVIEW_ACCESS_TOKEN` | Content Preview API token (drafts)                                |         ✅         |
| `CONTENTFUL_PREVIEW_SECRET`       | Secret for `/api/draft/enable`                                    |         ✅         |
| `CONTENTFUL_REVALIDATE_SECRET`    | `x-vercel-reval-key` for `/api/revalidate`                        |   ❌ **missing**   |
| `MONGODB_URI`                     | MongoDB connection (likes + contact)                              |   ❌ **missing**   |
| `MAIL_PROVIDER`                   | `sendgrid` or `resend` — selects the email adapter                |   ❌ **missing**   |
| `CONTACT_FORM_RECIPIENT_EMAIL`    | Where contact-form notifications are sent                         |   ❌ **missing**   |
| `FROM_EMAIL`                      | From address for transactional email                              |   ❌ **missing**   |
| `MAILCHIMP_API_KEY`               | Newsletter                                                        |         ✅         |
| `MAILCHIMP_API_SERVER`            | Newsletter datacenter (e.g. `us21`)                               |         ✅         |
| `MAILCHIMP_AUDIENCE_ID`           | Newsletter list                                                   |         ✅         |

### Conditionally required (by `MAIL_PROVIDER`)

| Variable           | Purpose                                | In `.env.example`? |
| ------------------ | -------------------------------------- | :----------------: |
| `SENDGRID_API_KEY` | Required when `MAIL_PROVIDER=sendgrid` |   ❌ **missing**   |
| `RESEND_API_KEY`   | Required when `MAIL_PROVIDER=resend`   |   ❌ **missing**   |

### Optional / injected

| Variable           | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `ENVIRONMENT_NAME` | Free-form environment label (e.g. `local`)                                         |
| `VERCEL_ENV`       | Injected by Vercel (`production` \| `preview` \| `development`); drives draft mode |

> **Secret hygiene:** never paste real secret values into docs, commits, or PRs — reference variable **names** only. `.env*` files are gitignored.

## Agent harness

This repo ships a Claude Code agent harness driven by four slash commands. See `docs/agent-harness.md` for the full guide.

- **`/pm`** — `product-manager`: intakes ideas, refines and grooms Trello cards against `docs/product/`. Hands off at **To Do**; never implements, never branches, never moves a card past To Do.
- **`/work [ICR-N]`** — explorer → implementer → verifier loop: creates a worktree, branches `<type>/ICR-N-<slug>`, moves the card **To Do → In Progress**, opens a PR, comments the PR link, and moves the card **→ In Review**. **Never moves a card to Done.**
- **`/qa [ICR-N]`** — `qa-runner` + `qa-acceptance` against the PR's **Vercel preview URL**; posts a structured result comment. **Phase 1 is report-only; auto-merge is disabled.**
- **`/verify`** — runs `pnpm type-check && pnpm lint && pnpm test && pnpm build` plus security checks.

A human always merges the PR and closes the card (moves it to **Done**). Scratchpads live in `tasks/{todo.md,lessons.md}` (gitignored); specs in `tasks/specs/`.

## Documentation

- **Product brain (the "church definition")** — [`docs/product/`](docs/product/README.md): the one-paragraph definition, mission/values/voice (draft), `scope-and-boundaries.md` (the hard IN/OUT/DEFERRED filter — no logins, no payments, no public UGC, no in-product AI), `content-types.md`, `editorial-and-content-rules.md`, and `ai-era-strategy.md`. The `product-manager` agent loads this folder on every run. Read it before shaping product work.
- **Engineering docs** — in `docs/`:
  - `architecture.md` — App Router groups, the Contentful↔MongoDB split, request lifecycle, path aliases, security posture.
  - `contentful-data-layer.md` — `fetchGraphQL`, the getter convention, the `site-content` cache tag, draft/preview, the revalidate webhook, why codegen is unused.
  - `contentful-mcp.md` — the official Contentful MCP server for agents (registered inline in local `~/.claude.json`; local/token, sandbox-env writes, `PROTECTED_ENVIRONMENTS=master`); the agent-only write path, separate from the app's read path.
  - `i18n.md` — next-intl setup, locales, message files, the `src/proxy.ts` middleware, locale alternates/hreflang.
  - `forms-and-email.md` — contact + subscribe flows, the SendGrid/Resend adapter, templates, spam/PII handling.
  - `likes-and-mongodb.md` — the cached Mongo client, the `likes`/`contact` collections, visitor de-dup, write safety.
  - `seo-and-metadata.md` — `lib/metadata.ts`, the Contentful `Seo` type, OG/Twitter cards, JSON-LD, locale alternates.
  - `agent-harness.md` — how to use the agents and commands; the human-gated Trello automation.
  - `contributing.md` — branch/commit/PR conventions, semantic-release, husky/CI gates, the worktree flow.
  - `gtm-ga4-setup.md` — _(existing)_ GTM/GA4 analytics + consent setup.
