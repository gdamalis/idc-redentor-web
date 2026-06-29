# Likes & MongoDB

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** The only stateful part of the app. How the cached MongoDB client works, the three collections it backs (`likes`, `contact`, `broadcast_log`), the anonymous like toggle and its visitor de-dup, and the write-safety considerations.
> **Last reviewed:** 2026-06-28

## Scope: this is the whole database

MongoDB is **not** the content store — Contentful is. Mongo exists only for the things Contentful can't do: an anonymous blog **like** counter, **saved contact-form messages**, and **broadcast send tracking**. All three live in a database literally named **`website`**:

| Collection      | Written by                                                   | Read by                                           | Doc shape                                                                               |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `likes`         | `POST /api/likes` → `like.service.ts#toggleLike`             | `GET /api/likes` → `getLikes`; the blog UI        | `{ slug, count, visitors: string[], updatedAt }`                                        |
| `contact`       | contact Server Action → `contact.service.ts#sendContactForm` | `getContactMessages` (internal, no public route)  | `{ name, email, subject, message, createdAt }`                                          |
| `broadcast_log` | `sendBroadcast` → `broadcast/broadcastLog.ts#claimBroadcast` | never read by the public site (dedupe guard only) | `{ broadcastId (unique), status, campaignId?, reason?, createdAt, updatedAt, sentAt? }` |

If a task mentions "the database" on this project, it means these three collections — nothing else.

### `broadcast_log` collection (ICR-29)

The `broadcast_log` collection is the **idempotency guard** for the broadcast engine
(`apps/web/src/service/broadcast/broadcastLog.ts`). It is never read by the public site.

**Document shape:**

```ts
type BroadcastLogStatus = "sending" | "sent" | "failed";

interface BroadcastLogDocument {
  broadcastId: string; // unique (caller-supplied key, e.g. "blog:<slug>:<locale>")
  status: BroadcastLogStatus;
  campaignId?: string; // Mailchimp campaign id, set on success
  reason?: string; // failure token, set on failure
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date; // set when status transitions to "sent"
}
```

**Unique index:** `{ broadcastId: 1 }` (created lazily on first `claimBroadcast` call via
`collection.createIndex({ broadcastId: 1 }, { unique: true })`).

**Claim semantics:** `claimBroadcast` uses an insert-first upsert filtered to
`status: { $ne: "sent" }`. A doc that is already `sent` fails the filter, the upsert attempts an
insert, the unique index throws E11000, and the engine interprets that as `already-sent` — no second
Mailchimp send. A `failed` doc matches the filter and is re-claimed (retryable). No doc → upserted
as `sending`. This guarantees at-most-one campaign per `broadcastId` even under concurrent calls.

See [`forms-and-email.md`](./forms-and-email.md#broadcast-engine-icr-29) for the full engine
description.

## The cached client (`src/service/database.service.ts`)

```ts
let client: MongoClient | null = null;

function getClient(): MongoClient {
  if (client) return client;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not defined");

  if (process.env.NODE_ENV === "development") {
    // cache on globalThis to survive HMR
    const g = globalThis as typeof globalThis & { _mongoClient?: MongoClient };
    g._mongoClient ??= new MongoClient(uri, MONGODB_OPTIONS);
    client = g._mongoClient;
  } else {
    client = new MongoClient(uri, MONGODB_OPTIONS);
  }
  return client;
}

export async function connect() {
  /* getClient().connect() + ping admin */
}
export async function disconnect() {
  /* client.close() */
}
```

Key points:

- **Single cached client.** In development it's stashed on `globalThis._mongoClient` so Hot Module Reload doesn't open a new pool on every edit. In production it's a module-level singleton. This is the standard Next.js + MongoDB pattern and avoids connection-pool exhaustion.
- **`MONGODB_OPTIONS`** pins the Stable API (`serverApi: { version: v1, strict: true, deprecationErrors: true }`).
- **`connect()` returns the client or `undefined` on failure** (it catches and logs). Callers must null-check — every service does `if (!client) throw new Error("Failed to connect to database")`.
- **`MONGODB_URI` is required at runtime but missing from `.env.example`.** Set it. Never commit a real URI.

## The like feature

### Data model

```ts
interface LikesDocument {
  slug: string; // blog post slug — the key
  count: number; // current like total (kept ≥ 0)
  visitors: string[]; // anonymous visitor ids that liked this post
  updatedAt: Date;
}
```

A like is **anonymous and per-visitor**, deduped by a `visitors` array rather than a user account (there are no accounts). The visitor id is a random UUID stored in a cookie.

### The API route (`src/app/api/likes/route.ts`)

- **`GET /api/likes?slug=…`** → returns `{ count, hasLiked }`. `hasLiked` reflects whether the request's `_visitor_id` cookie is in the post's `visitors`.
- **`POST /api/likes`** with `{ slug }` → toggles the like for this visitor and returns the new `{ count, hasLiked }`.
- The visitor id lives in the **`_visitor_id` cookie**: `httpOnly`, `sameSite: "lax"`, `secure` in production, `maxAge` one year, `path: "/"`. If a POSTing visitor has no cookie yet, the route mints a UUID (`crypto.randomUUID()`) and sets the cookie on the response.
- Both handlers `await cookies()` (per the always-await-runtime-APIs convention) and return structured JSON with `400` for a missing slug and `500` on error.

### The toggle (`like.service.ts#toggleLike`)

`toggleLike(slug, visitorId)` reads the existing doc, then:

- **Already liked** → `$pull` the visitor from `visitors`, `$inc` count by `-1`, set `updatedAt`.
- **Not yet liked** → `$addToSet` the visitor, `$inc` count by `+1`, set `updatedAt`, `$setOnInsert: { slug }` with `{ upsert: true }` so the first like on a post creates the doc.

It returns an optimistic `{ count: Math.max(prevCount ± 1, 0), hasLiked: !alreadyLiked }`. `count` is floored at 0 so it can't go negative.

## Write-safety & known limitations

These are deliberately-noted rough edges — useful context before touching this code:

1. **The toggle is read-then-write, not atomic.** `toggleLike` does a `findOne` and then an `updateOne`; the returned `count` is computed from the pre-read value, not the post-update value. Under heavy concurrency on the same slug, the displayed count can drift slightly from the stored count (the `$addToSet`/`$pull` keep the membership correct, but the `$inc` can over/under-count on simultaneous toggles). For a low-traffic church blog this is acceptable; if it ever matters, switch to a `findOneAndUpdate` that returns the updated document and derive `count` from `visitors.length` (or use a conditional `$inc` guarded by the `$addToSet` result).
2. **`count` and `visitors.length` can diverge** over time for the same reason; treating `visitors.length` as the source of truth would be more robust.
3. **No rate limiting.** Likes and contact submissions are unauthenticated and unthrottled. A bored visitor can toggle rapidly (self-limited by the de-dup) and a script can spam `POST`s. If abuse appears, add an edge rate limit. These paths (`src/app/api/**`, `src/service/**`) are flagged sensitive in the harness.
4. **No indexes are declared in code.** `likes.slug` and `contact.createdAt` are the lookup/sort keys; if the collections grow, add a unique index on `likes.slug` and an index on `contact.createdAt`. Document any such index here when added.
5. **PII lives only in `contact`.** Names/emails/messages. There is no public read route; `getContactMessages` is for an internal view only. Don't add an endpoint that exposes it. See [`forms-and-email.md`](./forms-and-email.md).

## QA & MongoDB

The QA harness (`qa-runner`) may **read** Mongo against a **test database only** — its DB-name allowlist is `^website-(test|qa|e2e)$`, which deliberately excludes the production `website` db. **Phase 1 performs no Mongo writes at all.** Verifying a like is a read/interaction check: toggle in the browser, then `find`/`count` on the test collection. Never point QA at production data.

## Adding a stateful feature — think twice

Before adding a third collection, check `docs/product/scope-and-boundaries.md`. The product is intentionally an informational, read-mostly site (no accounts, no public UGC). New write paths expand the PII/abuse surface and usually have an in-scope reframe (curated Contentful content, or a contact-form handoff) that avoids new storage. If a new collection is genuinely warranted, follow the cached-client + null-check + `db("website")` pattern above and document it in this file.
