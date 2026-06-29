# Predica PDF regeneration on draft edit — Design Spec (Part B)

> **Status:** Design / not yet implemented · 2026-06-29
> **Depends on:** the "PDF mirrors the post" change (Part A) — the PDF now renders the localized `content[]`
> body, so it can be regenerated from whatever a preacher edits in Contentful. See
> `docs/predica-pdf-mirrors-post.md`.
> **⚠ Sensitive areas:** adds a **Contentful Management (write) token to the app runtime**, a **new public
> webhook endpoint**, and **MongoDB writes**. Treat env/secrets + the endpoint as security-sensitive; review
> accordingly.

## Goal

When a preacher edits a sermon **draft** in Contentful (title / `content[]` body / scripture), regenerate the
branded PDF(s) from the edited content and **replace** them on the entry — **debounced** (bursts of edits
coalesce into one render) and **version-stamped** (the preacher can tell a new PDF landed). Draft-only; never
publishes; never touches the `master` alias.

## Why it's possible now

Part A made `content[]` the single body the PDF renders. The PDF builder `buildPdfHtml` is a pure function in
`apps/web/src/utils/predica/helpers.ts` (TypeScript, in `src/`), so a Next.js route can import and reuse it.
The only environment difference is the headless-Chromium binary (local `@playwright/test` vs. a
serverless-friendly Chromium).

## Architecture (overview)

```
Contentful draft save / auto_save  ──webhook──▶  POST /api/predica/regenerate-pdf
                                                    │  (auth, sermon-only, mark dirty in Mongo, return 202)
                                                    ▼
                                                 pdfJobs  (MongoDB: dirty queue + version + content hash)
                                                    ▲
   Vercel Cron (every ~1 min)  ──────────────────┘  pick jobs idle > quiet window AND content changed
        │  fetch DRAFT sermon (preview) → buildPdfHtml → Chromium → PDF
        │  upload asset (CMA) → swap pdfSummary link in place → delete superseded → bump version
        ▼
   Contentful DRAFT entry (same id), new PDF on pdfSummary, asset title "... · vN"
```

This decouples the noisy webhook from the expensive render, which is what gives us debouncing.

## Requirements

1. **Webhook endpoint** — `apps/web/src/app/api/predica/regenerate-pdf/route.ts` (POST), modeled on
   `apps/web/src/app/api/revalidate/route.ts`.
   - **Auth:** header `x-predica-regen-key` must equal `process.env.PREDICA_REGEN_SECRET` → else `401`.
   - **Scope:** act only when `body.sys.contentType.sys.id === "sermon"`; otherwise `200` no-op.
   - **Action:** compute a stable `contentHash` over the PDF-relevant fields (title, `content[]`,
     `scriptureReferences`, byline, serviceLabel — both locales), `upsert` a `pdfJobs` record keyed by
     `entryId`, set `dirtyAt = now` and `contentHash`. Return `202 Accepted` immediately. **No render here.**
   - Idempotent: repeated webhooks for the same entry just push `dirtyAt`/`contentHash` forward.
2. **Debounce via cron coalescing** — a Vercel Cron route (e.g. `apps/web/src/app/api/predica/regenerate-pdf/cron/route.ts`,
   wired in `vercel.json` to run every minute).
   - Select jobs where `now - dirtyAt > QUIET_WINDOW` (≈ 60–90s) **and** `contentHash !== lastRenderedHash`
     **and** `status !== "rendering"`. This collapses a burst of keystroke-webhooks into one render per entry.
   - Take a per-job lock (`status = "rendering"`, with a stale-lock timeout) so overlapping cron ticks don't
     double-render the same entry.
3. **Render** — for each selected job:
   - Fetch the **draft** sermon via the existing preview getter (`apps/web/lib/contentful/getSermons.ts` in
     draft mode) so the render reflects exactly what the preacher edited.
   - Map the fetched sermon to `SermonLocaleData` + `SermonCommon` and call `buildPdfHtml` per locale.
   - Render HTML → PDF with **`@sparticuz/chromium` + `playwright-core`** (serverless Chromium). The local
     pipeline keeps `@playwright/test`. Raise the route's `maxDuration` and memory.
   - Stamp the version: pass the job's next `version` into the footer (small `v<N>`).
4. **Write-back (CMA)** — using `contentful-management` (already a dependency; used by
   `apps/web/scripts/contentful/sync-entries.mjs`):
   - Upload the new PDF as a **draft asset**, title `"<sermon title> — PDF <locale> · v<N>"`.
   - **Swap the `pdfSummary[locale]` link** on the sermon entry in place (same entry id, no publish).
   - Delete the superseded old PDF asset (reuse the guarded delete semantics from
     `.claude/scripts/predica/delete-contentful.mjs`; never delete a referenced/shared asset).
   - On success: `lastRenderedHash = contentHash`, `version += 1`, `status = "idle"`,
     `lastRenderedAt = now`.
5. **Hard invariants** — draft-only (no `publish_*`), never write `master` (refuse `master*` like the local
   scripts), secret hygiene (never log the CMA token), and a content-type guard so only `sermon` entries are
   ever processed.

## Data model (MongoDB — new collection `pdfJobs`, database `website`)

```ts
interface PdfJob {
  entryId: string;          // Contentful sermon entry id (unique key)
  dirtyAt: Date;            // last edit webhook time (debounce window anchor)
  contentHash: string;      // hash of PDF-relevant fields at last webhook
  lastRenderedHash?: string;// contentHash at last successful render (skip no-ops)
  version: number;          // monotonic; rendered into the footer + asset title
  status: "idle" | "rendering";
  lockedAt?: Date;          // for stale-lock recovery
  lastRenderedAt?: Date;
  lastError?: string;
}
```
Index: unique on `entryId`. Reuse the cached client in `apps/web/src/service/database.service.ts`.

## API changes

- **New:** `POST /api/predica/regenerate-pdf` — request body is the Contentful webhook payload (`{ sys, fields }`).
  Validate `sys.contentType.sys.id` and the auth header with **Zod** at the boundary. Responses: `202`
  (queued), `200` (ignored non-sermon), `401` (bad secret).
- **New:** the cron route (GET, protected by Vercel Cron's `Authorization: Bearer ${CRON_SECRET}` or a shared
  secret). Returns a small JSON summary of what it rendered.

## Environment / config changes

| Variable | Purpose | New? |
|----------|---------|------|
| `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` | CMA write token for the app runtime (upload asset + update entry). **Today only local `.claude` scripts have it.** | **yes — add to Vercel + `apps/web/src/types/environment.d.ts`** |
| `PREDICA_REGEN_SECRET` | `x-predica-regen-key` for the webhook | yes |
| `CRON_SECRET` | protect the cron route | yes (or reuse Vercel Cron auth) |

Also: add `@sparticuz/chromium` + `playwright-core` to `apps/web` deps; configure the route's `maxDuration`
and memory; add the cron schedule to `vercel.json`; configure a Contentful **draft save / auto_save** webhook
(separate from the existing publish→`/api/revalidate` one) pointing at the new endpoint.

## Edge cases

1. **Burst typing** → many webhooks in seconds: each only bumps `dirtyAt`/`contentHash`; the cron renders
   once after the quiet window. ✔
2. **No meaningful change** (e.g. they edited a non-PDF field): `contentHash === lastRenderedHash` → cron
   skips. ✔
3. **Overlapping cron ticks**: per-job `status = "rendering"` lock + stale-lock timeout prevents double work.
4. **Render fails**: keep `status = idle`, record `lastError`, leave `lastRenderedHash` unchanged so the next
   tick retries; never leave a job wedged in `rendering`.
5. **Entry deleted / unpublished mid-flight**: fetch returns nothing → drop the job.
6. **Published sermon edited**: still regenerate the **draft** PDF and swap the link, but **never publish** —
   the human re-publishes to push it live (consistent with Gate 2).
7. **Multi-preacher posts**: the body has `embeddedAsset` players; `buildPdfHtml` skips them. Decide whether
   v1 of the webhook regenerates only the single `pdfSummary` and leaves per-part segment PDFs to `/predica`
   (recommended initial scope).

## Testing strategy

- **Unit:** `contentHash` stability (same content → same hash; changed body → different hash); the
  webhook handler (auth, content-type gate, dirty upsert) with a mocked Mongo; the sermon→`SermonLocaleData`
  mapping.
- **Integration:** cron selection logic (quiet-window + hash-diff + lock) against a seeded `pdfJobs`.
- **Manual smoke (staging):** edit a draft sermon → confirm one PDF regen after the quiet window, the
  `pdfSummary` link swapped, the old asset deleted, the footer/asset-title version bumped, nothing published.

## Implementation checkpoints (when this is built)

1. Env + deps: declare `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`/`PREDICA_REGEN_SECRET`/`CRON_SECRET`, add
   `@sparticuz/chromium`+`playwright-core`. (`chore`)
2. `pdfJobs` model + service helpers (upsert dirty, claim, complete) on the cached Mongo client. (`feat`)
3. Webhook route (auth + content-type gate + dirty upsert + `contentHash`). Unit-tested. (`feat`)
4. Server render util: sermon(draft) → `buildPdfHtml` → serverless Chromium → Buffer. (`feat`)
5. CMA write-back: upload asset, swap `pdfSummary` in place, guarded delete of superseded, version bump. (`feat`)
6. Cron route + `vercel.json` schedule + lock/coalesce logic. (`feat`)
7. Docs: update `docs/predica-pdf-mirrors-post.md` + `docs/contentful-data-layer.md` (second webhook),
   `.env.example`, and `environment.d.ts`. (`docs`)

## Open questions / risks

- **Chromium on Vercel** is the main risk (cold start, bundle size, font loading). If `@sparticuz/chromium`
  proves fragile, alternatives: a Vercel **background function** with a long `maxDuration`, or a tiny external
  render worker the cron calls. Decide during checkpoint 4 with a spike.
- **Quiet-window length** (60s vs 90s vs 120s): tune to how preachers actually edit; start at 90s.
- **Multi-preacher scope** for v1 (see edge case 7).
- **Cron vs. delayed queue:** Vercel Cron (1-min granularity) is the simplest coalescer; a delayed-message
  queue (e.g. Upstash QStash) is an alternative if sub-minute latency is ever wanted (it isn't, for a weekly
  sermon).
