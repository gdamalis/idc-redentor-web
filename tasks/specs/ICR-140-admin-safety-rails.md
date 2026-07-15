# ICR-140 — Teach the harness about `apps/admin` (safety rails, before the scaffold)

**Type:** Task (`chore`) · **Priority:** High · **Labels:** admin, harness, security
**Sensitive areas:** `env-secrets` (DB allowlist), harness sensitive-paths / design-gate machinery. **This ticket _is_ the sensitive-area configuration.**
**Scope:** config-only — the sole file changed is repo-root `.claude/config.json`. No app code.

## Context & why (safety-critical)

`.claude/config.json` currently describes a **web-only** repo. It already maps the Jira _Component_ (`apps/admin` → Ministry Admin Panel) but **none of the safety rails cover `apps/admin`**. The upcoming admin work — ICR-124 (scaffold), ICR-127 (Firebase auth, session cookies, invite-only), ICR-128 (RBAC / permission matrix) — would otherwise ship auth/RBAC code with the **design gate silently off** and QA unable to safely touch admin data. This ticket lands **before ICR-124** so the rails exist the moment admin code does.

The admin data-layer decision is **LOCKED** (obs 2026-07-14): four DBs on one M0 cluster — `website`, `website-staging`, `ministry-admin`, `ministry-admin-staging` (all hyphenated). `ADMIN_DB_NAME` is **cancelled**; the DB name rides in the `MONGODB_URI` path. So the admin production DB name is **`ministry-admin`** — not open, and distinct from MongoDB's reserved `admin` system DB. The older `admin` / `ADMIN_DB_NAME` wording in `tasks/specs/admin-mvp.md` is stale and superseded.

## Dependencies Check

- `.claude/config.json` exists and currently validates against the canon schema (verified).
- Canon schema: `~/.claude/plugins/cache/divinelab/divinelab/*/skills/canon/config.schema.json`.
  - `qa.autoMerge.sensitivePaths` — plain `string[]`, **open** (new entries free). ✅
  - `$defs.qaEnvironment` — **`additionalProperties: false`**; only `_`-prefixed / `Note`-suffixed keys are exempt. A structured `dbNameDeny` field would **fail validation** → denials must live in a `*Note` string + be enforced by the allow-regex. ✅ (drives the design)
  - `playwrightProjectMap` — open `additionalProperties` (values = non-empty `string[]`); `_`-prefixed note keys with string values are allowed (the existing `_note` proves it). ✅
- Gate mechanism (confirmed in the plugin's `explorer.md:145-165`): `qa.autoMerge.sensitivePaths` **is** the canonical glob list that drives `/work`'s design gate — a changed path matching any glob makes it a sensitive area and forces `needsDesignGate`. No second key to touch.
- `qa-runner` (`qa-runner.md:166-177,299`) already resolves the DB name via `client.db().databaseName` and full-string-matches it against `env.dbNameAllow` (default-deny). AC2's "resolve from the URI, not an env var" is **already the behavior** — this ticket documents it, no code changes.
- `apps/admin/` does **not** exist yet; `playwright.config.ts` exists only under `apps/web/`.

## Requirements

### R1 — Sensitive-paths parity for `apps/admin` (AC1)

Add these 7 globs to `qa.autoMerge.sensitivePaths` (the ticket's 6 + one `apps/web`-mirror addition):

```
apps/admin/src/app/**            # ALL admin app routes: api handlers, (app) protected RSC loaders + Server Actions (requirePermission), (auth) pages
apps/admin/src/middleware.ts     # route protection (admin's proxy.ts analog)
apps/admin/src/service/**        # Mongo + RBAC enforcement (requirePermission)
apps/admin/src/lib/auth/**       # Firebase Admin SDK / session verify
apps/admin/**/permissions*       # the permission registry
apps/admin/package.json          # dep surface
apps/admin/next.config.*         # mirrors apps/web/next.config.* already guarded
```

This broadening (from an earlier `apps/admin/src/app/api/**`-only glob) resolves a verified Codex P2
finding on PR #100: per `tasks/specs/admin-mvp.md:208,230,244`, admin uses Next route groups
`(auth)`/`(app)`, `requirePermission(key)` is enforced in every Server Action, route handler, and
protected RSC loader, and protected pages/Server Actions live under `apps/admin/src/app/(app)/...` —
none of which the narrower `api/**` glob matched, so an authz regression there would have bypassed the
design gate. `apps/admin/src/app/**` covers the whole app-router surface in one glob and avoids the
fragility of matching literal `(app)` parentheses in a glob pattern.

Because these join the **same array** by the **same mechanism** as `apps/web/src/service/**`, editing an admin auth/RBAC/session/service file trips the design gate **exactly as** a web service edit does today — that is the deliverable (parity). QA _depth_ (light/standard/heavy) remains the per-ticket dial (label/token/default) it is for every sensitive ticket; sensitivePaths forces the **design gate**, and heavy QA is set by the PM per the sensitivity — unchanged, and identical to the web paths.

### R2 — Admin DB-name allowlists, deny prod/reserved/test by construction (AC2)

Replace each env's single-app `dbNameAllow` regex with a combined default-deny regex that admits the website **and** `ministry-admin` test DBs:

| env       | current `dbNameAllow`                | new `dbNameAllow`                                      |
| --------- | ------------------------------------ | ------------------------------------------------------ |
| `preview` | `^website-(test\|qa\|e2e)$`          | `^(website\|ministry-admin)-(test\|qa\|e2e)$`          |
| `staging` | `^website-(test\|qa\|e2e\|staging)$` | `^(website\|ministry-admin)-(staging\|test\|qa\|e2e)$` |

By construction these deny — in **every** env — every dangerous target: bare `website`, bare `ministry-admin` (both prod), the literal `test` (the mongodb driver's silent no-DB-in-URI fallback), and the reserved system DBs `admin` / `local` / `config` (none carry the required `-(env)` suffix). Document the explicit deny set + the "QA resolves the DB name from `client.db().databaseName` (the `MONGODB_URI` path), not an env var" rule in the env's `*Note` string (`dbNote` for preview, `dbNameAllowNote` for staging). **No structured `dbNameDeny` field** (canon `additionalProperties:false`).

`mongoMcp` is unchanged (out of scope — this ticket is about allowlists, not MCP wiring).

### R3 — `playwrightProjectMap` admin entries (AC3)

Add forward-declared `apps/admin/*` → suite mappings (placeholder suites `apiAdmin` / `e2eAdmin`, provisioned by ICR-124), plus a note recording they're stubs so the choice is explicit, not silent:

```jsonc
"apps/admin/src/app/api": ["apiAdmin"],
"apps/admin/src/app": ["e2eAdmin"],
"apps/admin/src/middleware.ts": ["e2eAdmin"],
"apps/admin/src/service": ["apiAdmin", "e2eAdmin"],
"apps/admin/src/lib/auth": ["apiAdmin", "e2eAdmin"],
"apps/admin/src/components": ["e2eAdmin"],
"_adminNote": "apps/admin/* → apiAdmin / e2eAdmin are FORWARD-DECLARED: apps/admin and its Playwright project/config do not exist until ICR-124. Until then no admin path exists to match these keys (inert), and qa-runner degrades gracefully (reports an absent suite rather than inventing one). ICR-124 provisions the apiAdmin + e2eAdmin Playwright projects."
```

Mirrors the `apps/web` map's type split (api→api suite, pages→e2e suite, service/auth→both).

### R4 — Canon validity (AC4)

`.claude/config.json` must still validate against the `divinelab:canon` schema after the edits. All three edits are chosen to stay inside the schema (open array, open map with note-keys, `*Note` strings — no new structured fields). Verify with the `divinelab:canon` skill + a JSON-parse.

## Data Model Changes

None (no DB, no CMS, no content model). The only "schema" involved is the canon config schema, which is **not** modified — the edits are designed to fit it.

## API Changes

None.

## New / Modified Files

| File                                             | Change                                                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/config.json`                            | R1: +7 globs in `qa.autoMerge.sensitivePaths`. R2: rewrite both `qa.env.{preview,staging}.dbNameAllow` + extend their `*Note`. R3: +6 `apps/admin/*` keys + `_adminNote` in `playwrightProjectMap`. |
| `tasks/specs/ICR-140-admin-safety-rails.md`      | this spec (rides the PR)                                                                                                                                                                            |
| `tasks/specs/ICR-140-admin-safety-rails.plan.md` | the plan (rides the PR)                                                                                                                                                                             |

No app code, no docs/architecture change required (the config's own inline notes carry the rationale). Docs eval happens at step 13.5.

## Edge Cases

1. **`admin-test` (stale convention) must NOT be allowed.** The alternation is `(website|ministry-admin)`, so `admin-test` = reserved `admin` + `-test` does **not** match → denied. ✅ (the locked convention is `ministry-admin-test`).
2. **`ministry-admin-staging` on `preview`.** Preview's env group is `(test|qa|e2e)` (no `staging`) → `ministry-admin-staging` is denied on preview, allowed on staging. Mirrors website posture. ✅
3. **Bare `ministry-admin` / bare `website`** (production) — no `-(env)` suffix → denied in both envs. ✅
4. **Regex anchoring.** Both regexes are `^…$`-anchored; `ministry-admin-staging-test` etc. cannot sneak past the `$`. ✅
5. **Inert admin map keys today.** No `apps/admin` path exists, so the R3 keys match nothing until ICR-124 — zero behavior change to current web QA. ✅
6. **`_adminNote` value is a string, not an array.** Allowed because `_`-prefixed keys are note-keys (the existing `_note` string in the same map is the precedent). Verify in canon.

## i18n

N/A (harness config, no user-facing strings).

## Testing Strategy

- **Canon validation (AC4):** run the `divinelab:canon` skill against the edited config; must pass. Plus `node -e "JSON.parse(fs.readFileSync('.claude/config.json','utf8'))"` for a hard parse.
- **Regex proof (AC2):** a throwaway node assertion that the two new regexes ACCEPT `{website,ministry-admin}-{test,qa,e2e}` (+`-staging` on staging) and REJECT `website`, `ministry-admin`, `test`, `admin`, `local`, `config`, `admin-test`, and (preview) `ministry-admin-staging`. Paste the output in the PR body as evidence.
- **Grep parity (AC1/AC3):** assert the 7 admin globs are present in `sensitivePaths` and the admin keys + `_adminNote` are present in `playwrightProjectMap`.
- **Verify stack (standard depth):** `pnpm type-check` + `pnpm lint` + `pnpm test` + `pnpm build` — sanity only (config isn't compiled/tested/built), must stay green; not the real acceptance gate.
- No Vitest/unit test added: `.claude/config.json` is not imported by app code, so a runtime test would assert nothing meaningful. The canon-validate + regex-assert scripts are the meaningful gates (run in-line, not committed as suite tests).

## Implementation Checkpoints

**CP1 — the config edits (single checkpoint).**

- Files: `.claude/config.json`.
- Do R1, R2, R3 exactly as specified above.
- Verify: (a) `divinelab:canon` validation passes; (b) JSON parses; (c) the regex-assertion script passes (accept/reject sets above); (d) grep confirms all new entries present; (e) `pnpm type-check && pnpm lint && pnpm test` green.
- Commit: `chore(ICR-140): teach the harness about apps/admin — sensitivePaths, admin DB allowlist, Playwright map`

> Single checkpoint — the three edits are one cohesive, interdependent config change and share one verification pass. Splitting them would fragment a 3-region edit to one file with no isolation benefit.

## Open Questions

None. The three design decisions (glob precision, DB-deny expression, Playwright deferral vs. stub) were resolved at the design gate:

- Sensitive globs: ticket's 6 + `apps/admin/next.config.*`.
- DB deny: default-deny combined regex + `*Note` (canon-forced; no upstream `dbNameDeny` ticket).
- Playwright: **stub** `apiAdmin` / `e2eAdmin` now (forward-declared, `_adminNote` records ICR-124 provisions them).
