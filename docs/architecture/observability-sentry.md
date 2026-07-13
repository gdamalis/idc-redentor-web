# Observability — Sentry

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `config/…`,
> `next.config.ts`, …) live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo
> root. Run commands at the root (Turbo proxies them) or scope to the site with
> `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** Why and how `@sentry/nextjs` is wired into `apps/web`, the four decisions that are
> easy to accidentally undo (the tunnel/proxy interaction, the CSP non-change, the PII posture, and
> the silent-locally-visible-in-CI auth-token warning), and the env vars that control it.
> **Last reviewed:** 2026-07-13

## What this is wired to

One Sentry project, initialized on all three Next.js App Router runtimes in `apps/web`:

- **Server** (nodejs) — `src/sentry.server.config.ts`
- **Edge** — `src/sentry.edge.config.ts`
- **Client** (browser) — `src/instrumentation-client.ts`

The three entry points are deliberately thin. Each just calls `Sentry.init(baseSentryOptions())`.
`src/instrumentation.ts#register()` is the Next.js-mandated dispatcher that dynamically imports the
server or edge config based on `process.env.NEXT_RUNTIME` (a static import would pull the Node SDK
into the edge bundle), and also exports `onRequestError = Sentry.captureRequestError` so errors
thrown by Server Components, route handlers, and the proxy are captured even outside a try/catch.
`src/app/global-error.tsx` is the root error boundary — it fires only when the root layout itself
has failed (the i18n provider is unavailable), calls `Sentry.captureException`, and is deliberately
**not** internationalized (there's no locale context to render with at that point).

This ticket (ICR-117) exists because live-site failures — e.g. the ICR-111-class MongoDB failures —
were previously invisible. The goal is stack traces landing somewhere a human can see them, split by
environment, without shipping PII to a third-party processor.

## The options factory is the single source of truth

`src/utils/sentry/options.ts` is the **only** unit with real logic in this feature; everything else
is wiring. It exports:

- `resolveSentryEnvironment(): string`
- `resolveTracesSampleRate(environment?: string): number`
- `baseSentryOptions(): BaseSentryOptions`

All three runtime entry points (server, edge, client) import `baseSentryOptions()` and pass it
straight to `Sentry.init`. This means the environment tag, the sampling policy, and the PII posture
are defined **exactly once** and are unit-testable in isolation (`options.test.ts`) — a runtime entry
point cannot drift from another because there is nothing runtime-specific left to drift.

## Environment resolution

```ts
NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? VERCEL_ENV ?? "development";
```

`VERCEL_ENV` alone is **not enough**. Vercel only ever sets it to `production`, `preview`, or
`development` — there is no native `staging` value. This site's staging deployment is a **separate
deploy at `staging.idcredentor.org`**, not a Vercel "Preview" in the platform's sense, so without the
explicit override every staging page load would tag its Sentry events `environment=production` (if
staging shares the production Vercel env) or `environment=preview` (if it's deployed via a preview
build) — either way, indistinguishable from the deploys it's supposed to be distinct from. Setting
`NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging` **only** on that one deployment is what makes staging show up
as its own environment in the Sentry UI. See `docs/architecture/contentful-environments.md` and the
project's `stagingUrl` in `.claude/config.json` for the same staging-is-not-a-native-Vercel-env fact
in a different context (Contentful envs).

## Sampling

| Environment             | `tracesSampleRate`   |
| ----------------------- | -------------------- |
| `production`            | `0.1`                |
| `staging` / `preview`   | `0.5`                |
| `development`           | `1.0`                |
| anything else (unknown) | `0.1` (conservative) |

`sampleRate` (error events, as opposed to performance traces) is **`1.0` everywhere** — we always
want every error, we just don't want every trace. The conservative production rate and the
conservative unknown-environment fallback both exist for the same reason: Sentry's free tier has a
monthly event quota, and traces are the highest-volume event type. An unrecognized environment string
(a typo in `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, a new deploy target nobody wired yet) should degrade to
"use less quota", never "silently sample everything."

## The PII posture — locked, and why

```ts
sendDefaultPii: false,
dataCollection: { userInfo: false, httpBodies: [] },
```

Sentry's v10 SDK collects user identity and HTTP request bodies **by default**. This site's contact
form is a Server Action that carries a congregant's **name, email, and free-text message**
(`docs/architecture/forms-and-email.md`). Without minimization, an unrelated 500 thrown during a
contact-form submit could ship that entire payload into Sentry — a third-party processor — as
incidental error context, on a public-facing church website with no auth layer to fall back on for
data-handling assurances.

The locked posture keeps stack traces (which is the diagnostic signal that actually motivated this
ticket) and gives up request-body/user-identity context. **This is deliberate and load-bearing.**
`options.test.ts` asserts both flags directly and will fail loudly if anyone relaxes them — treat a
failing PII assertion as a stop-the-line signal, not a test to "fix" by loosening it.

**Session Replay is intentionally not installed.** `replayIntegration()` is never imported anywhere in
this codebase. This is both a privacy call (Replay can capture on-screen content, including anything
a visitor typed into the contact form before an error fired) and a bundle-size call (Replay is the
single largest optional Sentry client chunk). If Replay is ever added later, it additionally requires
adding `worker-src 'self' blob:` to the CSP (`config/securityHeaders.js`) — Replay's client-side
compression runs in a Web Worker loaded from a `blob:` URL, which the current CSP does not allow.

## The tunnel, and why the CSP is untouched

`next.config.ts` passes `tunnelRoute: "/monitoring"` to `withSentryConfig`. This makes the SDK proxy
browser-side error/trace envelopes through the app's **own origin** at `/monitoring`, which then
forwards them server-side to Sentry's real ingest endpoint. Two consequences fall out of this:

1. **The CSP in `config/securityHeaders.js` needs no Sentry entry.** Browser requests never leave
   `'self'` — the existing `connect-src 'self' ...` already covers a same-origin POST. This is why
   the CSP file has zero Sentry-related lines. **If anyone ever removes `tunnelRoute`** (e.g. "let's
   simplify next.config.ts"), the browser SDK reverts to POSTing directly to
   `https://*.ingest.sentry.io`, and **every one of those requests will be CSP-blocked** the moment
   this ships — silently, because a CSP violation shows up only in the browser console / a CSP report
   endpoint, not as a build or type error. Anyone removing the tunnel **must** add `*.sentry.io` to
   `connect-src` in the same change, or client-side error/trace reporting goes dark.

2. **`/monitoring` must stay excluded from the `src/proxy.ts` matcher.** The matcher is:

   ```ts
   export const config = {
     matcher: ["/((?!_next|_vercel|api|trpc|monitoring).*)"],
   };
   ```

   If `monitoring` is ever removed from that negative-lookahead group, next-intl's middleware will
   rewrite `/monitoring` to `/es-AR/monitoring` (or `/en-US/monitoring`), which doesn't exist as a
   route. Every browser-side error and trace will 404, and — this is the dangerous part — **there is
   no error message anywhere.** The Sentry client SDK does not surface tunnel-delivery failures to
   the console by default; the app keeps working; nothing looks broken. The only symptom is that
   Sentry's dashboard quietly stops receiving browser events. If you're debugging "why did client
   errors stop showing up in Sentry," check this matcher **first**, before anything else.

## Wrapping order in `next.config.ts`

`withSentryConfig` wraps **outermost**, around the existing `withNextIntl(nextConfig)`:

```ts
export default withSentryConfig(withNextIntl(nextConfig), { ... });
```

`withSentryConfig` needs to see (and instrument) the final, fully-composed Next.js config — including
whatever `withNextIntl` adds — so it has to be the last wrapper applied. `nextConfig` itself is
untouched by this ticket.

`disableLogger` and `automaticVercelMonitors` are **deliberately not set** — both are deprecated as
top-level `withSentryConfig` options in the current SDK version (moved under `webpack.*`, which likely
no-ops anyway since Next 16 builds with Turbopack by default, not webpack). Do not add them back from
older Sentry docs/examples found online.

## Source maps and `SENTRY_AUTH_TOKEN`

At build time, `withSentryConfig` uploads source maps to Sentry using `SENTRY_ORG` / `SENTRY_PROJECT`
/ `SENTRY_AUTH_TOKEN`. This is a **build-time-only** concern — none of these three vars is read by
the running app.

- **A missing `SENTRY_AUTH_TOKEN` only warns; it never fails the build.** The bundler plugin logs
  something like `No auth token provided. Will not upload source maps.` and returns, skipping the
  upload step — the rest of the build proceeds and succeeds normally. This is exactly why CI stays
  green on every fork PR and on any environment that hasn't been wired with the token yet: source-map
  upload is a nice-to-have (readable stack traces in the Sentry UI), not a build gate.

- **`silent: !process.env.CI`** in the `withSentryConfig` options means that warning is **suppressed
  locally** and only printed when `process.env.CI` is truthy. In other words: **"I don't see the
  warning in my local build" tells you nothing about whether `SENTRY_AUTH_TOKEN` is set** — silence is
  the expected local behavior whether the token is present or absent. To actually confirm the token
  is wired, check the **CI** build log (where `silent` is `false`), or check the Vercel env var
  dashboard directly. Don't use "no warning locally" as evidence of anything.

## Absent DSN is a supported no-op

`baseSentryOptions().enabled` is `Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)`. When the DSN is unset
— local dev by default, a fork PR, any environment nobody has wired yet — `Sentry.init` runs with
`enabled: false`, which the SDK treats as a fully inert no-op: no network calls, no console noise, no
behavior change to the app. This is why `NEXT_PUBLIC_SENTRY_DSN` (and every other var below) is
**optional** in `apps/web/src/types/environment.d.ts` — an absent DSN is supported, expected behavior,
not a misconfiguration.

## Env vars

| Variable                         | Public?    | Purpose                                                              | Set on (Vercel tier)                               |
| -------------------------------- | ---------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`         | public     | Ingest endpoint. Absent → Sentry inert (app runs normally).          | Production + Staging + Preview                     |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | public     | Overrides the env tag. See "Environment resolution" above.           | Staging only                                       |
| `SENTRY_ORG`                     | not public | Build-time source-map upload.                                        | Production + Staging + CI                          |
| `SENTRY_PROJECT`                 | not public | Build-time source-map upload.                                        | Production + Staging + CI                          |
| `SENTRY_AUTH_TOKEN`              | **secret** | Build-time source-map upload only. Missing → warns, skips, build OK. | Production + Staging + CI (never PR-fork previews) |

Names only — never a real value — in `.env.example`, this doc, commits, or PRs. See
`apps/web/src/types/environment.d.ts` for the typed declarations and `apps/web/.env.example` for the
documented placeholders. `turbo.json`'s `tasks.build.env` also declares all five (plus `CI`, which
gates the `silent` option above) — the root `pnpm build` runs `turbo run build`, whose `env` allowlist
gates what a task actually sees; an undeclared var can be silently filtered out of the task
environment even if it's set in the shell, which would look identical to source-map upload just not
happening. (Vercel itself builds with Root Directory = `apps/web`, bypassing Turbo — this declaration
matters for local/CI builds and cache-key correctness, not for the Vercel build itself.)

## Related docs

- [`forms-and-email.md`](./forms-and-email.md) — the contact form and its PII discipline, which is
  the reason the Sentry PII posture is locked.
- [`contentful-environments.md`](./contentful-environments.md) — another place staging's
  not-a-native-Vercel-environment status matters.
- [`architecture.md`](./architecture.md) — the overall App Router / request-lifecycle picture this
  feature hooks into (`src/instrumentation.ts`, `src/proxy.ts`).
