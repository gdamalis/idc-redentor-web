# AGENTS.md — idc-redentor-website

> This file is the authoritative agent guide for this repository and **supersedes `.cursorrules`**. The conventions below are the distilled, current version of those rules. Where `.cursorrules` and this file disagree, this file wins. (`.cursorrules` remains for editor tooling that reads it, but do not treat it as the source of truth.)

## Project Overview

IDC Redentor is the official bilingual (es-AR / en-US) website of Iglesia de Cristo Redentor: a content-managed informational church site with a blog, community/Creed content, a worship-service location page, a newsletter signup, and a contact form. It is the church's first custom website.

- Stack: **Next.js 16** (App Router) + **React 19** + **Contentful** (CMS) + **Tailwind CSS 4** + **next-intl**
- Version: 1.20.0 (from the root `package.json`)
- Node: 22.14.0 (`.nvmrc`) · Package manager: **pnpm** · Host: **Vercel** (production + per-PR preview deploys)

> **Monorepo layout:** this repo is a **pnpm + Turborepo** workspace. The website lives entirely under **`apps/web/`** — every app path in this guide (`src/`, `lib/`, `public/`, `config/`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, …) resolves **under `apps/web/`** unless stated otherwise. The repo root holds the workspace files (`pnpm-workspace.yaml`, `turbo.json`, root `package.json` with the released version + Turbo-proxy scripts), the `.claude/` harness, `docs/`, and `tasks/`. Bare `pnpm <task>` at root proxies through Turbo across the workspace; scope to the site with `pnpm --filter @idcr/web <task>`. Vercel builds with **Root Directory = `apps/web`**.

## No Auth / No AI / No Payments

**This project has no authentication, no RBAC, no payments/e-commerce, and no AI/LLM features.** Do not add any of them without an explicit product decision — see `docs/product/scope-and-boundaries.md`. The only write path open to a visitor is the anonymous blog "like" and the contact form; both are deliberately minimal.

## Commands

> Use **pnpm**. `type-check` is hyphenated — call `pnpm type-check`, not `pnpm typecheck`.

| Command                             | Purpose                                          |
| ----------------------------------- | ------------------------------------------------ |
| `pnpm dev`                          | Dev server (Turbopack)                           |
| `pnpm build`                        | Production build                                 |
| `pnpm start`                        | Serve production build                           |
| `pnpm lint`                         | ESLint (`eslint .`)                              |
| `pnpm type-check`                   | TypeScript check (`tsc --noEmit`)                |
| `pnpm test`                         | Vitest single run (`vitest run`)                 |
| `pnpm test:watch`                   | Vitest watch                                     |
| `pnpm e2e`                          | Playwright (config present; no specs in Phase 1) |
| `pnpm format` / `pnpm format:check` | Prettier write / check                           |

## Architecture

- **App Router**: pages under `src/app/[locale]/{page,who-is-jesus,community,come-meet-us,blog/[slug]}`; route handlers under `src/app/api/{likes,subscribe,revalidate,draft/{enable,disable}}`. No route groups; the contact form is a Server Action (`src/components/features/contact-form/contactFormAction.ts`).
- **Contentful data layer (hand-written GraphQL, not an SDK)**: `lib/contentful/fetch.ts` (`fetchGraphQL`) → `lib/contentful/get*.ts` → RSC pages/components. Every request is tagged `next: { tags: ["site-content"] }`. **There is no codegen or generated client — it's all hand-written** (the unused `codegen.ts` + `@graphql-codegen/*` deps were removed).
- **MongoDB** backs only two collections in db `website`: `likes` and `contact` (`src/service/database.service.ts` caches the client).
- **Email**: adapter pattern (`src/service/mailing.service.ts` selects `mailing/{sendgrid,resend}.adapter.ts` by `MAIL_PROVIDER`); templates in `src/templates/`. **Newsletter** = Mailchimp (`/api/subscribe`).
- **i18n**: next-intl, default `es-AR`, secondary `en-US`. Middleware in **`src/proxy.ts`** (exports `proxy`). UI strings in `public/locales/{es-AR,en-US}.json`.
- **Revalidation**: `POST /api/revalidate` with header `x-vercel-reval-key === CONTENTFUL_REVALIDATE_SECRET` → `revalidateTag("site-content")`.
- **Security/CSP**: `config/headers.js` (HSTS, X-Frame-Options, CSP allowlisting GTM/GA, Vercel, and Contentful image CDNs).
- **Path aliases**: `@src/*`, `@lib/*`, `@public/*`, `@icons/*`.

See `docs/architecture.md` and the domain docs in `docs/` for detail.

## Code Conventions

- TypeScript strict mode everywhere; functional/declarative; DRY; early returns.
- **Functional-first — avoid classes.** Prefer pure functions, plain objects, modules, and closures over classes. Model failures/outcomes as **return values** (a discriminated-union result like `{ ok: true } | { ok: false; reason }`, or `null`/`boolean`), never by throwing custom `Error` subclasses for control flow. No `class` declarations unless a scenario truly requires it (e.g. instantiating an unavoidable third-party SDK such as `new Resend()`); isolate and flag any such case in review. Repo-wide default for every session/agent.
- **Prefer `interface` over `type`**; **avoid enums (use const maps)**; use **`satisfies`** for validation.
- **Prefer `??` over `||`**.
- **RSC-first** — minimize `'use client'`; use Suspense + error boundaries for async.
- **Always `await`** Next.js runtime APIs: `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams`.
- Forms: `useActionState`, enhanced `useFormStatus`; minimize client state.
- Naming: auxiliary-verb booleans (`isLoading`, `hasError`); `handle*` event handlers; lowercase-dash directories; named exports for components.
- UI: Headless UI + Heroicons/Lucide + Framer Motion; Tailwind CSS v4; compose with `cn()`. Validate external input with **Zod** at boundaries.
- Default site language `es-AR`, secondary `en-US`.

## Testing

- **Vitest** (`vitest.config.ts`, jsdom): unit smoke tests on pure utilities and getter shape-mappers. `pnpm test` for a single run.
- **Playwright** (`playwright.config.ts`): four projects configured, **no specs in Phase 1**; `qa-runner` authors them per-ticket.
- QA targets **Vercel preview deployments** (`*.vercel.app`) — never production, no separate staging.
- No Storybook.

## Environment

> ⚠️ **`.env.example` is INCOMPLETE.** Several runtime-required variables are missing from it. Use the lists below (and `src/types/environment.d.ts`) as the source of truth. **Never put real secret values in docs/commits — reference variable names only.**

Required at runtime:

```text
NEXT_PUBLIC_BASE_URL
CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN, CONTENTFUL_PREVIEW_ACCESS_TOKEN, CONTENTFUL_PREVIEW_SECRET
CONTENTFUL_REVALIDATE_SECRET          # MISSING from .env.example
MONGODB_URI                           # MISSING from .env.example
MAIL_PROVIDER (sendgrid|resend)       # MISSING from .env.example
CONTACT_FORM_RECIPIENT_EMAIL          # MISSING from .env.example
FROM_EMAIL                            # MISSING from .env.example
MAILCHIMP_API_KEY, MAILCHIMP_API_SERVER, MAILCHIMP_AUDIENCE_ID
```

Conditionally required by `MAIL_PROVIDER` (both MISSING from `.env.example`):

```text
SENDGRID_API_KEY        # when MAIL_PROVIDER=sendgrid
RESEND_API_KEY          # when MAIL_PROVIDER=resend
```

Optional / injected:

```text
ENVIRONMENT_NAME
VERCEL_ENV              # injected by Vercel; drives draft mode
```

## Tracker (Jira)

- Project: **IDC Redentor** (key `ICR`) on `divinelab.atlassian.net` — a company-managed software project. Access via the Atlassian MCP (`mcp__atlassian-divinelab__*`).
- **`ICR-N`** is the **native Jira issue key** — `N` is the issue number, not a Trello idShort. Fetch the issue directly via `getJiraIssue(cloudId, "ICR-N")` (no scan-to-resolve); all Atlassian calls use the `ICR-N` key.
- Branches: `<type>/ICR-N-<slug>` · PR titles: `<type>(ICR-N): description`.
- Workflow statuses: **Backlog** → **To Do** → **In Progress** → **In Review** → **In Testing** → **Done**. `/work` transitions To Do → In Progress → In Review; `/merge` transitions In Review → In Testing (after a user-triggered squash-merge). **No agent ever transitions an issue to Done** — a human does that after deploying to production. Transitions resolve **by name** at runtime (`getTransitionsForJiraIssue` matching `transition.to.name`); the status name is the contract, never hardcode numeric transition ids.

## Git & Release

- **Conventional Commits**; header ≤ 100 chars; commitlint enforced via husky.
- **PR titles** follow `<type>(ICR-N): description` and are validated in CI by `amannn/action-semantic-pull-request`.
- **`semantic-release`** runs on `main` (`.releaserc.json`): `feat` → minor; `fix`, `perf`, `docs` → patch; `chore` → no release. (Note `docs` and `perf` cut a patch release here — be deliberate.)
- See `docs/contributing.md` for the branch/commit/PR + worktree flow.
