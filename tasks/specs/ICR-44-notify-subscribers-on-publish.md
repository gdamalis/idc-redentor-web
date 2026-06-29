# ICR-44 — Email newly published blog posts & sermons to subscribers (locale-aware)

**Jira:** https://divinelab.atlassian.net/browse/ICR-44 · Story · QA depth: **heavy** · Component: Website
**Branch:** `feat/ICR-44-notify-subscribers-on-publish`
**Commit type:** `feat`

> ⚠️ Migrated-from-Trello note: the ticket body says "depends on **ICR-34**" — that is the OLD Trello number. The real broadcast engine is **ICR-29**, already merged to `main` (v1.21.0). Verified present in `origin/main`: `apps/web/src/service/broadcast.service.ts` + `broadcast/{resendBroadcast,broadcastLog,types}.ts`.

## Summary

When an editor publishes a **blog post** or a **sermon** in Contentful, automatically email newsletter subscribers an announcement (title, excerpt, link) in **their own locale**, exactly once per post+locale, via the existing ICR-29 Resend broadcast engine — without ever breaking cache revalidation, double-sending, or logging PII/secrets.

This ticket also closes the loop that makes broadcasts actually reach subscribers: today `/api/subscribe` writes **only to Mailchimp**, but the engine broadcasts to a **Resend audience**, so signups currently receive nothing. We repoint signup to **Resend**, and make the whole flow **locale-aware** from v1 via **two Resend audiences** (es-AR, en-US).

### Locked design decisions (brainstorm gate)

1. **Trigger:** extend the existing `/api/revalidate` webhook (one "on-publish" path; coordinates with ICR-52 Facebook auto-publish). Revalidate runs first/unconditionally; notification is an isolated, awaited side-effect that can never break revalidation.
2. **Content:** blog posts **and** sermons.
3. **Locale targeting:** **two Resend audiences** (one per locale). Each subscriber lives in their locale's audience; each post locale broadcasts to the matching audience. (Chosen over segments because segments may be a paid Resend feature — multiple audiences are free-tier-guaranteed.)
4. **Subscribe store:** **switch `/api/subscribe` to Resend** (drop the Mailchimp write). Mailchimp env/list becomes legacy.
5. **Migration:** **start fresh** — no migration of existing Mailchimp subscribers; the Resend audiences grow from new signups.

## Dependencies Check (must exist before starting — all ✅)

- ✅ ICR-29 broadcast engine: `sendBroadcast(input): Promise<BroadcastResult>` (`apps/web/src/service/broadcast.service.ts:18`) — never throws, idempotent on `broadcastId`, wraps inner `html` in the `broadcast` chrome template.
- ✅ `claimBroadcast()/markSent()/markFailed()` Mongo dedupe in `website.broadcast_log` (unique index on `broadcastId`), in-flight-race-safe (ICR-29 P1 fix). **Reused as-is — no new collection.**
- ✅ `resend@6.5.2` installed. Contacts API: `resend.contacts.create({ audienceId, email, unsubscribed?, firstName?, lastName?, properties? })`. Broadcasts target `audienceId` (or `segmentId`). Verified in `node_modules/.pnpm/resend@6.5.2/.../index.d.mts`.
- ✅ Content getters: `getBlogPostPage(slug, locale, isDraftMode?)` (`lib/contentful/getBlogPostPages.ts:154`), `getSermon(slug, locale, isDraftMode?)` (`lib/contentful/getSermons.ts:219`). Collections `blogPostPageCollection` / `sermonCollection` → content-type ids **`blogPostPage`** / **`sermon`**; both support `where: { sys: { id } }`.
- ✅ Email template engine: `renderTemplate(name, vars)` reads `TEMPLATES` (`src/templates/index.ts`); auto-injects `baseUrl` (`NEXT_PUBLIC_BASE_URL`) + `currentYear`.
- ✅ Webhook auth secret `CONTENTFUL_REVALIDATE_SECRET` (reused).

## Requirements

1. **Publish trigger (extend `/api/revalidate`)**
   1.1. Keep the existing auth: reject when `x-vercel-reval-key !== CONTENTFUL_REVALIDATE_SECRET` with `401` (unchanged).
   1.2. Call `revalidateTag("site-content")` **first and unconditionally** (also fix the stray invalid 2nd arg `"max"` → single-arg `revalidateTag("site-content")`).
   1.3. After revalidating, attempt notification inside a `try/catch` that **never** rethrows or changes the response: parse the JSON body (defensively — body may be empty/non-JSON), read `sys.contentType.sys.id` + `sys.id`, and call `notifyOnPublish({ contentTypeId, entryId })`. Any failure is logged (no PII/secrets) and swallowed.
   1.4. The response shape stays `{ revalidated: true, now }` (notification status is not surfaced to Contentful; optional non-fatal `notified` field allowed).

2. **Notification orchestrator (`post-notification.service.ts`)**
   2.1. `notifyOnPublish({ contentTypeId, entryId }): Promise<PostNotificationSummary>` — never throws.
   2.2. Map `contentTypeId` → a content config: `blogPostPage` → `{ kind:"blog", urlSegment:"blog", getById:getBlogPostPageById, toEmail }`; `sermon` → `{ kind:"sermon", urlSegment:"predicas", getById:getSermonById, toEmail }`. **Any other content type → no-op** (return `{ skipped:"unsupported-content-type" }`). Satisfies AC "non-blog content type does not trigger an email."
   2.3. For **each** locale in `BROADCAST_LOCALES` (`["es-AR","en-US"]`):
   - Skip if `!isResendBroadcastConfigured(locale)` (audience unset → safe no-op for that locale/env).
   - `post = await getById(entryId, locale)`. Skip if absent / no title (locale has no content).
   - Build email: `{ subject, html, text } = buildPostNotificationEmail({ kind, post, locale })`.
   - `await sendBroadcast({ broadcastId: \`${kind}:${post.slug}:${locale}\`, subject, html, text, locale })`. Dedupe + send handled by the engine.
2.4. Aggregate per-locale results into the summary (for logging + the route's optional `notified`).

3. **Locale-aware audience resolution (`resendAudience.ts`)**
   3.1. `resolveAudienceId(locale: BroadcastLocale): string | undefined` — returns `RESEND_AUDIENCE_ID_ES_AR` for `es-AR`, `RESEND_AUDIENCE_ID_EN_US` for `en-US`, **falling back to legacy `RESEND_AUDIENCE_ID`** when the per-locale var is unset (keeps single-audience deploys working).
   3.2. Pure, env-reading, no side effects. Unit-tested with env stubs.

4. **Engine: per-locale audience (modify ICR-29 engine, minimal)**
   4.1. `isResendBroadcastConfigured(locale: BroadcastLocale): boolean` = `Boolean(RESEND_API_KEY && resolveAudienceId(locale))` (was: `RESEND_API_KEY && RESEND_AUDIENCE_ID`). Update its one existing caller in `broadcast.service.ts` to pass `locale`.
   4.2. `createAndSendBroadcast(params)` — add `audienceId: string` to `BroadcastParams`; use it instead of reading `process.env.RESEND_AUDIENCE_ID`. Keep the early `resend-not-configured` guard on `RESEND_API_KEY` + `audienceId`.
   4.3. `broadcast.service.ts#sendBroadcast`: resolve `const audienceId = resolveAudienceId(locale)`; gate on `isResendBroadcastConfigured(locale)`; pass `audienceId` into `createAndSendBroadcast`. No change to the public `sendBroadcast` signature (still takes `BroadcastInput` which already has `locale`).

5. **Subscribe → Resend, locale-aware**
   5.1. Server service `subscribe.service.ts`: `addSubscriber(email, locale): Promise<SubscribeOutcome>` (discriminated union, never throws): `{ ok:true } | { ok:false; reason:"invalid-input"|"not-configured"|"already-subscribed"|"failed" }`. Uses `new Resend(RESEND_API_KEY).contacts.create({ audienceId: resolveAudienceId(locale), email, unsubscribed:false })`; maps Resend duplicate error → `already-subscribed`; missing key/audience → `not-configured`.
   5.2. `/api/subscribe/route.ts`: **Zod-validate** body `{ email: z.string().email(), locale: localeSchema (default "es-AR") }`; call `addSubscriber`; map outcome → existing i18n response contract: success → `{ success:true }` 200; `already-subscribed` → `{ messageKey:"SubscribeBanner.error-already-subscribed" }` 409; everything else → `{ messageKey:"SubscribeBanner.error-unexpected" }` 500/400. **Remove the Mailchimp import + call.**
   5.3. Client `subscribe(email, locale)` (`src/service/subscribe.ts`): POST `{ email, locale }`. Keep the `messageKey` mapping.
   5.4. `SubscribeForm.tsx` + `SubscribeBanner.tsx`: read `const locale = useLocale()` (next-intl) and pass it to `subscribe(email, locale)`.

6. **Non-goals / safety**
   - No rate-limiting on `/api/subscribe` (no existing infra; tracked as follow-up). The subscribe input is validated (Zod) and the abuse surface for mass email is the webhook, which is secret-gated.
   - `@mailchimp/mailchimp_marketing` dep becomes unused after 5.2 → follow-up cleanup (stray observation), not removed in this PR.

## Data Model Changes

- **No Contentful content-model change** (read-only: two new by-id getters reusing existing fragments). The §8.2 model-change gate does **not** apply.
- **No new MongoDB collection** — dedupe reuses `website.broadcast_log` (ICR-29).
- **No DB index changes.**

### Key TypeScript shapes

```ts
// src/service/resendAudience.ts
export function resolveAudienceId(locale: BroadcastLocale): string | undefined;

// src/service/subscribe.service.ts
export type SubscribeOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid-input"
        | "not-configured"
        | "already-subscribed"
        | "failed";
    };
export function addSubscriber(
  email: string,
  locale: BroadcastLocale,
): Promise<SubscribeOutcome>;

// src/service/post-notification.service.ts
export interface PublishEvent {
  contentTypeId: string;
  entryId: string;
}
export interface PostNotificationSummary {
  contentTypeId: string;
  handled: boolean;
  perLocale: Array<{
    locale: BroadcastLocale;
    status: "sent" | "skipped" | "failed" | "no-content" | "not-configured";
    reason?: string;
  }>;
}
export function notifyOnPublish(
  event: PublishEvent,
): Promise<PostNotificationSummary>;
export function buildPostNotificationEmail(input: {
  kind: "blog" | "sermon";
  post: BlogPost | Sermon;
  locale: BroadcastLocale;
}): { subject: string; html: string; text: string };
```

## API Changes

### `POST /api/revalidate` (extended, backward-compatible)

- **Auth:** unchanged (`x-vercel-reval-key`).
- **Body (now parsed, defensively):** Contentful publish payload; reads `sys.contentType.sys.id` (string) + `sys.id` (string). Empty/non-JSON/absent-`sys` body → still revalidates, skips notify.
- **Response:** `{ revalidated: true, now: number }` (optionally `notified?: PostNotificationSummary["perLocale"]`). Notify failures never change status code.

### `POST /api/subscribe` (request contract changes)

- **Request (Zod):** `{ email: string /* email */, locale?: "es-AR" | "en-US" /* default "es-AR" */ }`.
- **Responses:** `200 { success:true }` · `409 { messageKey:"SubscribeBanner.error-already-subscribed" }` · `400 { messageKey:"SubscribeBanner.error-unexpected" }` (invalid input) · `500 { messageKey:"SubscribeBanner.error-unexpected" }`.

## New Files / Modified Files

| File                                                                  | New/Mod       | Purpose                                                                                          |
| --------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web/src/service/resendAudience.ts`                              | New           | `resolveAudienceId(locale)` + per-locale env fallback.                                           |
| `apps/web/src/service/resendAudience.test.ts`                         | New           | Unit: locale→audience, legacy fallback, unset.                                                   |
| `apps/web/src/service/subscribe.service.ts`                           | New           | `addSubscriber(email, locale)` → Resend contact, typed outcome.                                  |
| `apps/web/src/service/subscribe.service.test.ts`                      | New           | Unit: success, duplicate→already-subscribed, not-configured, invalid.                            |
| `apps/web/src/service/post-notification.service.ts`                   | New           | `notifyOnPublish` orchestrator + `buildPostNotificationEmail`.                                   |
| `apps/web/src/service/post-notification.service.test.ts`              | New           | Unit: type routing, per-locale send/skip, non-blog no-op, failure isolation, broadcastId format. |
| `apps/web/src/templates/post-notification.template.ts`                | New           | `POST_NOTIFICATION_TEMPLATE` (inner body) + `POST_NOTIFICATION_COPY` per-locale strings.         |
| `apps/web/src/templates/index.ts`                                     | Mod           | Register `"post-notification"`.                                                                  |
| `apps/web/lib/contentful/getBlogPostPages.ts`                         | Mod           | Add `getBlogPostPageById(id, locale, isDraftMode?)`.                                             |
| `apps/web/lib/contentful/getSermons.ts`                               | Mod           | Add `getSermonById(id, locale, isDraftMode?)`.                                                   |
| `apps/web/src/service/broadcast/resendBroadcast.ts`                   | Mod           | `isResendBroadcastConfigured(locale)`; `createAndSendBroadcast` takes `audienceId`.              |
| `apps/web/src/service/broadcast.service.ts`                           | Mod           | Resolve audience by locale; pass through.                                                        |
| `apps/web/src/app/api/revalidate/route.ts`                            | Mod           | Parse body + isolated `notifyOnPublish`; fix `revalidateTag` arg.                                |
| `apps/web/src/app/api/subscribe/route.ts`                             | Mod           | Zod + `addSubscriber`; drop Mailchimp.                                                           |
| `apps/web/src/service/subscribe.ts`                                   | Mod           | Client `subscribe(email, locale)`.                                                               |
| `apps/web/src/components/shared/subscribe-form/SubscribeForm.tsx`     | Mod           | Pass `useLocale()`.                                                                              |
| `apps/web/src/components/shared/subscribe-banner/SubscribeBanner.tsx` | Mod           | Pass `useLocale()`.                                                                              |
| `apps/web/src/types/environment.d.ts`                                 | Mod           | Add `RESEND_AUDIENCE_ID_ES_AR`, `RESEND_AUDIENCE_ID_EN_US`.                                      |
| `apps/web/.env.example`                                               | Mod           | Document the two new audience vars.                                                              |
| `docs/forms-and-email.md`                                             | Mod (docs CP) | Document publish→broadcast flow + locale audiences + the config matrix.                          |

## Component Hierarchy (email body)

```
broadcast chrome (existing "broadcast" template — header logo, footer, unsubscribe)
└── post-notification inner body ({{title}}, {{imageUrl?}}, {{excerpt}}, {{ctaUrl}}, {{ctaLabel}})
```

No React component tree change; the two subscribe client components get a one-line `useLocale()` addition each.

## Edge Cases

1. **Empty / non-JSON webhook body** → revalidate succeeds; notify skipped (logged `notify: unparseable-body`). No 500.
2. **Unsupported content type** (e.g. `page`, asset) → no-op, no email. (AC.)
3. **Re-publish / edit** → same `broadcastId` → `claimBroadcast` returns already-sent → `sendBroadcast` returns `{status:"skipped"}`. No second email. (AC.)
4. **Concurrent webhook deliveries** for the same publish → `claimBroadcast` in-flight claim blocks the duplicate (ICR-29 fix). At most one send.
5. **Post exists in only one locale** → only that locale's audience is emailed; the other locale resolves no content → `no-content` skip.
6. **Audience not configured for a locale/env** (e.g. preview leaves `RESEND_AUDIENCE_ID_EN_US` unset) → `not-configured` skip for that locale; no throw. Safe by default.
7. **Resend send failure** → engine returns `{status:"failed"}`, `markFailed` keeps the row re-claimable; route still returns 200 (revalidation unaffected). Logged with `broadcastId`+reason only.
8. **Subscribe duplicate email** → Resend duplicate error mapped to `already-subscribed` messageKey (409), matching today's UX.
9. **Subscribe with missing/invalid locale** → defaults to `es-AR` (primary). Invalid email → `error-unexpected` (400) before any Resend call.
10. **No PII/secrets in logs** — logs use `broadcastId`, `contentTypeId`, `reason`; never the subscriber email or API keys.

## i18n

- Email copy is **not** in `public/locales/*.json` (`getTranslations()` is unavailable outside an RSC request). It lives in a TS const map `POST_NOTIFICATION_COPY: Record<BroadcastLocale, { subjectPrefix; ctaLabel; readMoreFallbackExcerpt }>` in `post-notification.template.ts`, mirroring `BROADCAST_CHROME`.
  - es-AR: subject `"Nueva publicación: <título>"` (sermon: `"Nueva prédica: <título>"`); CTA `"Leer más"` (sermon: `"Ver la prédica"`).
  - en-US: subject `"New post: <title>"` (sermon: `"New sermon: <title>"`); CTA `"Read more"` (sermon: `"Watch the sermon"`).
- No new keys in `public/locales/*.json` (the subscribe banner messageKeys already exist from ICR-47). Verify `SubscribeBanner.error-already-subscribed` + `SubscribeBanner.error-unexpected` exist in both files (they do).
- URLs: `${NEXT_PUBLIC_BASE_URL}/${locale}/${urlSegment}/${slug}` — `blog` for posts, `predicas` for sermons.

## Configuration (HUMAN, one-time — "what you need to configure")

> Resend free tier allows multiple audiences (cap: 1,000 total contacts + 1 verified domain). Two audiences is free-safe.

1. **Resend dashboard → Audiences:** create two audiences in the production Resend account, e.g. `IDC Redentor — Español` and `IDC Redentor — English`. Copy each audience id.
2. **Vercel env vars** (Project → Settings → Environment Variables) — set on the tiers indicated:
   | Var | Production | Preview | Staging |
   | --- | --- | --- | --- |
   | `RESEND_AUDIENCE_ID_ES_AR` | prod es audience | **test** es audience or unset | **test** es audience or unset |
   | `RESEND_AUDIENCE_ID_EN_US` | prod en audience | **test** en audience or unset | **test** en audience or unset |
   | `RESEND_API_KEY` | ✅ (already) | ✅ | ✅ |
   | `BROADCAST_POSTAL_ADDRESS` | ✅ (already) | ✅ | ✅ |
   | `FROM_EMAIL`, `MAIL_PROVIDER=resend` | ✅ (already) | ✅ | ✅ |
   - **Safety (lessons.md):** on Preview/Staging use **separate test audiences** (only your own addresses) or leave the audience vars **unset** (then notify + subscribe safely no-op there). Never point pre-prod at the real congregation audiences.
   - Legacy `RESEND_AUDIENCE_ID` may stay as the es-AR fallback or be removed once the per-locale vars are set.
3. **Contentful publish webhook:** the webhook that calls `POST /api/revalidate` must send a payload containing `sys.contentType.sys.id` + `sys.id` (Contentful's **default** entry payload does). If it was customized to a minimal payload, add those fields. (Handler is defensive: missing → revalidate-only, no crash.)
4. **Start fresh:** existing Mailchimp subscribers are **not** migrated; the Resend audiences populate from new signups. (Mailchimp can be decommissioned later under ICR-18.)

## Testing Strategy

**Vitest (unit) — minimal seeded, mock `resend` + getters + `broadcast.service`:**

- `resendAudience.test.ts`: each locale → its var; fallback to `RESEND_AUDIENCE_ID`; unset → `undefined`.
- `subscribe.service.test.ts`: success path; Resend duplicate → `already-subscribed`; no key/audience → `not-configured`; invalid email → `invalid-input`.
- `post-notification.service.test.ts`: `blogPostPage`/`sermon` routing; unsupported type → no-op (no `sendBroadcast`); per-locale send vs `no-content` skip; `not-configured` skip; failure isolation; **exact `broadcastId` format** `kind:slug:locale`; no PII in logged strings.
- `resendBroadcast` existing tests updated for the `audienceId` param + `isResendBroadcastConfigured(locale)`.
- email builder: subject/CTA per locale + correct absolute URL.

**Manual smoke (Vercel preview) + QA (heavy, `qaType: api` reconciled vs diff):**

- `POST /api/revalidate` with bad/missing secret → 401; valid secret + non-blog payload → 200 + no send; (controlled) blog payload → 200 (engine no-ops or hits **test** audience only).
- `POST /api/subscribe` validation (missing email → error shape; valid → success against a **test** audience).
- Playwright `apiForms` project tags apply (revalidate + subscribe). e2e spec authored per-ticket on heavy by qa-runner. **No happy-path POST that emails real people.**

## Implementation Checkpoints

**CP1 — Locale-aware engine.** New `resendAudience.ts` (+test). Modify `resendBroadcast.ts` (`isResendBroadcastConfigured(locale)`, `createAndSendBroadcast` takes `audienceId`) + `broadcast.service.ts` (resolve+pass) + `environment.d.ts` (two vars). Update existing engine tests.

- Verify: `pnpm type-check && pnpm lint && pnpm test`.
- Commit: `feat(ICR-44): make broadcast engine resolve a Resend audience per locale`

**CP2 — Subscribe → Resend, locale-aware.** New `subscribe.service.ts` (+test). Rewrite `api/subscribe/route.ts` (Zod + addSubscriber, drop Mailchimp). Client `subscribe.ts` (`email, locale`). `SubscribeForm`/`SubscribeBanner` pass `useLocale()`.

- Verify: type-check + lint + test (+ build, since client components change).
- Commit: `feat(ICR-44): route newsletter signup to a locale-specific Resend audience`

**CP3 — Email template + content-by-id getters.** New `post-notification.template.ts` (`POST_NOTIFICATION_TEMPLATE` + `POST_NOTIFICATION_COPY`); register in `templates/index.ts`. Add `getBlogPostPageById` + `getSermonById`. Pure `buildPostNotificationEmail` (+test).

- Verify: type-check + lint + test.
- Commit: `feat(ICR-44): add post-notification email template and by-id content getters`

**CP4 — Notification orchestrator.** New `post-notification.service.ts` (`notifyOnPublish` + wire `buildPostNotificationEmail`) (+test): content-type routing, per-locale resolve/render/send, dedupe via engine, failure isolation.

- Verify: type-check + lint + test.
- Commit: `feat(ICR-44): orchestrate per-locale post-publish broadcasts`

**CP5 — Wire the webhook.** Extend `api/revalidate/route.ts`: revalidate first (fix `revalidateTag` arg), then isolated `notifyOnPublish`. Route test (auth, non-blog no-op, notify failure never 500).

- Verify: type-check + lint + test + build.
- Commit: `feat(ICR-44): trigger subscriber notification from the Contentful publish webhook`

**CP6 — Docs + env example.** `.env.example` (two vars), `docs/forms-and-email.md` (flow + config matrix), `.env.example` note that Mailchimp is now legacy. (Docs evaluation step; commit type `docs` is fine.)

- Verify: type-check + lint + format:check.
- Commit: `docs(ICR-44): document publish→broadcast flow and per-locale Resend audiences`

## Open Questions / deferred

- **AC update on Jira:** the issue's ACs predate the locale-tagging + Resend-switch scope. After spec approval, append ACs for: locale-correct send per subscriber; signup writes to the locale Resend audience; sermons covered. (So the acceptance-judge tests the real scope.)
- Rate-limiting `/api/subscribe` — follow-up.
- Remove unused `@mailchimp/mailchimp_marketing` dep — follow-up (stray observation).
- Confirm exact Resend duplicate-contact error shape against the installed SDK at CP2 (bind to types, per ICR-29 lesson).
- Confirm `sys.contentType.sys.id` literals are exactly `blogPostPage` / `sermon` against a real webhook payload (high confidence from the GraphQL collection names).
