# Design — one connection string per database in `apps/admin`

**Status:** agreed (design gate passed, 2026-07-20) · **Supersedes:** the single-`MONGODB_URI` data-layer model in ICR-141 §2
**Related:** ICR-124 (scaffold, shipped) · ICR-140 (QA safety rails) · ICR-141 (human provisioning runbook) · ICR-155 (seed script) · ICR-157 (web pool cap)

## Problem

`apps/admin` needs **two** MongoDB databases:

| Database         | Holds                          | Why admin needs it             |
| ---------------- | ------------------------------ | ------------------------------ |
| `ministry-admin` | congregant PII + admin auth    | the app's own data             |
| `website`        | public content, likes, contact | admin authors content as a CMS |

The shipped model (ICR-141 §2) carries a **single** `MONGODB_URI` whose **path** names `ministry-admin`, and expects the second database to be reached via a hardcoded `client.db("website")`. Two problems:

1. **Asymmetry.** One database's name lives in the URI (config), the other in code. Neither is "the" database, so privileging one in the connection string is misleading.
2. **A latent bug.** The hardcoded `client.db("website")` is the **production** name. On staging the database is `website-staging`, so that literal is wrong there. The current model has no clean answer for the _second_ database's per-environment suffix — it only solves it for the first.

A single shared credential also had a security gap: the admin user held `readWrite` on **both** databases, so one leaked URI exposed PII _and_ content, and a role mix-up (content code pointed at the PII database) would be **permitted by MongoDB** because the user could reach both.

## Decision

**One self-contained connection string per database, each with its own single-database user.**

| Env var               | Path database (prod / non-prod)             | Atlas user                                             |
| --------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `MONGODB_URI`         | `ministry-admin` / `ministry-admin-staging` | ministry-admin user — **that database only**           |
| `WEBSITE_MONGODB_URI` | `website` / `website-staging`               | the **existing** `website` user (`apps/web`'s), reused |

Both URIs keep the database in the **path**, plus explicit `authSource=admin` and `maxPoolSize=10`.

This **preserves** the locked "the DB name rides in the URI path; there is no separate DB-name env var" tenet rather than reversing it — `ADMIN_DB_NAME` stays cancelled. Each URI is now honestly _single-database_, which is precisely the case where DB-in-the-path is the correct idiom. All name-resolution logic disappears: no const map, no tier derivation, no parsing, no pattern matching.

## Why this is safer than the shared-user model

Two **independent** layers now cover both failure modes:

| Failure                                                        | Caught by                                               |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| **Tier** mix-up (prod names meet staging creds, or vice versa) | Atlas grant — the user cannot reach the other tier's DB |
| **Role** mix-up (URIs swapped; content code reaches PII)       | Atlas grant **and** the in-code name assertion          |

The role axis is the upgrade. Under the shared user, MongoDB permitted both databases, so only code could catch a cross-wiring; now a swapped URI fails at the credential _and_ at the assertion. **No single credential the admin app holds can reach both databases** — a leaked `MONGODB_URI` exposes only `ministry-admin`; a leaked `WEBSITE_MONGODB_URI` exposes only `website`. Blast radius halved.

The public website's isolation is unchanged and non-negotiable: `apps/web` never gets any grant on `ministry-admin*`.

## Code shape

Two cached clients and two accessors in `src/service/database.service.ts`, each doing a bare `client.db()` on its own URI plus a positive assertion:

```
getAdminDb()    -> adminClient.db()    -> assert /^ministry-admin(-staging)?$/
getContentDb()  -> websiteClient.db()  -> assert /^website(-staging)?$/
```

Notes:

- **Positive allowlists, not denylists.** Today `assertAdminDbName` is a denylist (`test`/`admin`/`local`/`config`/`^website`). Both assertions become positive allowlists — stricter, and reserved system names (`test`, `admin`, `local`, `config`) are rejected for free by matching neither pattern.
- **Client caching mirrors the existing pattern** per client, including the `globalThis` dev-HMR cache (two distinct global keys), `maxPoolSize: 10`, and `serverApi` v1 strict.
- **Assertions stay unmemoized** (O(1)) so a dev-mode HMR client swap can never bypass them — same reasoning as the shipped code.
- **Throwing is the deliberate functional-first exception**, already documented in the shipped file: a misconfigured database is a _deployment defect_, not a branchable outcome. No `Error` subclass; plain `Error` naming the offending database.

## Driver facts (verified against installed `mongodb@6.21.0`)

- `connection_string.js:302–310` — the driver copies the path database into `credentials.source` **only** when a path database is present _and_ `authSource` is absent. Because both URIs set `authSource=admin` explicitly, the path is **never** used as the auth source. Auth targets `admin` (where Atlas users live) as intended.
- `connection_string.js:323–326` — `dbName` defaults to `test` when the URI has no path database. This is why a missing path fails closed: `client.db()` resolves `test`, which matches neither allowlist.

## Error handling (all fail closed)

| Condition                                   | Behavior                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `MONGODB_URI` / `WEBSITE_MONGODB_URI` unset | throw naming the missing variable (existing behavior, per client)         |
| URI has no path database                    | `client.db()` → `test` → assertion throws naming `test`                   |
| URIs swapped                                | assertion throws naming the offending database; the grant would also deny |
| Reserved system database in path            | assertion throws (matches neither allowlist)                              |
| Connection failure                          | `connect()` logs and returns `undefined` (existing behavior)              |

## Testing strategy

Mirror the shipped `database.service.test.ts` structure (mocked `mongodb`, `vi.stubEnv`, `vi.resetModules` per case):

- Both assertions: accept their two legitimate names; reject empty/whitespace/`undefined`/`null`, the reserved four, and **each other's** names (`assertAdminDbName("website")` throws, `assertWebsiteDbName("ministry-admin")` throws) — this is the cross-wiring regression cover.
- `getAdminDb()` / `getContentDb()`: resolve from their own URI; each throws naming `test` when its URI carries no path database.
- **Independence:** stubbing only one URI must not make the other accessor silently succeed — assert each reads its own variable.

## Affected files

| File                                              | Change                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/service/database.service.ts`      | second cached client + `getContentDb()`; both assertions to positive allowlists                                                                                                                      |
| `apps/admin/src/service/database.service.test.ts` | mirror coverage for the second accessor + cross-wiring cases                                                                                                                                         |
| `apps/admin/.env.example`                         | add `WEBSITE_MONGODB_URI` (names only) + comment the two-connection model                                                                                                                            |
| `apps/admin/src/types/environment.d.ts`           | declare `WEBSITE_MONGODB_URI: string`                                                                                                                                                                |
| `apps/admin/eslint.config.mjs`                    | rule message no longer advertises `client.db("website")`; point at `getContentDb()`. The `ignores: ["src/service/database.service.ts"]` exemption still covers both accessors — no structural change |
| `.claude/config.json`                             | QA `dbNote` / `dbNameAllowNote` describe the single-URI model; update prose. **`dbNameAllow` patterns are unaffected** — they only ever match suffixed _test_ databases                              |
| `docs/architecture/` (admin data layer)           | document the two-connection model + the two-layer safety argument                                                                                                                                    |

## Edge cases

1. **Two connection pools.** Two `MongoClient`s ⇒ two pools (2 × `maxPoolSize` 10 = 20 from admin). Trivial against the M0 500-connection cap. Related: ICR-157 caps the web side.
2. **No cross-database transaction.** Two clients cannot share a session. Not a regression — cross-DB `$lookup`/`$unionWith` never worked, and coupling a PII write to a content write is exactly what the sensitivity split exists to prevent. Treat as a property, not a limitation.
3. **Seed script (ICR-155).** Uses `MONGODB_URI` for the admin database; no tier flag needed, because the URI it is handed fully determines the target. If it ever needs content, it reads `WEBSITE_MONGODB_URI`.
4. **Local development.** Point both URIs at the `-staging` databases. Local must never reach production data; the staging users cannot, so this is enforced, not merely conventional.
5. **Shared `website` user.** `apps/web` and `apps/admin` use the same website credential. Accepted: it is already single-database-scoped, so the meaningful boundary (`website` vs `ministry-admin`) is unaffected. A dedicated admin-side website user remains a future hardening option if independent revocation is ever wanted.

## Rejected alternatives

1. **Const map in code + tier derived from `VERCEL_ENV`.** Put both names in a code const map and pick prod-vs-staging from `VERCEL_ENV`. Rejected: puts database names in code rather than config, adds a derivation that can be wrong, and forces a special case for the seed script (which runs locally with no `VERCEL_ENV`).
2. **A `MONGODB_DATABASES` env var listing accessible names, mapped to roles by pattern in code.** Rejected: needs bootstrap parsing plus pattern matching, reverses the "name rides in the URI" tenet, and — decisively — the role→pattern guard is required _anyway_, so it adds machinery without removing the thing it was meant to replace.
3. **Status quo (single URI + hardcoded `client.db("website")`).** Rejected: leaves the asymmetry and the `website`/`website-staging` bug unsolved; tier logic would have to be bolted onto the content database regardless, ending up half-in-URI and half-in-code.

## Provisioning delta for ICR-141

ICR-141 §2 describes two admin users each holding **two** grants. That model is superseded:

- Admin users become **single-database**: `readWrite@ministry-admin` (prod) and `readWrite@ministry-admin-staging` (non-prod) — **no** `website` grant.
- `WEBSITE_MONGODB_URI` reuses the **existing** `website` / `website-staging` user.
- `WEBSITE_MONGODB_URI` must be added to all three admin Vercel environments, with its path database matching the tier.
- The AC verifying the boundary should now also assert the **admin** user _cannot_ reach `website*` (previously it was expected to).

## Open questions

None blocking. The dedicated-vs-reused website user is settled (reuse); revisit only if independent revocation becomes desirable.

## Amendment (2026-07-20, post-review): allowlists widened to match the QA contract

A PR review on ICR-166 (Codex, P2, maintainer-approved) flagged that `.claude/config.json`'s
`qa.env.{preview,staging}.dbNameAllow` sanctions `{website,ministry-admin}-{staging,test,qa,e2e}` as
QA-touchable databases, but the code allowlists as designed and shipped above (`^ministry-admin(-staging)?$`,
`^website(-staging)?$`) accepted only bare or `-staging` — two guards disagreeing on identical input. The
maintainer decided to **widen the code allowlists** to agree with the QA contract (rather than narrow
`dbNameAllow`), since the QA harness legitimately needs to address `-test`/`-qa`/`-e2e` databases. This
supersedes the "Code shape" pattern in this doc (§ "Code shape" above): both regexes now accept the
optional suffix `-staging`, `-test`, `-qa`, or `-e2e`.

**Accepted tradeoff, stated plainly:** this is a real widening, not a strictly safer change. A production
deployment misconfigured to, say, `ministry-admin-test` is now **accepted** by the code-layer assertion
where the originally-designed pattern would have **failed closed**. The Atlas grant (§ "Why this is safer
than the shared-user model" above) is what now actually prevents a prod credential from reaching a
`-test`/`-qa`/`-e2e` database — the code layer alone no longer catches that specific misconfiguration.
Reserved system databases and cross-tier names are still rejected; only the four QA suffixes were added to
each prefix's own allowlist. Full detail: `docs/architecture/admin-database.md` § Amendment.
