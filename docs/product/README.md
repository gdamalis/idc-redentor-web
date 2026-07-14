# IDC Redentor — Product Definition

This folder is the **canonical product definition** for the Iglesia de Cristo Redentor (IDC Redentor) website: what it is, who it serves, what it stands for, and where its boundaries are. It is grounded in the current Next.js + Contentful site and the church's own content (the Creed/Credo, "¿Quién es Jesús?", mission, values, and worship-service info already authored in Contentful), and it is the source of truth that the `divinelab:product-manager` agent (shipped by the divinelab plugin, invoked via `/divinelab:pm`) loads on every run.

> **IDC Redentor in one paragraph:** the official bilingual (es-AR / en-US) website of Iglesia de Cristo Redentor — a welcoming, informational home for members and visitors that explains who Jesus is, what the church believes (the Creed/Credo), how to find and join the community, and how to get in touch. It is a **content-managed informational site** (Contentful + Next.js), not an app: no logins, no payments, no public user-generated content. Its job is to be warm, trustworthy, fast, easy for non-technical editors to maintain, and easy for people — and the search engines and AI assistants they now ask — to discover.

> **Two products (as of 2026-07-05):** this repo is now a monorepo with two products — the **public website** (`apps/web`, governed by this `docs/product/` brain) and the separate, authenticated **Ministry Admin Panel** (`apps/admin`, governed by [`tasks/specs/admin-platform-brief.md`](../../tasks/specs/admin-platform-brief.md)). The scope boundaries here (no auth, no RBAC, no PII at scale) govern the **public website**; the admin platform deliberately provides those capabilities privately for the leadership team. See [scope-and-boundaries.md § Two products](./scope-and-boundaries.md).

> **Status:** This is the first custom website for the church. The product docs below are **drafts with sensible defaults** for the maintainer ([@gdamalis](https://github.com/gdamalis)) and church leadership to confirm and refine. Anything doctrinal (mission, beliefs, the Creed) is explicitly flagged as **human-to-confirm** — see the DRAFT notes in each file.

## Reading order

1. **[overview.md](./overview.md)** — what the site is, who it serves, the mission and values (draft), brand voice, and the audience surfaces mapped to routes. _Start here._
2. **[scope-and-boundaries.md](./scope-and-boundaries.md)** — what's IN, what's deliberately OUT (no logins, no payments, no public UGC, no in-product AI), and what's DEFERRED on the roadmap. _The hard filter for every idea._
3. **[content-types.md](./content-types.md)** — the real Contentful content types (Page, the four section components, ContentCollection with Credo + ValueItem, EventBanner → Event + LocationComponent, Blog post, Footer, NavigationMenu, Seo), with the getter that reads each and the route/component that renders it.
4. **[editorial-and-content-rules.md](./editorial-and-content-rules.md)** — the bilingual rule, voice/tone for a church audience, the doctrinal-content guardrail, image and SEO-copy rules, and the publish/preview flow.
5. **[ai-era-strategy.md](./ai-era-strategy.md)** — the discoverability thesis for a church (structured data + clean metadata, **not** an on-site bot), prioritized, and the KPIs.
6. **[privacy-policy.md](./privacy-policy.md)** — the canonical bilingual copy of the privacy policy published at `/es-AR/privacidad` and `/en-US/privacy`, the factual basis for every claim it makes, and the human-only runbook for publishing it to Contentful. _Change the policy here first._

## How the `product-manager` agent uses this

The `product-manager` agent loads this folder on every run and applies **[scope-and-boundaries.md](./scope-and-boundaries.md)** as a hard filter:

- An idea inside **IN scope** → draft a Jira issue.
- An idea **OUT of scope** → reject it or offer the in-scope reframe, citing the specific boundary.
- An idea in **DEFERRED** → create an issue, tag it roadmap/deferred, and tie it to the discoverability thesis in [ai-era-strategy.md](./ai-era-strategy.md).

## Keeping these docs alive

These files are meant to be referenced and updated, not frozen. When a product decision changes, update the relevant file and bump its **Last reviewed** date. If a new idea reveals a doc is stale or self-contradictory, fix the doc — stale product docs are worse than none. Doctrinal and mission text changes are **leadership-owned**: agents and editors surface proposed wording for human confirmation rather than silently rewriting it. The `product-manager` agent will flag drift it notices rather than diverging from these docs.

**Last reviewed:** 2026-07-14
