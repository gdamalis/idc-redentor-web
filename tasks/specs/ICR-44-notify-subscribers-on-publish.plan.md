# ICR-44 — Notify subscribers on publish (locale-aware) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development + superpowers:executing-plans per task. Steps use checkbox (`- [ ]`) syntax. Each Task = one `/work` checkpoint = one commit.

**Goal:** On Contentful publish of a blog post or sermon, email newsletter subscribers an announcement in their own locale (exactly once per post+locale) via the ICR-29 Resend broadcast engine; and repoint newsletter signup to per-locale Resend audiences.

**Architecture:** Extend `/api/revalidate` (revalidate first, then an isolated `notifyOnPublish` side-effect). Two Resend audiences (es-AR/en-US) resolved by `resolveAudienceId(locale)`. Reuse the ICR-29 engine + `broadcast_log` dedupe verbatim. Switch `/api/subscribe` from Mailchimp to Resend contacts, routed by page locale.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript strict, Zod, `resend@6.5.2`, next-intl, Vitest, Tailwind. Monorepo: site under `apps/web/`.

## Global Constraints (apply to EVERY task)

- **Functional-first — NO classes** for our own control flow. Model outcomes as discriminated-union return values, never thrown custom `Error` subclasses. (Instantiating `new Resend()` is the one allowed third-party exception.)
- Prefer `interface` for object shapes; `??` over `||`; named exports; `satisfies` where it helps.
- **Never throw across the publish→broadcast boundary.** `sendBroadcast`, `addSubscriber`, `notifyOnPublish` all return typed results and never throw to their caller. The webhook must still revalidate even if notification fails.
- **No PII/secrets in logs.** Log `broadcastId`, `contentTypeId`, `locale`, `reason`, `error.message` — never subscriber emails or API keys.
- Locales: `BROADCAST_LOCALES = ["es-AR","en-US"]`, default `es-AR`. URLs: `${NEXT_PUBLIC_BASE_URL}/${locale}/${segment}/${slug}` (segment `blog` | `predicas`).
- Commits: Conventional Commits, header ≤ 100 chars, prefix per task. Run from worktree; commit with the exact message given. Do **not** use `--no-verify`.
- Verify commands (from worktree root): `pnpm type-check`, `pnpm lint`, `pnpm test` (vitest run), `pnpm build`. `type-check` is hyphenated.
- If `pnpm build` fails with `NEXT_PUBLIC_BASE_URL`/`ERR_INVALID_URL` during blog page-data collection, that's the missing-`.env.local` environmental issue — it's already copied into this worktree; if absent, `cp <main-repo>/.env.local apps/web/.env.local`. Not a code defect.

---

### Task 1 — Locale-aware broadcast engine

**Files:**

- Create: `apps/web/src/service/resendAudience.ts`
- Test: `apps/web/src/service/resendAudience.test.ts`
- Modify: `apps/web/src/service/broadcast/types.ts` (add `DEFAULT_BROADCAST_LOCALE`)
- Modify: `apps/web/src/service/broadcast/resendBroadcast.ts` (`isResendBroadcastConfigured(locale)`, `BroadcastParams.audienceId`)
- Modify: `apps/web/src/service/broadcast.service.ts` (resolve+pass audienceId)
- Modify: `apps/web/src/types/environment.d.ts` (2 new vars)
- Modify (adapt existing tests): `apps/web/src/service/broadcast/resendBroadcast.test.ts`, `apps/web/src/service/broadcast.service.test.ts`

**Interfaces:**

- Produces: `resolveAudienceId(locale: BroadcastLocale): string | undefined`; `DEFAULT_BROADCAST_LOCALE: BroadcastLocale`; `isResendBroadcastConfigured(locale: BroadcastLocale): boolean`; `BroadcastParams` now includes `audienceId: string`.
- Consumes: `BroadcastLocale`, `BROADCAST_LOCALES` (existing, `broadcast/types.ts`).

- [ ] **Step 1: Add `DEFAULT_BROADCAST_LOCALE` to `broadcast/types.ts`** (after `BROADCAST_LOCALES`):

```ts
export const DEFAULT_BROADCAST_LOCALE: BroadcastLocale = "es-AR";
```

- [ ] **Step 2: Write failing test `resendAudience.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAudienceId } from "./resendAudience";

afterEach(() => vi.unstubAllEnvs());

describe("resolveAudienceId", () => {
  it("returns the per-locale audience for es-AR", () => {
    vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "aud_es");
    vi.stubEnv("RESEND_AUDIENCE_ID_EN_US", "aud_en");
    expect(resolveAudienceId("es-AR")).toBe("aud_es");
    expect(resolveAudienceId("en-US")).toBe("aud_en");
  });
  it("falls back to legacy RESEND_AUDIENCE_ID for the default locale only", () => {
    vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "");
    vi.stubEnv("RESEND_AUDIENCE_ID_EN_US", "");
    vi.stubEnv("RESEND_AUDIENCE_ID", "legacy");
    expect(resolveAudienceId("es-AR")).toBe("legacy");
    expect(resolveAudienceId("en-US")).toBeUndefined();
  });
  it("returns undefined when nothing is configured", () => {
    vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "");
    vi.stubEnv("RESEND_AUDIENCE_ID", "");
    expect(resolveAudienceId("es-AR")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run → FAIL** `pnpm -C apps/web exec vitest run src/service/resendAudience.test.ts` (module not found).

- [ ] **Step 4: Implement `resendAudience.ts`**

```ts
import {
  DEFAULT_BROADCAST_LOCALE,
  type BroadcastLocale,
} from "@src/service/broadcast/types";

const ENV_BY_LOCALE: Record<BroadcastLocale, string> = {
  "es-AR": "RESEND_AUDIENCE_ID_ES_AR",
  "en-US": "RESEND_AUDIENCE_ID_EN_US",
};

/**
 * Resolve the Resend audience id for a locale. Falls back to the legacy
 * single-audience `RESEND_AUDIENCE_ID` for the DEFAULT locale only, so a
 * legacy deploy behaves as "es-AR only" and never double-emails a subscriber.
 */
export function resolveAudienceId(locale: BroadcastLocale): string | undefined {
  const perLocale = process.env[ENV_BY_LOCALE[locale]]?.trim();
  if (perLocale) return perLocale;
  if (locale === DEFAULT_BROADCAST_LOCALE) {
    return process.env.RESEND_AUDIENCE_ID?.trim() || undefined;
  }
  return undefined;
}
```

- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: Modify `resendBroadcast.ts`.** Replace `isResendBroadcastConfigured` and the audience read:

```ts
import { resolveAudienceId } from "@src/service/resendAudience";
import type { BroadcastLocale } from "./types";

export interface BroadcastParams {
  subject: string;
  name: string;
  html: string;
  text: string;
  audienceId: string; // NEW — resolved by the caller from the locale
}

export function isResendBroadcastConfigured(locale: BroadcastLocale): boolean {
  return Boolean(process.env.RESEND_API_KEY && resolveAudienceId(locale));
}
```

In `createAndSendBroadcast`, remove `const audienceId = process.env.RESEND_AUDIENCE_ID;` and use `params.audienceId`:

```ts
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey || !params.audienceId) {
  return { ok: false, reason: "resend-not-configured" };
}
// ...
const { data: created, error: createError } = await resend.broadcasts.create({
  audienceId: params.audienceId,
  from,
  replyTo: BROADCAST_REPLY_TO,
  subject: params.subject,
  html: params.html,
  text: params.text,
  name: params.name,
});
```

- [ ] **Step 7: Modify `broadcast.service.ts`.** Resolve audience from locale; gate per-locale; pass `audienceId`:

```ts
import { resolveAudienceId } from "./resendAudience";
// ...
if (!isResendBroadcastConfigured(locale)) {
  console.error(`[broadcast] resend-not-configured for ${broadcastId}`);
  return { status: "failed", reason: "resend-not-configured" };
}
const audienceId = resolveAudienceId(locale);
if (!audienceId) {
  return { status: "failed", reason: "resend-not-configured" };
}
// ... inside try, when calling createAndSendBroadcast:
const dispatch = await createAndSendBroadcast({
  subject,
  name: `broadcast ${broadcastId}`,
  html: wrappedHtml,
  text,
  audienceId,
});
```

- [ ] **Step 8: Modify `environment.d.ts`** — under `// Resend Broadcasts`:

```ts
RESEND_AUDIENCE_ID: string;
RESEND_AUDIENCE_ID_ES_AR: string;
RESEND_AUDIENCE_ID_EN_US: string;
BROADCAST_POSTAL_ADDRESS: string;
```

- [ ] **Step 9: Adapt existing engine tests.** Read `resendBroadcast.test.ts` + `broadcast.service.test.ts`; update calls: `isResendBroadcastConfigured(...)` now takes a locale; `createAndSendBroadcast` params now require `audienceId`; set `RESEND_AUDIENCE_ID_ES_AR`/`_EN_US` (or legacy `RESEND_AUDIENCE_ID` for es-AR) in env stubs where they previously set `RESEND_AUDIENCE_ID`. Keep all existing assertions green.

- [ ] **Step 10: Verify** `pnpm type-check && pnpm lint && pnpm test` → all PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/service/resendAudience.ts apps/web/src/service/resendAudience.test.ts apps/web/src/service/broadcast apps/web/src/service/broadcast.service.ts apps/web/src/types/environment.d.ts
git commit -m "feat(ICR-44): make broadcast engine resolve a Resend audience per locale"
```

---

### Task 2 — Subscribe → Resend (locale-aware)

**Files:**

- Create: `apps/web/src/service/subscribe.service.ts`
- Test: `apps/web/src/service/subscribe.service.test.ts`
- Test: `apps/web/src/app/api/subscribe/route.test.ts`
- Modify: `apps/web/src/app/api/subscribe/route.ts` (Zod + addSubscriber; drop Mailchimp)
- Modify: `apps/web/src/service/subscribe.ts` (client `subscribe(email, locale)`)
- Modify: `apps/web/src/components/shared/subscribe-form/SubscribeForm.tsx`
- Modify: `apps/web/src/components/shared/subscribe-banner/SubscribeBanner.tsx`

**Interfaces:**

- Consumes: `resolveAudienceId` (Task 1), `BROADCAST_LOCALES`, `DEFAULT_BROADCAST_LOCALE`.
- Produces: `addSubscriber(email: string, locale: BroadcastLocale): Promise<SubscribeOutcome>`; client `subscribe(email: string, locale: string): Promise<SubscribeResult>`.

- [ ] **Step 1: Failing test `subscribe.service.test.ts`** — mock the `resend` module:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ contacts: { create: createMock } })),
}));
import { addSubscriber } from "./subscribe.service";

afterEach(() => {
  vi.unstubAllEnvs();
  createMock.mockReset();
});

function configure() {
  vi.stubEnv("RESEND_API_KEY", "key");
  vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "aud_es");
}

describe("addSubscriber", () => {
  it("adds the contact to the locale audience and returns ok", async () => {
    configure();
    createMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const out = await addSubscriber("a@b.com", "es-AR");
    expect(out).toEqual({ ok: true });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "aud_es",
        email: "a@b.com",
        unsubscribed: false,
      }),
    );
  });
  it("maps a duplicate error to already-subscribed", async () => {
    configure();
    createMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Contact already exists" },
    });
    expect(await addSubscriber("a@b.com", "es-AR")).toEqual({
      ok: false,
      reason: "already-subscribed",
    });
  });
  it("returns not-configured when the audience is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    expect(await addSubscriber("a@b.com", "en-US")).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });
  it("rejects an invalid email before any Resend call", async () => {
    configure();
    expect(await addSubscriber("nope", "es-AR")).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(createMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `subscribe.service.ts`**

```ts
import { Resend } from "resend";
import { resolveAudienceId } from "./resendAudience";
import type { BroadcastLocale } from "./broadcast/types";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDuplicate(error: { name?: string; message?: string }): boolean {
  const haystack = `${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();
  return haystack.includes("already") || haystack.includes("exists");
}

export async function addSubscriber(
  email: string,
  locale: BroadcastLocale,
): Promise<SubscribeOutcome> {
  const trimmed = email?.trim();
  if (!trimmed || !EMAIL_RE.test(trimmed))
    return { ok: false, reason: "invalid-input" };

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = resolveAudienceId(locale);
  if (!apiKey || !audienceId) return { ok: false, reason: "not-configured" };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.contacts.create({
      audienceId,
      email: trimmed,
      unsubscribed: false,
    });
    if (error) {
      if (isDuplicate(error))
        return { ok: false, reason: "already-subscribed" };
      console.error(`[subscribe] resend error: ${error.message ?? "unknown"}`);
      return { ok: false, reason: "failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error(
      "[subscribe] unexpected:",
      e instanceof Error ? e.message : String(e),
    );
    return { ok: false, reason: "failed" };
  }
}
```

> NOTE (ICR-29 lesson): confirm the installed SDK's duplicate behaviour. If `contacts.create` upserts silently (no error on duplicate), re-subscribe returns `{ok:true}` — acceptable UX; the `already-subscribed` branch then only fires on a real error message. Keep the substring check defensive.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Failing test `route.test.ts`** — mock the service:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
const addSubscriber = vi.fn();
vi.mock("@src/service/subscribe.service", () => ({ addSubscriber }));
import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://x/api/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => addSubscriber.mockReset());

describe("POST /api/subscribe", () => {
  it("200 on success and forwards locale", async () => {
    addSubscriber.mockResolvedValue({ ok: true });
    const res = await POST(req({ email: "a@b.com", locale: "en-US" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(addSubscriber).toHaveBeenCalledWith("a@b.com", "en-US");
  });
  it("defaults locale to es-AR when omitted", async () => {
    addSubscriber.mockResolvedValue({ ok: true });
    await POST(req({ email: "a@b.com" }));
    expect(addSubscriber).toHaveBeenCalledWith("a@b.com", "es-AR");
  });
  it("409 already-subscribed", async () => {
    addSubscriber.mockResolvedValue({
      ok: false,
      reason: "already-subscribed",
    });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      messageKey: "SubscribeBanner.error-already-subscribed",
    });
  });
  it("400 on invalid email (zod) without calling the service", async () => {
    const res = await POST(req({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(addSubscriber).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run → FAIL.**

- [ ] **Step 7: Rewrite `api/subscribe/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { addSubscriber } from "@src/service/subscribe.service";
import {
  BROADCAST_LOCALES,
  DEFAULT_BROADCAST_LOCALE,
} from "@src/service/broadcast/types";

const bodySchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(BROADCAST_LOCALES).optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { messageKey: "SubscribeBanner.error-unexpected" },
      { status: 400 },
    );
  }
  const locale = parsed.data.locale ?? DEFAULT_BROADCAST_LOCALE;
  const outcome = await addSubscriber(parsed.data.email, locale);
  if (outcome.ok) return NextResponse.json({ success: true }, { status: 200 });
  if (outcome.reason === "already-subscribed") {
    return NextResponse.json(
      { messageKey: "SubscribeBanner.error-already-subscribed" },
      { status: 409 },
    );
  }
  if (outcome.reason === "invalid-input") {
    return NextResponse.json(
      { messageKey: "SubscribeBanner.error-unexpected" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { messageKey: "SubscribeBanner.error-unexpected" },
    { status: 500 },
  );
}
```

- [ ] **Step 8: Run route test → PASS.**

- [ ] **Step 9: Update client `subscribe.ts`** — signature + body:

```ts
export async function subscribe(email: string, locale: string): Promise<SubscribeResult> {
  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email, locale }),
    });
    // ...unchanged messageKey handling
```

- [ ] **Step 10: Update `SubscribeForm.tsx` + `SubscribeBanner.tsx`** — both are `"use client"`:

```ts
import { useLocale, useTranslations } from "next-intl";
// inside the component:
const locale = useLocale();
// in the action callback:
const data = await subscribe(email, locale);
```

- [ ] **Step 11: Verify** `pnpm type-check && pnpm lint && pnpm test && pnpm build` → PASS. (Build because client components changed.)

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/service/subscribe.service.ts apps/web/src/service/subscribe.service.test.ts apps/web/src/app/api/subscribe apps/web/src/service/subscribe.ts apps/web/src/components/shared/subscribe-form apps/web/src/components/shared/subscribe-banner
git commit -m "feat(ICR-44): route newsletter signup to a locale-specific Resend audience"
```

---

### Task 3 — Email template, copy & by-id content getters

**Files:**

- Create: `apps/web/src/templates/post-notification.template.ts`
- Create: `apps/web/src/service/post-notification.email.ts`
- Test: `apps/web/src/service/post-notification.email.test.ts`
- Modify: `apps/web/src/templates/index.ts` (register `post-notification`)
- Modify: `apps/web/lib/contentful/getBlogPostPages.ts` (add `getBlogPostPageById`)
- Modify: `apps/web/lib/contentful/getSermons.ts` (add `getSermonById`)

**Interfaces:**

- Produces: `POST_NOTIFICATION_TEMPLATE`, `POST_NOTIFICATION_COPY`; `buildPostNotificationEmail({ kind, content, locale }): { subject; html; text }`; `PostNotificationContent`; `getBlogPostPageById(id, locale, isDraftMode?)`, `getSermonById(id, locale, isDraftMode?)`.
- Consumes: `renderTemplate` (`@src/templates/template-engine`), `BroadcastLocale`.

- [ ] **Step 1: Create `post-notification.template.ts`**

```ts
import type { BroadcastLocale } from "@src/service/broadcast/types";

/** Inner body only — wrapped by the "broadcast" chrome in sendBroadcast. */
export const POST_NOTIFICATION_TEMPLATE = `
<h1 style="margin:0 0 12px;font-size:22px;color:#111;">{{title}}</h1>
{{imageBlock}}
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#444;">{{excerpt}}</p>
<p style="margin:0;">
  <a href="{{ctaUrl}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">{{ctaLabel}}</a>
</p>
`;

interface NotificationCopy {
  subjectPrefix: string;
  ctaLabel: string;
}
export const POST_NOTIFICATION_COPY: Record<
  BroadcastLocale,
  { blog: NotificationCopy; sermon: NotificationCopy }
> = {
  "es-AR": {
    blog: { subjectPrefix: "Nueva publicación", ctaLabel: "Leer más" },
    sermon: { subjectPrefix: "Nueva prédica", ctaLabel: "Ver la prédica" },
  },
  "en-US": {
    blog: { subjectPrefix: "New post", ctaLabel: "Read more" },
    sermon: { subjectPrefix: "New sermon", ctaLabel: "Watch the sermon" },
  },
};
```

- [ ] **Step 2: Register in `templates/index.ts`**

```ts
import { POST_NOTIFICATION_TEMPLATE } from "./post-notification.template";
export const TEMPLATES: Record<string, string> = {
  "contact-form": CONTACT_FORM_TEMPLATE,
  broadcast: BROADCAST_TEMPLATE,
  "post-notification": POST_NOTIFICATION_TEMPLATE,
};
```

- [ ] **Step 3: Failing test `post-notification.email.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPostNotificationEmail } from "./post-notification.email";

afterEach(() => vi.unstubAllEnvs());

describe("buildPostNotificationEmail", () => {
  it("builds an es-AR blog email with absolute URL and subject prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://www.idcredentor.org");
    const out = buildPostNotificationEmail({
      kind: "blog",
      content: {
        title: "Hola",
        slug: "hola",
        excerpt: "Resumen",
        imageUrl: "https://img/x.jpg",
      },
      locale: "es-AR",
    });
    expect(out.subject).toBe("Nueva publicación: Hola");
    expect(out.html).toContain("https://www.idcredentor.org/es-AR/blog/hola");
    expect(out.html).toContain("Leer más");
    expect(out.html).toContain("Resumen");
    expect(out.html).toContain("<img");
    expect(out.text).toContain("https://www.idcredentor.org/es-AR/blog/hola");
  });
  it("uses the sermon segment + copy and omits image block when no image", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://www.idcredentor.org");
    const out = buildPostNotificationEmail({
      kind: "sermon",
      content: { title: "Sermón", slug: "sermon", excerpt: "x" },
      locale: "en-US",
    });
    expect(out.subject).toBe("New sermon: Sermón");
    expect(out.html).toContain("/en-US/predicas/sermon");
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain("Watch the sermon");
  });
});
```

- [ ] **Step 4: Run → FAIL.**

- [ ] **Step 5: Implement `post-notification.email.ts`**

```ts
import { renderTemplate } from "@src/templates/template-engine";
import { POST_NOTIFICATION_COPY } from "@src/templates/post-notification.template";
import type { BroadcastLocale } from "@src/service/broadcast/types";

export interface PostNotificationContent {
  title: string;
  slug: string;
  excerpt: string;
  imageUrl?: string;
}

const SEGMENT: Record<"blog" | "sermon", string> = {
  blog: "blog",
  sermon: "predicas",
};

export function buildPostNotificationEmail(input: {
  kind: "blog" | "sermon";
  content: PostNotificationContent;
  locale: BroadcastLocale;
}): { subject: string; html: string; text: string } {
  const { kind, content, locale } = input;
  const copy = POST_NOTIFICATION_COPY[locale][kind];
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const ctaUrl = `${base}/${locale}/${SEGMENT[kind]}/${content.slug}`;
  const imageBlock = content.imageUrl
    ? `<img src="${content.imageUrl}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:0 0 16px;" />`
    : "";
  const subject = `${copy.subjectPrefix}: ${content.title}`;
  const html = renderTemplate("post-notification", {
    title: content.title,
    excerpt: content.excerpt,
    ctaUrl,
    ctaLabel: copy.ctaLabel,
    imageBlock,
  });
  const text = `${content.title}\n\n${content.excerpt}\n\n${copy.ctaLabel}: ${ctaUrl}`;
  return { subject, html, text };
}
```

- [ ] **Step 6: Run → PASS.**

- [ ] **Step 7: Add `getBlogPostPageById`.** Read `getBlogPostPage` (`getBlogPostPages.ts:154`) for the exact fragment + `fetchGraphQL` call + return mapping, then add a sibling that filters by id. Mirror the existing query but `where: { sys: { id: "${id}" } }`:

```ts
export async function getBlogPostPageById(
  id: string,
  locale: string,
  isDraftMode = false,
): Promise<BlogPost | undefined> {
  // same query body as getBlogPostPage but:  where: { sys: { id: "${id}" } }
  // return data?.data?.blogPostPageCollection?.items?.[0];
}
```

- [ ] **Step 8: Add `getSermonById`.** Mirror `getSermon` (`getSermons.ts:219`) with `where: { sys: { id: "${id}" } }`, returning the same mapped `Sermon | undefined`.

- [ ] **Step 9: Verify** `pnpm type-check && pnpm lint && pnpm test` → PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/templates apps/web/src/service/post-notification.email.ts apps/web/src/service/post-notification.email.test.ts apps/web/lib/contentful/getBlogPostPages.ts apps/web/lib/contentful/getSermons.ts
git commit -m "feat(ICR-44): add post-notification email template and by-id content getters"
```

---

### Task 4 — Notification orchestrator

**Files:**

- Create: `apps/web/src/service/post-notification.service.ts`
- Test: `apps/web/src/service/post-notification.service.test.ts`

**Interfaces:**

- Consumes: `getBlogPostPageById`, `getSermonById` (Task 3), `buildPostNotificationEmail` (Task 3), `sendBroadcast` (engine), `isResendBroadcastConfigured` (Task 1), `BROADCAST_LOCALES`.
- Produces: `notifyOnPublish(event: PublishEvent): Promise<PostNotificationSummary>`; `PublishEvent`, `PostNotificationSummary`.

> **Field-mapping note:** read `apps/web/src/types/BlogPost.ts` + `Sermon.ts` for exact field names. Best-known: blog `{ title, subtitle, seoDescription, slug, featuredImage:{ url } }`; sermon `{ title, excerpt, slug, featuredImage?:{ url } }`. Use the real names; the excerpt source is blog `subtitle ?? seoDescription ?? ""`, sermon `excerpt ?? ""`. Confirm `featuredImage.url` access shape.

- [ ] **Step 1: Failing test `post-notification.service.test.ts`** — mock getters, engine, config:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const getBlogPostPageById = vi.fn();
const getSermonById = vi.fn();
const sendBroadcast = vi.fn();
const isResendBroadcastConfigured = vi.fn();

vi.mock("@lib/contentful/getBlogPostPages", () => ({ getBlogPostPageById }));
vi.mock("@lib/contentful/getSermons", () => ({ getSermonById }));
vi.mock("@src/service/broadcast.service", () => ({ sendBroadcast }));
vi.mock("@src/service/broadcast/resendBroadcast", () => ({
  isResendBroadcastConfigured,
}));

import { notifyOnPublish } from "./post-notification.service";

afterEach(() => vi.clearAllMocks());

describe("notifyOnPublish", () => {
  it("ignores unsupported content types (no send)", async () => {
    const out = await notifyOnPublish({ contentTypeId: "page", entryId: "e1" });
    expect(out.handled).toBe(false);
    expect(sendBroadcast).not.toHaveBeenCalled();
  });

  it("sends one broadcast per configured locale with content, using kind:slug:locale", async () => {
    isResendBroadcastConfigured.mockReturnValue(true);
    getBlogPostPageById.mockImplementation(async (_id, locale) => ({
      title: locale === "es-AR" ? "Hola" : "Hello",
      slug: "hola",
      subtitle: "s",
    }));
    sendBroadcast.mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({
      contentTypeId: "blogPostPage",
      entryId: "e1",
    });
    expect(sendBroadcast).toHaveBeenCalledTimes(2);
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: "blog:hola:es-AR",
        locale: "es-AR",
      }),
    );
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: "blog:hola:en-US",
        locale: "en-US",
      }),
    );
    expect(out.handled).toBe(true);
  });

  it("skips a locale with no content", async () => {
    isResendBroadcastConfigured.mockReturnValue(true);
    getBlogPostPageById.mockImplementation(async (_id, locale) =>
      locale === "es-AR"
        ? { title: "Hola", slug: "hola", subtitle: "s" }
        : undefined,
    );
    sendBroadcast.mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({
      contentTypeId: "blogPostPage",
      entryId: "e1",
    });
    expect(sendBroadcast).toHaveBeenCalledTimes(1);
    expect(out.perLocale.find((p) => p.locale === "en-US")?.status).toBe(
      "no-content",
    );
  });

  it("skips a locale whose audience is not configured", async () => {
    isResendBroadcastConfigured.mockImplementation(
      (l: string) => l === "es-AR",
    );
    getBlogPostPageById.mockResolvedValue({
      title: "Hola",
      slug: "hola",
      subtitle: "s",
    });
    sendBroadcast.mockResolvedValue({ status: "sent" });
    await notifyOnPublish({ contentTypeId: "blogPostPage", entryId: "e1" });
    expect(sendBroadcast).toHaveBeenCalledTimes(1);
  });

  it("isolates a getter failure to that locale (never throws)", async () => {
    isResendBroadcastConfigured.mockReturnValue(true);
    getBlogPostPageById
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ title: "Hello", slug: "hola", subtitle: "s" });
    sendBroadcast.mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({
      contentTypeId: "blogPostPage",
      entryId: "e1",
    });
    expect(out.perLocale.some((p) => p.status === "failed")).toBe(true);
  });

  it("uses the sermon getter + sermon:slug:locale id", async () => {
    isResendBroadcastConfigured.mockReturnValue(true);
    getSermonById.mockResolvedValue({ title: "S", slug: "s", excerpt: "e" });
    sendBroadcast.mockResolvedValue({ status: "sent" });
    await notifyOnPublish({ contentTypeId: "sermon", entryId: "e1" });
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: "sermon:s:es-AR" }),
    );
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `post-notification.service.ts`**

```ts
import {
  BROADCAST_LOCALES,
  type BroadcastLocale,
} from "@src/service/broadcast/types";
import { isResendBroadcastConfigured } from "@src/service/broadcast/resendBroadcast";
import { sendBroadcast } from "@src/service/broadcast.service";
import {
  buildPostNotificationEmail,
  type PostNotificationContent,
} from "@src/service/post-notification.email";
import { getBlogPostPageById } from "@lib/contentful/getBlogPostPages";
import { getSermonById } from "@lib/contentful/getSermons";

export interface PublishEvent {
  contentTypeId: string;
  entryId: string;
}
type LocaleStatus =
  | "sent"
  | "skipped"
  | "failed"
  | "no-content"
  | "not-configured";
export interface PostNotificationSummary {
  contentTypeId: string;
  handled: boolean;
  perLocale: Array<{
    locale: BroadcastLocale;
    status: LocaleStatus;
    reason?: string;
  }>;
}

interface ContentHandler {
  kind: "blog" | "sermon";
  getById: (id: string, locale: string) => Promise<unknown>;
  toContent: (post: unknown) => PostNotificationContent | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blogContent = (p: any): PostNotificationContent | null =>
  p?.title
    ? {
        title: p.title,
        slug: p.slug,
        excerpt: p.subtitle ?? p.seoDescription ?? "",
        imageUrl: p.featuredImage?.url,
      }
    : null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sermonContent = (p: any): PostNotificationContent | null =>
  p?.title
    ? {
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt ?? "",
        imageUrl: p.featuredImage?.url,
      }
    : null;

const HANDLERS: Record<string, ContentHandler> = {
  blogPostPage: {
    kind: "blog",
    getById: getBlogPostPageById,
    toContent: blogContent,
  },
  sermon: { kind: "sermon", getById: getSermonById, toContent: sermonContent },
};

async function notifyLocale(
  handler: ContentHandler,
  entryId: string,
  locale: BroadcastLocale,
): Promise<{ locale: BroadcastLocale; status: LocaleStatus; reason?: string }> {
  try {
    if (!isResendBroadcastConfigured(locale))
      return { locale, status: "not-configured" };
    const post = await handler.getById(entryId, locale);
    const content = handler.toContent(post);
    if (!content) return { locale, status: "no-content" };
    const { subject, html, text } = buildPostNotificationEmail({
      kind: handler.kind,
      content,
      locale,
    });
    const broadcastId = `${handler.kind}:${content.slug}:${locale}`;
    const result = await sendBroadcast({
      broadcastId,
      subject,
      html,
      text,
      locale,
    });
    return { locale, status: result.status, reason: result.reason };
  } catch (e) {
    console.error(
      `[post-notification] ${handler.kind} ${entryId} ${locale}:`,
      e instanceof Error ? e.message : String(e),
    );
    return { locale, status: "failed", reason: "exception" };
  }
}

export async function notifyOnPublish(
  event: PublishEvent,
): Promise<PostNotificationSummary> {
  const handler = HANDLERS[event.contentTypeId];
  if (!handler)
    return {
      contentTypeId: event.contentTypeId,
      handled: false,
      perLocale: [],
    };
  const perLocale = [];
  for (const locale of BROADCAST_LOCALES) {
    perLocale.push(await notifyLocale(handler, event.entryId, locale));
  }
  return { contentTypeId: event.contentTypeId, handled: true, perLocale };
}
```

> Prefer narrow types over `any` if the BlogPost/Sermon types export cleanly; the `any` mappers are a fallback to avoid over-coupling. If you use `any`, keep the eslint-disable lines so `pnpm lint` stays clean.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Verify** `pnpm type-check && pnpm lint && pnpm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/service/post-notification.service.ts apps/web/src/service/post-notification.service.test.ts
git commit -m "feat(ICR-44): orchestrate per-locale post-publish broadcasts"
```

---

### Task 5 — Wire the Contentful publish webhook

**Files:**

- Modify: `apps/web/src/app/api/revalidate/route.ts`
- Test: `apps/web/src/app/api/revalidate/route.test.ts`

**Interfaces:**

- Consumes: `notifyOnPublish` (Task 4), `revalidateTag` (next/cache).

- [ ] **Step 1: Failing test `revalidate/route.test.ts`** — mock `next/cache` + the service:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
const revalidateTag = vi.fn();
const notifyOnPublish = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@src/service/post-notification.service", () => ({ notifyOnPublish }));
import { POST } from "./route";

const SECRET = "s3cret";
const req = (body: unknown, secret = SECRET) =>
  new Request("http://x/api/revalidate", {
    method: "POST",
    headers: { "x-vercel-reval-key": secret },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("CONTENTFUL_REVALIDATE_SECRET", SECRET);
  revalidateTag.mockReset();
  notifyOnPublish.mockReset();
  notifyOnPublish.mockResolvedValue({
    contentTypeId: "blogPostPage",
    handled: true,
    perLocale: [],
  });
});

describe("POST /api/revalidate", () => {
  it("401 on bad secret, no revalidate, no notify", async () => {
    const res = await POST(req({}, "wrong"));
    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(notifyOnPublish).not.toHaveBeenCalled();
  });
  it("revalidates and notifies on a blog publish payload", async () => {
    const res = await POST(
      req({ sys: { id: "e1", contentType: { sys: { id: "blogPostPage" } } } }),
    );
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("site-content");
    expect(notifyOnPublish).toHaveBeenCalledWith({
      contentTypeId: "blogPostPage",
      entryId: "e1",
    });
  });
  it("revalidates but does not notify when sys is absent", async () => {
    const res = await POST(req({ hello: "world" }));
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("site-content");
    expect(notifyOnPublish).not.toHaveBeenCalled();
  });
  it("still 200 + revalidates when notify throws", async () => {
    notifyOnPublish.mockRejectedValue(new Error("boom"));
    const res = await POST(
      req({ sys: { id: "e1", contentType: { sys: { id: "blogPostPage" } } } }),
    );
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Rewrite `api/revalidate/route.ts`**

```ts
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { notifyOnPublish } from "@src/service/post-notification.service";

export async function POST(request: Request) {
  const secret = request.headers.get("x-vercel-reval-key");
  if (secret !== process.env.CONTENTFUL_REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  revalidateTag("site-content");

  let notified;
  try {
    const body = await request.json().catch(() => null);
    const contentTypeId = body?.sys?.contentType?.sys?.id;
    const entryId = body?.sys?.id;
    if (typeof contentTypeId === "string" && typeof entryId === "string") {
      const summary = await notifyOnPublish({ contentTypeId, entryId });
      notified = summary.perLocale;
    }
  } catch (error) {
    console.error(
      "[revalidate] notify failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return NextResponse.json({ revalidated: true, now: Date.now(), notified });
}
```

> This also fixes the stray invalid `revalidateTag("site-content", "max")` second arg → single-arg.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Verify** `pnpm type-check && pnpm lint && pnpm test && pnpm build` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/revalidate
git commit -m "feat(ICR-44): trigger subscriber notification from the Contentful publish webhook"
```

---

### Task 6 — Docs & env example

**Files:**

- Modify: `apps/web/.env.example`
- Modify: `docs/forms-and-email.md`

- [ ] **Step 1: `.env.example`** — under the Resend section add:

```
# Resend Broadcasts — one audience per locale (ICR-44)
RESEND_AUDIENCE_ID_ES_AR=
RESEND_AUDIENCE_ID_EN_US=
# Legacy single audience (optional fallback for es-AR only)
RESEND_AUDIENCE_ID=
```

- [ ] **Step 2: `docs/forms-and-email.md`** — add a "Publish → subscriber broadcast (ICR-44)" section: the `/api/revalidate` extension (revalidate first, isolated notify), content-type routing (`blogPostPage`/`sermon`), per-locale audiences (`resolveAudienceId` + the env matrix across Production/Preview/Staging with the test-audience safety note), `broadcastId` dedupe reuse, and that `/api/subscribe` now writes to Resend (Mailchimp legacy; not migrated — start fresh).

- [ ] **Step 3: Verify** `pnpm type-check && pnpm lint && pnpm format:check` → PASS (no test for docs).

- [ ] **Step 4: Commit**

```bash
git add apps/web/.env.example docs/forms-and-email.md
git commit -m "docs(ICR-44): document publish->broadcast flow and per-locale Resend audiences"
```

---

## Self-Review

- **Spec coverage:** Trigger (T5) · orchestrator (T4) · per-locale audiences (T1) · subscribe→Resend (T2) · email template+copy+getters (T3) · dedupe (reused, asserted in T4 broadcastId) · auth/non-blog no-op/failure-isolation (T5 tests) · i18n copy (T3) · config+docs (T6). All AC1–AC11 covered.
- **Placeholders:** none — every code step has concrete code; the only "read the existing file" steps (getters T3.7–8, types T4) are reuse-of-pattern with the exact `where` filter + field names given.
- **Type consistency:** `BroadcastLocale`, `resolveAudienceId`, `BroadcastParams.audienceId`, `isResendBroadcastConfigured(locale)`, `SubscribeOutcome`, `PostNotificationContent`, `buildPostNotificationEmail`, `PublishEvent`/`PostNotificationSummary`, `notifyOnPublish` — names match across tasks. `broadcastId` format `kind:slug:locale` consistent (T4 + spec).
