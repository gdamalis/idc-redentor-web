# Forms & Email

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** End-to-end map of the two public form flows — the **contact form** (persist + notify by
> email) and the **newsletter subscribe** (Resend — locale-aware since ICR-44) — plus the
> SendGrid/Resend email adapter, the template engine, the publish→broadcast notification flow
> (ICR-44), and the spam/PII discipline that applies because these are the only paths that handle
> personal data.
> **Last reviewed:** 2026-06-29

## Two flows, one principle

The contact form and the newsletter signup are the **only** places the public can submit data. Everything else is read-only. Because they touch PII (names, email addresses, free-text messages), keep the surface minimal, validate input, and never log or expose submissions beyond what the flow needs.

## Contact form

The contact form is implemented as a **React Server Action**, not an API route.

```
ContactForm (client, useActionState)
   │  FormData
   ▼
src/components/features/contact-form/contactFormAction.ts   "use server"
   │  handleContactFormSubmission(prev, formData, requiredFields)
   ├── validate required fields + email regex
   ├── build ContactDetails { name, email, subject, message }
   ├── sendContactForm(details)        → src/service/contact.service.ts   → Mongo "contact"
   └── sendContactFormEmail(details)   → src/service/contact-form-email.service.ts → email
```

### Validation (`contactFormAction.ts`)

- Caller passes `requiredFields`; the action rejects with the `error-required-fields` messageKey if any are empty (localized client-side).
- Email is checked against a regex; bad addresses get the `error-invalid-email` messageKey.
- The form content shape is `ContactDetails = { name, email, subject, message }` (`src/types/ContactDetails.ts`).
- **Note:** validation here is a hand-rolled regex, not a Zod schema. The project convention is Zod at boundaries — when extending this form, prefer migrating to a Zod schema shared between client and the action. (The form _fields_ themselves are content-driven: `getContactForm` reads a `ContactForm` Contentful entry whose `fieldsCollection` defines `FormField` name/type/required/validation/placeholder.)

### Persistence (`contact.service.ts`)

`sendContactForm` connects via the cached Mongo client, inserts `{ ...contactDetails, createdAt: new Date() }` into the **`contact`** collection of db `website`, and verifies `result.acknowledged`. `getContactMessages` reads them back sorted newest-first (for an eventual internal view — there is no public read path). See [`likes-and-mongodb.md`](./likes-and-mongodb.md).

### Email notification (`contact-form-email.service.ts`)

`sendContactFormEmail` builds a plain-text body **and** an HTML body (via the template engine, below), then calls the mailing service:

```ts
return await sendEmail({
  to: RECIPIENT_EMAIL, // process.env.CONTACT_FORM_RECIPIENT_EMAIL
  subject: `Nuevo mensaje de Contacto: ${subject}`,
  text: plainTextContent,
  html: htmlContent, // renderTemplate("contact-form", { … })
});
```

The recipient is `CONTACT_FORM_RECIPIENT_EMAIL`. The user's free-text `message` has its newlines converted to `<br>` for the HTML body — note this is **not** HTML-escaping. The template engine does naive `{{key}}` substitution, so a hostile submission could inject markup into the notification email. For an internal-only notification this is low-risk, but **sanitize/escape user-supplied fields if these emails are ever forwarded or rendered in a richer client.**

### Failure semantics

The action treats the **database write as the source of truth**: if the Mongo insert succeeds it returns success **even when the email fails** (the email failure is logged, not surfaced). If the DB write fails, the user sees the localized save-failure message. This is intentional — a submission is never silently lost, but a transient email outage doesn't block the user.

The action is **locale-agnostic**: it returns a stable `messageKey` (one of `ContactFormKey` from `src/components/features/contact-form/contactFormMessageKeys.ts` — `success-message`, `error-required-fields`, `error-invalid-email`, `error-save-failed`, `error-unexpected`), and the client (`ContactForm.tsx`) resolves it to localized text via `useTranslations()` against the `ContactForm` namespace in `public/locales/{es-AR,en-US}.json`. Raw `error.message` from caught exceptions is **never** surfaced to the user (it maps to the generic `error-unexpected` key) — see ICR-49.

## Newsletter subscribe (Resend — locale-aware)

> **ICR-44:** `/api/subscribe` was repointed from Mailchimp to Resend Contacts. Mailchimp env vars are
> kept in `.env.example` as a reference but are **no longer used** by the app; they can be removed when
> the Mailchimp account is decommissioned (ICR-18). Existing Mailchimp subscribers are **not** migrated
> — the Resend audiences populate exclusively from new signups (start fresh).

```
Subscribe box (client, useLocale())
   │  subscribe(email, locale) → src/service/subscribe.ts (fetch POST /api/subscribe)
   ▼
src/app/api/subscribe/route.ts
   ├── Zod: { email (required, trimmed), locale? (default "es-AR") }
   ├── addSubscriber(email, locale)    → src/service/subscribe.service.ts
   │   ├── resolveAudienceId(locale)  → RESEND_AUDIENCE_ID_ES_AR | RESEND_AUDIENCE_ID_EN_US
   │   └── new Resend(RESEND_API_KEY).contacts.create({ audienceId, email, unsubscribed: false })
   ├── ok                  → { success: true }  200  (banner shows Contentful successMessage)
   ├── already-subscribed  → { messageKey: "SubscribeBanner.error-already-subscribed" } 409
   └── other failures      → { messageKey: "SubscribeBanner.error-unexpected" } 400/500
```

- There is no database row for subscribers — they live only in the managed Resend Audiences.
- The route is **locale-aware**: `SubscribeBanner.tsx` calls `useLocale()` and
  passes the result to `subscribe(email, locale)`, which POSTs `{ email, locale }`. The route Zod-validates
  the pair and routes the contact to the matching Resend audience via `addSubscriber`.
- On failure the route returns a stable `messageKey` (one of `SubscribeBannerKey` from
  `src/components/shared/subscribe-banner/subscribeBannerMessageKeys.ts`). `src/service/subscribe.ts`
  validates the key on receipt and falls back to `error-unexpected` for any keyless or network failure.
  The clients resolve the key via `useTranslations()` against the `SubscribeBanner` namespace in
  `public/locales/{es-AR,en-US}.json` — see ICR-47.
- Required env: `RESEND_API_KEY` + at least one of `RESEND_AUDIENCE_ID_ES_AR` /
  `RESEND_AUDIENCE_ID_EN_US`. When the audience var for a locale is unset, `addSubscriber` returns
  `{ ok: false, reason: "not-configured" }` and the route responds 500 — safe to leave unset on
  Preview/Staging (no real subscribers are touched).
- As with the contact form, only an `email` is required — keep it that way. The newsletter should not
  become a covert PII collector.

## Email adapter (transactional)

Transactional email (currently just the contact-form notification) goes through a small adapter so the provider can be swapped by config.

```
src/service/mailing.service.ts          sendEmail(content) + FROM_EMAIL default
   │  reads process.env.MAIL_PROVIDER
   ├── "sendgrid" → src/service/mailing/sendgrid.adapter.ts  (@sendgrid/mail)
   └── "resend"   → src/service/mailing/resend.adapter.ts    (resend)
```

- **`mailing.service.ts`** lazily constructs and caches the adapter on first `sendEmail`. If `MAIL_PROVIDER` is unset, or set to anything other than `sendgrid` / `resend`, it throws — fail loud rather than silently dropping mail.
- The `from` address defaults to `process.env.FROM_EMAIL` (falling back to the hard-coded `no-reply@notifications.idcredentor.org` constant). Set `FROM_EMAIL` to a domain you've authenticated with the chosen provider (SPF/DKIM) or delivery will suffer.
- Each adapter (`createSendGridAdapter` / `createResendAdapter`) throws on construction if its API key (`SENDGRID_API_KEY` / `RESEND_API_KEY`) is missing, and returns `false` from `sendEmail` on send failure (logged, never thrown back to the action).
- The shared contract is `EmailContent { to, from?, subject, text, html }` and `EmailAdapter { sendEmail(content): Promise<boolean> }` (`src/service/mailing/types.ts`). To add a provider, write one more adapter implementing `EmailAdapter` and add a `case` in `getEmailAdapter`.

## Template engine

`src/templates/` holds simple HTML templates and a tiny renderer:

- `template-engine.ts#renderTemplate(name, variables)` looks the template up in the `TEMPLATES` map (`src/templates/index.ts`), injects `currentYear` and `baseUrl` defaults, and replaces `{{key}}` placeholders by global string replace.
- `contact-form.template.ts` is the contact-notification HTML.
- This is deliberately dependency-free string substitution. It does **not** escape values — see the escaping caution above.

## Required environment variables

> All of these are **required at runtime but several are missing from `.env.example`** — flag and set them. Never put real values in docs or commits; reference names only.

| Variable                                                               | Used by                                      | In `.env.example`? |
| ---------------------------------------------------------------------- | -------------------------------------------- | :----------------: |
| `MAIL_PROVIDER` (`sendgrid`\|`resend`)                                 | `mailing.service.ts`                         |     ❌ missing     |
| `CONTACT_FORM_RECIPIENT_EMAIL`                                         | `contact-form-email.service.ts`              |     ❌ missing     |
| `FROM_EMAIL`                                                           | `mailing.service.ts`                         |     ❌ missing     |
| `SENDGRID_API_KEY`                                                     | `sendgrid.adapter.ts` (if provider=sendgrid) |     ❌ missing     |
| `RESEND_API_KEY`                                                       | `resend.adapter.ts` (if provider=resend)     |     ❌ missing     |
| `MONGODB_URI`                                                          | `contact.service.ts`                         |     ❌ missing     |
| `MAILCHIMP_API_KEY` / `MAILCHIMP_API_SERVER` / `MAILCHIMP_AUDIENCE_ID` | `/api/subscribe`                             |     ✅ present     |

## Broadcast engine (ICR-29)

`sendBroadcast(input)` is the single, reusable way to email all newsletter subscribers from server
code (e.g. an authenticated webhook). It lives at
`apps/web/src/service/broadcast.service.ts` and is consumed by ICR-44 (blog-post notifications).

### Invocation

```ts
import { sendBroadcast } from "@src/service/broadcast.service";

const result = await sendBroadcast({
  broadcastId: "blog:mi-articulo:es-AR", // stable, caller-supplied idempotency key
  subject: "Nuevo artículo en el blog",
  html: "<p>Cuerpo del mensaje</p>", // inner body; the service wraps it in the template
  text: "Cuerpo del mensaje", // plain-text alternative
  locale: "es-AR", // "es-AR" | "en-US"
});
// result: { status: "sent"|"skipped"|"failed", campaignId?, reason? }
```

`sendBroadcast` **never throws**. All operational and validation failures are caught and returned
as a typed `BroadcastResult`, so callers cannot be broken by a send failure.

### Transport: Resend Broadcasts

Under the hood the engine calls the **Resend Broadcasts** API (`resend.broadcasts.create → send`
— both return `{ data, error }` and do NOT throw) against `RESEND_AUDIENCE_ID`. The subscriber
list is a managed **Resend Audience**, so **subscriber emails and PII never touch our server**.
Resend handles the unsubscribe link (injected via the `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder
Resend substitutes per-recipient), one-click `List-Unsubscribe` header, and suppression. Delivery
and bounce tracking are delegated to ICR-28.

- `from` = `"Iglesia de Cristo Redentor <FROM_EMAIL>"` (reuses the verified notifications address)
- `replyTo` = `"info@idcredentor.org"` (constant `BROADCAST_REPLY_TO` in `resendBroadcast.ts`)
- Required env: `RESEND_API_KEY` + `RESEND_AUDIENCE_ID_ES_AR` / `RESEND_AUDIENCE_ID_EN_US` (per
  locale; the legacy `RESEND_AUDIENCE_ID` is a fallback for es-AR — see ICR-44). If the API key or
  the resolved audience id for a locale is missing, the function returns
  `{ status: "failed", reason: "resend-not-configured" }` without claiming or sending.
- The one manual CAN-SPAM piece is `BROADCAST_POSTAL_ADDRESS` (set in Vercel to the church's real
  postal address; required by law — city + country alone is insufficient). If unset, the engine
  **fails closed**: it returns `{ status: "failed", reason: "postal-address-missing" }` before
  claiming or sending — no broadcast proceeds without a valid address.

### Idempotency (dedupe)

Before sending, the engine atomically claims `broadcastId` in the **`broadcast_log`** MongoDB
collection (`website` DB) via an insert-first upsert + unique index:

- First call with a new `broadcastId` → claim succeeds → send → mark `sent` → `{ status: "sent" }`.
- Re-call with the same `broadcastId` that was already sent → duplicate-key error → skip without
  sending → `{ status: "skipped", reason: "already-sent" }`.
- Re-call after a previous failure → log is `failed` (not `sent`) → claim re-succeeds → retried.
- If MongoDB is unreachable → **fail safe**: `{ status: "failed", reason: "dedupe-unavailable" }` —
  **no send** (never risk a double mass-send when we can't verify uniqueness).

See [`likes-and-mongodb.md`](./likes-and-mongodb.md) for the `broadcast_log` collection schema.

### Template

`input.html` is the **inner body**. The engine wraps it in the locale-aware `broadcast` template
(`apps/web/src/templates/broadcast.template.ts`): branded chrome, `<html lang="…">`, responsive
layout, and a footer containing the copyright line, `BROADCAST_POSTAL_ADDRESS` (CAN-SPAM), and
the Resend-managed unsubscribe link (`{{{RESEND_UNSUBSCRIBE_URL}}}` — passed through untouched by
`renderTemplate`; Resend substitutes the per-recipient URL at delivery time). Both `es-AR` and
`en-US` produce correct chrome copy and locale-appropriate unsubscribe label. `input.text` is sent
as Resend `text` unchanged.

### Human prerequisites before a live send

These are Vercel/Resend setup steps — the engine and its tests work without them (transport mocked):

1. **Verify the sending domain** in Resend (DKIM/SPF for `notifications.idcredentor.org` or the
   primary domain) — free tier allows 1 domain.
2. **Create two Resend Audiences** (ICR-44): one for `es-AR` (e.g. `IDC Redentor — Español`) and one
   for `en-US` (e.g. `IDC Redentor — English`). Copy each audience id and set
   `RESEND_AUDIENCE_ID_ES_AR` + `RESEND_AUDIENCE_ID_EN_US` in Vercel (production only; see the safety
   note in the [ICR-44 env matrix](#environment-configuration)). The legacy `RESEND_AUDIENCE_ID` can
   remain as an es-AR fallback or be removed once the per-locale vars are set.
3. **Set `BROADCAST_POSTAL_ADDRESS`** to the church's real CAN-SPAM postal address.

### PII / secret discipline

The engine logs only `broadcastId`, `locale`, `campaignId`, `status`, and `error.message` —
**never API keys, never subscriber data** (the broadcast transport means subscriber emails are
never in process memory; they live only in the managed Resend Audience). The `reason` values
returned by `sendBroadcast` are non-secret tokens (`already-sent`, `invalid-input`,
`dedupe-unavailable`, `resend-not-configured`, `postal-address-missing`, `send-failed`).

## Publish → subscriber broadcast (ICR-44)

When a Contentful editor publishes a **blog post** or a **sermon**, the site automatically emails
newsletter subscribers an announcement in their own locale — exactly once per post+locale — reusing
the ICR-29 broadcast engine. This section covers the webhook extension, content routing, and
audience resolution that wire it together.

### Webhook extension (`/api/revalidate`)

`POST /api/revalidate` now performs two steps after authentication:

1. **Revalidate first, unconditionally.** `revalidateTag("site-content", "max")` runs immediately
   after auth, before any body parsing. Notification is an isolated side-effect and can never
   prevent revalidation.
2. **Notify as a side-effect.** Inside a `try/catch` (errors logged with `error.message` only —
   no PII, no secrets — never rethrown), the handler parses the Contentful publish payload
   defensively (body may be absent, empty, or non-JSON) and, when it finds
   `body.sys.contentType.sys.id` + `body.sys.id`, calls
   `notifyOnPublish({ contentTypeId, entryId })`. The response stays `{ revalidated: true, now }`
   in all cases; an optional `notified` field carries the per-locale summary.

The Contentful webhook must send the **default entry payload** (which includes `sys.contentType.sys.id`

- `sys.id` natively). A customized minimal payload without those fields causes notify to skip silently —
  revalidation is unaffected.

### Content-type routing (`post-notification.service.ts`)

`notifyOnPublish` routes by `contentTypeId`:

| `sys.contentType.sys.id` | Content getter                         | URL segment | `broadcastId` prefix |
| ------------------------ | -------------------------------------- | ----------- | -------------------- |
| `blogPostPage`           | `getBlogPostPageById(entryId, locale)` | `blog`      | `blog`               |
| `sermon`                 | `getSermonById(entryId, locale)`       | `predicas`  | `sermon`             |
| any other type           | —                                      | —           | no-op; no email sent |

For each matched type the orchestrator iterates `BROADCAST_LOCALES = ["es-AR","en-US"]` and, per
locale: skips if the audience is not configured → fetches content (skips if entry has no title in
that locale) → builds the post-notification email → calls `sendBroadcast` with
`broadcastId = "${kind}:${slug}:${locale}"` (e.g. `blog:mi-articulo:es-AR`). All per-locale steps
are individually error-isolated: a getter exception in one locale does not abort the other.

### Per-locale audience resolution (`resendAudience.ts`)

`resolveAudienceId(locale: BroadcastLocale): string | undefined` reads env vars in priority order:

1. `RESEND_AUDIENCE_ID_ES_AR` / `RESEND_AUDIENCE_ID_EN_US` — the preferred per-locale vars (ICR-44).
2. Legacy `RESEND_AUDIENCE_ID` — checked **only for the default locale (`es-AR`)** as a
   backwards-compat fallback. This keeps single-audience (pre-ICR-44) deploys working for
   Spanish-only sends without altering behaviour for English.
3. Returns `undefined` for any locale when its var is unset — treated as `not-configured` by
   both `notifyOnPublish` and `addSubscriber`, which skip that locale/send without an error.

`isResendBroadcastConfigured(locale)` = `Boolean(RESEND_API_KEY && resolveAudienceId(locale))`.
Both the notification orchestrator and the subscribe service check this before any Resend call.

### Idempotency (dedupe)

`broadcastId = "${kind}:${slug}:${locale}"` is the stable, globally-unique key per content+locale.
The ICR-29 `broadcast_log` MongoDB collection enforces a unique index on it:

- **Re-publishing** the same entry → same `broadcastId` → `claimBroadcast` detects already-sent →
  skip; no second email.
- **Concurrent webhook deliveries** for the same publish → one claim wins; the duplicate sees the
  in-flight claim and skips. At most one email per post+locale, ever.

See [Broadcast engine (ICR-29)](#broadcast-engine-icr-29) for the full dedupe mechanics.

### Environment configuration

| Variable                      | Production                       | Preview / Staging                                        |
| ----------------------------- | -------------------------------- | -------------------------------------------------------- |
| `RESEND_AUDIENCE_ID_ES_AR`    | real es-AR audience id           | **test audience** (your own addresses only) or **unset** |
| `RESEND_AUDIENCE_ID_EN_US`    | real en-US audience id           | **test audience** (your own addresses only) or **unset** |
| `RESEND_API_KEY`              | ✅ required                      | ✅ required                                              |
| `BROADCAST_POSTAL_ADDRESS`    | ✅ required                      | ✅ required                                              |
| `RESEND_AUDIENCE_ID` (legacy) | es-AR fallback if `_ES_AR` unset | same                                                     |

**Safety rule:** on Preview/Staging, never point audience vars at the real congregation audiences.
Use a private test audience (only your own address) or leave them unset — when unset, both
`notifyOnPublish` and `addSubscriber` silently no-op with `reason: "not-configured"`, no error
thrown, no email sent to real subscribers.

## Spam & PII discipline

- **Collect the minimum.** Contact: name/email/subject/message. Newsletter: email. Don't add fields casually.
- **Don't expand storage.** Contact messages live in Mongo `contact`; subscriber emails live only in
  the managed Resend Audiences (never in our server memory or DB). There is no public read endpoint
  for either — keep it that way.
- **Escape user input** before rendering it anywhere richer than an internal plaintext/notification context.
- **Consider abuse hardening** if spam appears: the subscribe and contact endpoints have no rate limiting or CAPTCHA today. A honeypot field, a simple rate limit (per-IP, edge), or a CAPTCHA are the natural next steps — these endpoints (`src/app/api/**`, `src/service/**`, `src/templates/**`) are flagged sensitive in the harness for exactly this reason.
- **Never log full submissions** at info level in production; the current services log only error messages, not payloads — preserve that.
