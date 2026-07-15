# ICR-140 Admin Safety Rails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the divinelab harness about the future `apps/admin` app by adding admin coverage to three regions of repo-root `.claude/config.json` — before the ICR-124 scaffold exists.

**Architecture:** Config-only. One file (`.claude/config.json`), three additive/rewrite edits: (1) sensitive-paths globs, (2) per-env DB-name allowlist regexes + Notes, (3) playwrightProjectMap admin keys. Every edit is chosen to stay inside the `divinelab:canon` schema (open array, open map with note-keys, `*Note` strings — no new structured fields).

**Tech Stack:** JSON config; `divinelab:canon` skill for schema validation; Node for a throwaway regex proof; pnpm/Turbo verify stack.

## Global Constraints

- **Only file changed:** `.claude/config.json` (repo root). No app code, no docs/architecture edit. (Spec: Scope.)
- **Canon schema is NOT modified** — edits must fit `additionalProperties:false` on `$defs.qaEnvironment` (so **no `dbNameDeny` field**; denials go in `*Note` strings) and the open `sensitivePaths` array / `playwrightProjectMap` map. (Spec: R4, Dependencies Check.)
- **Locked fact:** admin production DB is `ministry-admin` (+ `ministry-admin-staging`); name rides in `MONGODB_URI`, no `ADMIN_DB_NAME`. Reserved `admin` is a distinct system DB and must be denied. (Spec: Context.)
- **Commit type is `chore`** (Task). PR title decides release; `chore` = no release. (Repo `.releaserc.json`: `chore` is the only explicit no-release type.)
- **Preserve JSON validity:** every array/object edit keeps correct commas; the file must `JSON.parse` clean.

---

### Task 1: The three config edits (single checkpoint)

**Files:**

- Modify: `.claude/config.json` — `qa.autoMerge.sensitivePaths` (~L222–239), `qa.env.preview.dbNameAllow`+`dbNote` (L181–182), `qa.env.staging.dbNameAllow`+`dbNameAllowNote` (L202–203), `playwrightProjectMap` (~L358–377).
- Test: none committed — the meaningful gates are the canon-validate + regex-proof scripts run inline (Steps 5–8). `.claude/config.json` is not imported by app code, so a Vitest unit would assert nothing.

**Interfaces:**

- Consumes: nothing from prior tasks (first + only task).
- Produces: a config that (a) validates against `divinelab:canon`, (b) lists 7 `apps/admin/*` globs in `sensitivePaths`, (c) has combined default-deny `dbNameAllow` regexes admitting `ministry-admin` test DBs, (d) maps `apps/admin/*` → `apiAdmin`/`e2eAdmin` with an `_adminNote`.

---

- [ ] **Step 1: Edit R1 — add 7 admin globs to `sensitivePaths`.**

Anchor on the last web entry + array close. Replace:

```json
        ".github/**"
      ],
```

with:

```json
        ".github/**",
        "apps/admin/src/app/**",
        "apps/admin/src/middleware.ts",
        "apps/admin/src/service/**",
        "apps/admin/src/lib/auth/**",
        "apps/admin/**/permissions*",
        "apps/admin/package.json",
        "apps/admin/next.config.*"
      ],
```

(Note: the `.github/**` line gains a trailing comma; the 7 admin globs follow. This anchor is unique to
the `sensitivePaths` block — the identical `.github/**` string appears only here. `apps/admin/src/app/**`
(broadened from an `api/**`-only glob per Codex P2 on PR #100) covers the entire admin app-router
surface — api route handlers, the `(app)` protected RSC loaders + co-located Server Actions enforcing
`requirePermission`, and the `(auth)` pages — in one glob.)

- [ ] **Step 2: Edit R2a — preview `dbNameAllow` regex + `dbNote`.**

Replace (L181–182):

```json
        "dbNameAllow": "^website-(test|qa|e2e)$",
        "dbNote": "Mongo backs ONLY the blog 'likes' + saved 'contact' messages, in a DB literally named 'website'. The allowlist excludes 'website' so QA never reads/writes production data. Phase 1: no Mongo writes at all.",
```

with:

```json
        "dbNameAllow": "^(website|ministry-admin)-(test|qa|e2e)$",
        "dbNote": "Mongo backs the website (blog 'likes' + saved 'contact', DB 'website') AND the admin app (congregant PII, DB 'ministry-admin'). This is a DEFAULT-DENY allowlist: preview QA may only touch '{website,ministry-admin}-{test,qa,e2e}'. Denied in EVERY env by construction (they lack the required -(env) suffix): the PROD DBs (bare 'website', bare 'ministry-admin'), the literal 'test' (the mongodb driver's silent no-DB-in-URI fallback), and the reserved system DBs 'admin'/'local'/'config'. QA resolves the target DB name from the connection URI via client.db().databaseName (the MONGODB_URI path) — NOT from an env var (there is no ADMIN_DB_NAME). Phase 1: no Mongo writes at all.",
```

- [ ] **Step 3: Edit R2b — staging `dbNameAllow` regex + `dbNameAllowNote`.**

Replace (L202–203):

```json
        "dbNameAllow": "^website-(test|qa|e2e|staging)$",
        "dbNameAllowNote": "Now INCLUDES 'website-staging' (the real staging DB). Prod 'website' stays excluded — never read/write it.",
```

with:

```json
        "dbNameAllow": "^(website|ministry-admin)-(staging|test|qa|e2e)$",
        "dbNameAllowNote": "INCLUDES the real staging DBs 'website-staging' AND 'ministry-admin-staging'. DEFAULT-DENY by construction (no -(env) suffix ⇒ denied in EVERY env): the PROD DBs (bare 'website', bare 'ministry-admin'), the literal 'test' (driver's silent no-DB-in-URI fallback), and reserved 'admin'/'local'/'config'. Note 'ministry-admin-staging' is allowed on STAGING only, never on preview. QA resolves the DB name from client.db().databaseName (the MONGODB_URI path), not an env var (no ADMIN_DB_NAME).",
```

- [ ] **Step 4: Edit R3 — add admin keys + `_adminNote` to `playwrightProjectMap`.**

Anchor on the last web map entry + map close. Replace (L376–377):

```json
    "apps/web/config/headers.js": ["e2ePublic"]
  }
```

with:

```json
    "apps/web/config/headers.js": ["e2ePublic"],
    "apps/admin/src/app/api": ["apiAdmin"],
    "apps/admin/src/app": ["e2eAdmin"],
    "apps/admin/src/middleware.ts": ["e2eAdmin"],
    "apps/admin/src/service": ["apiAdmin", "e2eAdmin"],
    "apps/admin/src/lib/auth": ["apiAdmin", "e2eAdmin"],
    "apps/admin/src/components": ["e2eAdmin"],
    "_adminNote": "apps/admin/* -> apiAdmin / e2eAdmin are FORWARD-DECLARED: apps/admin and its Playwright project/config do not exist until ICR-124. Until then no admin path exists to match these keys (inert), and qa-runner degrades gracefully (reports an absent suite rather than inventing one). ICR-124 provisions the apiAdmin + e2eAdmin Playwright projects."
  }
```

(`apps/web/config/headers.js` line gains a trailing comma. `_adminNote` is a string value — allowed because `_`-prefixed keys are note-keys, exactly like the existing `_note` string at the top of this map.)

- [ ] **Step 5: Verify JSON parses.**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/config.json','utf8')); console.log('JSON OK')"
```

Expected: `JSON OK` (no SyntaxError).

- [ ] **Step 6: Regex accept/reject proof (AC2 evidence).**

Run this throwaway node assertion (paste its output into the PR body):

```bash
node -e '
const cfg = JSON.parse(require("fs").readFileSync(".claude/config.json","utf8"));
const preview = new RegExp(cfg.qa.env.preview.dbNameAllow);
const staging = new RegExp(cfg.qa.env.staging.dbNameAllow);
const accept = {
  preview: ["website-test","website-qa","website-e2e","ministry-admin-test","ministry-admin-qa","ministry-admin-e2e"],
  staging: ["website-staging","ministry-admin-staging","website-test","ministry-admin-e2e"],
};
const reject = ["website","ministry-admin","test","admin","local","config","admin-test"];
let ok = true;
for (const s of accept.preview) if(!preview.test(s)){ok=false;console.log("FAIL preview should accept",s);}
for (const s of accept.staging) if(!staging.test(s)){ok=false;console.log("FAIL staging should accept",s);}
for (const s of [...reject,"ministry-admin-staging"]) if(preview.test(s)){ok=false;console.log("FAIL preview should reject",s);}
for (const s of reject) if(staging.test(s)){ok=false;console.log("FAIL staging should reject",s);}
console.log(ok ? "REGEX PROOF PASS" : "REGEX PROOF FAIL");
process.exit(ok?0:1);
'
```

Expected: `REGEX PROOF PASS` (note: `ministry-admin-staging` must be REJECTED by preview, ACCEPTED by staging).

- [ ] **Step 7: Grep parity checks (AC1/AC3 evidence).**

Run:

```bash
grep -c "apps/admin/" .claude/config.json          # expect >= 13 (7 sensitivePaths + 6 map keys)
grep -q '"apps/admin/src/lib/auth/\*\*"' .claude/config.json && echo "sensitivePath auth glob OK"
grep -q '"_adminNote"' .claude/config.json && echo "adminNote OK"
grep -q '"apiAdmin"' .claude/config.json && grep -q '"e2eAdmin"' .claude/config.json && echo "admin suites OK"
```

Expected: count `>= 13`, then `sensitivePath auth glob OK`, `adminNote OK`, `admin suites OK`.

- [ ] **Step 8: Canon schema validation (AC4).**

Validate `.claude/config.json` against the `divinelab:canon` schema (invoke the `divinelab:canon` skill, or validate against `~/.claude/plugins/cache/divinelab/divinelab/*/skills/canon/config.schema.json` with a JSON-schema validator). Expected: **PASS**, no `additionalProperties`/type violations. If it fails on a `dbNameDeny`-style structured field, that's a spec violation — the denials must be in `*Note` strings only.

- [ ] **Step 9: Standard verify stack (sanity only).**

Run from the worktree root:

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

Expected: all green (config isn't compiled/tested/built — this only confirms no pre-existing breakage). If `pnpm build` fails with `ERR_INVALID_URL`/`NEXT_PUBLIC_BASE_URL undefined`, that's the known fresh-worktree env trap — `apps/web/.env.local` was pre-copied during worktree setup; confirm it's present, don't re-dispatch on an env failure.

- [ ] **Step 10: Commit.**

```bash
git add .claude/config.json
git commit -m "chore(ICR-140): teach the harness about apps/admin — sensitivePaths, admin DB allowlist, Playwright map"
```

---

## Self-Review

- **Spec coverage:** R1→Step 1 (AC1). R2→Steps 2–3 + Step 6 proof (AC2). R3→Step 4 (AC3). R4→Step 8 (AC4). All spec requirements have a task. ✅
- **Placeholder scan:** every edit shows exact before/after JSON; no TBD/TODO. ✅
- **Type consistency:** suite names `apiAdmin`/`e2eAdmin` used identically in Step 4 and asserted in Step 7. DB name `ministry-admin` used identically across Steps 2, 3, 6. ✅
- **Edge cases from spec covered by the Step 6 proof:** `admin-test` rejected, `ministry-admin-staging` preview-rejected/staging-accepted, bare prod names rejected, reserved DBs rejected. ✅
