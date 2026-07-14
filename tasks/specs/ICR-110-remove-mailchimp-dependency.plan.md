# ICR-110 — Remove the dead Mailchimp dependency: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the 100%-dead `@mailchimp/*` dependency, its `@types` twin, and the `MAILCHIMP_*` env surface — and correct every engineering doc that still names Mailchimp as the newsletter provider.

**Architecture:** A pure removal with **zero behavior change** — not one line of the Resend path is modified. Correctness is proven negatively (the 508-test baseline must be _unchanged_, and `pnpm build` must still resolve every import once the packages vanish) and by a throwaway RED→GREEN grep harness whose failing output _is_ the reproduction of the documentation defect.

**Tech Stack:** pnpm workspace (Turborepo), Next.js 16, Vitest, semantic-release.

**Spec:** `tasks/specs/ICR-110-remove-mailchimp-dependency.md`

## Global Constraints

- **Worktree only.** All work happens in `.claude/worktrees/ICR-110` on branch `chore/ICR-110-remove-mailchimp-dependency`. Never touch the main checkout.
- **Zero behavior change.** No file under `src/service/resendAudience.ts`, `src/service/subscribe.service.ts`, or `src/app/api/subscribe/` may be modified.
- **Baseline is 508 passing tests / 49 files.** It must be **exactly 508** at the end. A _drop_ means a test was deleted; a _rise_ means scope leaked.
- **`RESEND_AUDIENCE_ID` (no locale suffix) MUST SURVIVE** everywhere — code, `.env.example`, `environment.d.ts`, and the CLAUDE.md/AGENTS.md prose explaining it. It is the legacy es-AR-only fallback that stops people being double-emailed. Deleting it is a production incident, not a cleanup.
- **Release rules** (`.releaserc.json`, verified): `feat`→minor · `fix`/`perf`/**`docs`**→patch · **`chore`→`false`**. All commits and the **PR title** use `chore(ICR-110):` → **no release is cut**.
- **Never `--no-verify`.** The husky hooks (lint-staged, commitlint) must run.
- **Do NOT touch:** `.husky/pre-commit`, `.vscode/settings.json`, `docs/product/**`, `tasks/specs/**` (other tickets' history), `scripts/trello-export.json`, `tasks/lessons.md`.

---

## Task 0 (RED): Build the AC harness and watch it fail

**Files:**

- Create: `$TMPDIR/icr110-check.sh` (throwaway — **never committed**)

**Interfaces:**

- Produces: a reusable pass/fail gate re-run verbatim in Task 4. Exit 0 = all ACs met.

- [ ] **Step 1: Write the harness**

It carries **negative** assertions (zero Mailchimp hits) _and_ **positive** assertions. The positives are what stop an over-delete: the `RESEND_AUDIENCE_ID` prose being removed sits _inside_ the same blockquotes as the Mailchimp callouts, and the `.husky`/`docs/product` mentions must SURVIVE.

> ⚠️ **Every search below uses `git grep` (TRACKED files only), never `grep -r`.** This is load-bearing, not
> style. An untracked, gitignored `apps/web/.env.local` holds the developer's **real Mailchimp credentials**.
> A recursive `grep -r` over `apps/` sweeps it up, which (a) prints live secret values into a report bound for
> a PR body and a Jira comment, and (b) makes GREEN **structurally unreachable** — `.env.local` is a local file
> that keeps its `MAILCHIMP_*` values until the human unsets them in **ICR-156**. `git grep` searches only what
> the repo actually ships, which is exactly what the ACs are about. (Found the hard way in CP1.)

```bash
cat > "${TMPDIR:-/tmp}/icr110-check.sh" <<'EOF'
#!/usr/bin/env bash
# ICR-110 acceptance harness. Throwaway — not committed.
# ALL searches use `git grep` => TRACKED files only. Never `grep -r`: it would sweep up the
# untracked, gitignored .env.local (real local secrets) and make GREEN unreachable.
cd "$(git rev-parse --show-toplevel)" || exit 2
fail=0
pass() { printf '  ✅ %s\n' "$1"; }
bad()  { printf '  ❌ %s\n' "$1"; fail=1; }

echo "== POSITIVE CONTROL (proves the search works at all) =="
ctl=$(git grep -lI -i 'resend' -- apps packages docs CLAUDE.md AGENTS.md 2>/dev/null | wc -l | tr -d ' ')
[ "$ctl" -ge 5 ] && pass "control: 'resend' matched in $ctl tracked files" \
                 || { bad "control matched $ctl files — THE SEARCH IS BROKEN, not the tree clean"; exit 2; }

echo "== NEGATIVE: zero 'mailchimp' in the AC2 footprint (tracked files only) =="
hits=$(git grep -nI -i 'mailchimp' -- apps packages docs/architecture CLAUDE.md AGENTS.md 2>/dev/null)
if [ -z "$hits" ]; then pass "AC2: 0 hits in apps/, packages/, docs/architecture/, CLAUDE.md, AGENTS.md"
else bad "AC2: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') hit(s) remain:"; printf '%s\n' "$hits" | sed 's/^/       /'; fi

echo "== NEGATIVE: zero 'mailchimp' in the harness config (the agent-harness.md twin) =="
if git grep -qI -i 'mailchimp' -- .claude/config.json 2>/dev/null; then bad ".claude/config.json still names Mailchimp"
else pass ".claude/config.json: clean"; fi

echo "== NEGATIVE: packages + lockfile =="
git grep -qI -i 'mailchimp' -- apps/web/package.json && bad "apps/web/package.json still declares a mailchimp package" || pass "package.json: clean"
git grep -qI -i 'mailchimp' -- pnpm-lock.yaml        && bad "pnpm-lock.yaml still resolves a mailchimp package"        || pass "pnpm-lock.yaml: clean"
for dead in 'superagent@3.8.1' 'dotenv@8.6.0'; do
  grep -q "$dead" pnpm-lock.yaml && bad "transitive $dead still in the lockfile" || pass "transitive $dead: gone"
done

echo "== POSITIVE: the RESEND_AUDIENCE_ID legacy fallback SURVIVED the blockquote deletions =="
grep -q 'RESEND_AUDIENCE_ID` (no locale suffix) is a legacy' CLAUDE.md \
  && pass "CLAUDE.md: legacy-fallback prose intact" || bad "CLAUDE.md: legacy-fallback prose was DESTROYED"
grep -q 'RESEND_AUDIENCE_ID` (no locale suffix) is a legacy' AGENTS.md \
  && pass "AGENTS.md: legacy-fallback prose intact" || bad "AGENTS.md: legacy-fallback prose was DESTROYED"
grep -q '^ *RESEND_AUDIENCE_ID: string;' apps/web/src/types/environment.d.ts \
  && pass "environment.d.ts: RESEND_AUDIENCE_ID still declared" || bad "environment.d.ts: RESEND_AUDIENCE_ID was deleted"
grep -q '^RESEND_AUDIENCE_ID=' apps/web/.env.example \
  && pass ".env.example: RESEND_AUDIENCE_ID still present" || bad ".env.example: RESEND_AUDIENCE_ID was deleted"

echo "== POSITIVE: the ICR-18 ref was CORRECTED to ICR-156, not merely deleted =="
grep -q 'ICR-156' docs/architecture/forms-and-email.md \
  && pass "forms-and-email.md: points at ICR-156" || bad "forms-and-email.md: no ICR-156 reference"

echo "== POSITIVE: out-of-scope mentions were NOT over-reached into =="
grep -qi 'mailchimp' .husky/pre-commit \
  && pass ".husky/pre-commit: secret-scan net intact (correctly untouched)" || bad ".husky/pre-commit: OVER-REACH — the secret-scan regex was removed"
grep -rqi 'mailchimp' docs/product/ \
  && pass "docs/product/: untouched (ICR-154's seam respected)" || bad "docs/product/: OVER-REACH — that belongs to ICR-154"

echo
[ "$fail" -eq 0 ] && echo "RESULT: GREEN — all ICR-110 acceptance criteria met" || echo "RESULT: RED — criteria unmet (see ❌ above)"
exit "$fail"
EOF
chmod +x "${TMPDIR:-/tmp}/icr110-check.sh"
```

- [ ] **Step 2: Run it against the UNTOUCHED tree and capture the RED**

Run: `"${TMPDIR:-/tmp}/icr110-check.sh" 2>&1 | tee "${TMPDIR:-/tmp}/icr110-RED.txt"`

**Expected: `RESULT: RED`, exit 1.** Specifically: the AC2 negative lists ~25 hits across the ~12 tracked files in the Task 3 worklist, `.claude/config.json` is flagged, and `package.json`/`pnpm-lock.yaml`/both transitives are flagged — while **every positive assertion already passes** (the prose, the `.husky` net, and `docs/product/` are all currently intact), and the `ICR-156` positive correctly fails (that's Task 3's job).

**STOP CONDITIONS — do not proceed, report instead:**

- If the **positive control** fails (`< 5` files match `resend`), the search itself is broken. Fix the harness; a broken grep prints nothing and reads exactly like a clean tree.
- If it reports **GREEN** on the untouched tree, the premise is wrong — stop and report.
- If **any hit is in an untracked file** (e.g. `apps/web/.env.local`), the harness has regressed to `grep -r`. Untracked files are out of scope by construction and may contain **real secrets** — never print their contents. Restore the `git grep` form.

> Capture the RED output for the PR body — but **read it before pasting it anywhere.** It is destined for a public PR and a Jira comment; no secret value may appear in it. With `git grep` this is safe by construction, since `.env*` is gitignored and therefore never searched.

Save the RED output verbatim; it goes in the PR body.

- [ ] **Step 3: No commit** (the harness is throwaway and lives outside the repo).

---

## Task 1: Drop the two packages and regenerate the lockfile

**Files:**

- Modify: `apps/web/package.json:31` (dependencies), `apps/web/package.json:67` (devDependencies)
- Modify: `pnpm-lock.yaml` (regenerated, not hand-edited)

**Interfaces:**

- Consumes: nothing.
- Produces: a tree with no Mailchimp packages. Tasks 2–3 assume the install is clean.

- [ ] **Step 1: Delete the dependency (`apps/web/package.json:31`)**

Remove this line from `"dependencies"`:

```json
    "@mailchimp/mailchimp_marketing": "^3.0.80",
```

- [ ] **Step 2: Delete the types twin (`apps/web/package.json:67`)**

Remove this line from `"devDependencies"`. **Note the name has no `/` after `@types` — a naive `@mailchimp/` grep misses it:**

```json
    "@types/mailchimp__mailchimp_marketing": "^3.0.21",
```

- [ ] **Step 3: Regenerate the lockfile**

Run from the **worktree root**: `pnpm install`

The lockfile is load-bearing: Vercel installs with `--frozen-lockfile`, so a stale `pnpm-lock.yaml` fails the **deploy**, not just CI. It must be committed.

- [ ] **Step 4: Verify the packages and their transitives are gone**

Run:

```bash
grep -ci mailchimp pnpm-lock.yaml || echo "0 mailchimp (good)"
grep -c 'superagent@3.8.1\|dotenv@8.6.0' pnpm-lock.yaml || echo "0 dead transitives (good)"
```

Expected: **0** for both. (`superagent@3.8.1` and `dotenv@8.6.0` were pulled in _only_ by `@mailchimp/mailchimp_marketing`.)

- [ ] **Step 5: Prove nothing depended on them — the test baseline must be UNCHANGED**

Run: `pnpm test`
Expected: **508 passed / 49 files** — identical to baseline. Any other number is a stop condition.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(ICR-110): drop the dead @mailchimp packages and regenerate the lockfile"
```

---

## Task 2: Delete the dead env surface + the stale code comment

**Files:**

- Modify: `apps/web/src/types/environment.d.ts:23-26`
- Modify: `apps/web/.env.example:41-44`
- Modify: `apps/web/src/service/broadcast/types.ts:13`

**Interfaces:**

- Consumes: Task 1's clean install.
- Produces: an env surface with no `MAILCHIMP_*`. `pnpm type-check` passing here is the _proof_ nothing read those declarations.

- [ ] **Step 1: Delete the `// MailChimp` block from `environment.d.ts` (lines 23–26)**

Delete exactly these four lines (the blank line separating it from `// Resend Broadcasts` collapses naturally):

```ts
// MailChimp
MAILCHIMP_API_KEY: string;
MAILCHIMP_API_SERVER: string;
MAILCHIMP_AUDIENCE_ID: string;
```

**Leave the `// Resend Broadcasts` block below it completely alone** — `RESEND_AUDIENCE_ID: string;` must survive.

- [ ] **Step 2: Delete the Mailchimp block from `.env.example` (lines 41–44)**

Delete the comment line and its three vars:

```
# Mailchimp API key and audience ID, you need to request that
MAILCHIMP_API_KEY=
MAILCHIMP_API_SERVER=
MAILCHIMP_AUDIENCE_ID=
```

**Do not touch `RESEND_AUDIENCE_ID_ES_AR` / `RESEND_AUDIENCE_ID_EN_US` / `RESEND_AUDIENCE_ID` below it.**

- [ ] **Step 3: Fix the stale comment in `broadcast/types.ts:13`**

The field feeds **Resend**, not Mailchimp. Change:

```ts
  /** Plain-text alternative (Mailchimp `plain_text`). */
  text: z.string().min(1),
```

to:

```ts
  /** Plain-text alternative. */
  text: z.string().min(1),
```

**Do not rename any field.** `campaignId` (in `BroadcastResult` / `BroadcastLogDocument`) keeps its name — it now holds a Resend broadcast id, and renaming it would be a Mongo data-model migration, violating the zero-behavior-change constraint.

- [ ] **Step 4: Verify — type-check is the real proof**

Run: `pnpm type-check`
Expected: **green**. This is the load-bearing check: if any code had read `process.env.MAILCHIMP_*`, deleting the declarations would now fail compilation.

Then confirm the survivors:

```bash
grep -n 'RESEND_AUDIENCE_ID' apps/web/src/types/environment.d.ts apps/web/.env.example
```

Expected: `RESEND_AUDIENCE_ID` present in **both**.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/types/environment.d.ts apps/web/.env.example apps/web/src/service/broadcast/types.ts
git commit -m "chore(ICR-110): remove the dead MAILCHIMP_* env declarations"
```

---

## Task 3: Correct every engineering doc that still names Mailchimp

**Files:**

- Modify: `CLAUDE.md:111`, `CLAUDE.md:164`, `CLAUDE.md:185-188`
- Modify: `AGENTS.md:42`, `AGENTS.md:101-104`
- Modify: `docs/architecture/forms-and-email.md:66-69`, `:127`, `:131-137`
- Modify: `docs/architecture/contributing.md:12`
- Modify: `docs/architecture/likes-and-mongodb.md:34`, `:48`
- Modify: `docs/architecture/agent-harness.md:289`
- Modify: `.claude/config.json:200`

**Interfaces:**

- Consumes: Tasks 1–2 (the claims below are only _true_ once the packages and env vars are actually gone).
- Produces: a GREEN AC harness.

> ⚠️ **The single biggest hazard in this task:** the ⚠️ blockquotes in `CLAUDE.md:185-188` and `AGENTS.md:101-104` each contain a **second paragraph** about `RESEND_AUDIENCE_ID` that is **correct and must survive**. Delete only the Mailchimp paragraph, never the whole blockquote.

- [ ] **Step 1: `CLAUDE.md:111` — drop the trailing Mailchimp clause**

Before:

```markdown
- **Newsletter** is **Resend** — contacts added to a **per-locale audience** via `/api/subscribe` → `src/service/subscribe.service.ts` → `resendAudience.ts` (client helper `src/service/subscribe.ts`). **Mailchimp is no longer used**; the `@mailchimp/*` dep and `MAILCHIMP_*` env vars are dead code pending removal (ICR-110).
```

After:

```markdown
- **Newsletter** is **Resend** — contacts added to a **per-locale audience** via `/api/subscribe` → `src/service/subscribe.service.ts` → `resendAudience.ts` (client helper `src/service/subscribe.ts`).
```

- [ ] **Step 2: `CLAUDE.md:160-165` — drop the now-false trailing sentence of the "Source of truth" blockquote**

`.env.example` no longer retains anything dead, so the caveat is obsolete. Before:

```markdown
> **Source of truth: `apps/web/.env.example` + `src/types/environment.d.ts`.** `.env.example` is
> **current** — it carries every runtime variable below (it was brought up to date during ICR-114).
> An older version of this doc claimed it was incomplete and that several vars were "missing"; that
> is no longer true. The one thing still wrong with it: it retains the **dead** `MAILCHIMP_*` vars
> (see the callout below) — ICR-110 removes them.
```

After:

```markdown
> **Source of truth: `apps/web/.env.example` + `src/types/environment.d.ts`.** `.env.example` is
> **current** — it carries every runtime variable below (it was brought up to date during ICR-114).
> An older version of this doc claimed it was incomplete and that several vars were "missing"; that
> is no longer true.
```

- [ ] **Step 3: `CLAUDE.md:185-191` — delete ONLY the Mailchimp paragraph, KEEP the fallback paragraph**

Before (lines 185–191):

```markdown
> ⚠️ **The `MAILCHIMP_*` vars are DEAD.** The newsletter moved to **Resend** (per-locale audiences).
> `MAILCHIMP_API_KEY` / `MAILCHIMP_API_SERVER` / `MAILCHIMP_AUDIENCE_ID` are still declared in
> `src/types/environment.d.ts` and listed in `.env.example`, but **nothing reads them** — setting
> them does nothing. ICR-110 removes them. Do not provision Mailchimp for a new deploy.
>
> `RESEND_AUDIENCE_ID` (no locale suffix) is a legacy single-audience fallback used only for the
> **default** locale when the per-locale var is unset (`src/service/resendAudience.ts`).
```

After (the fallback note survives, now standing alone):

```markdown
> `RESEND_AUDIENCE_ID` (no locale suffix) is a legacy single-audience fallback used only for the
> **default** locale when the per-locale var is unset (`src/service/resendAudience.ts`).
```

- [ ] **Step 4: `AGENTS.md:42` — drop the trailing Mailchimp clause**

Before:

```markdown
- **Email**: adapter pattern (`src/service/mailing.service.ts` selects `mailing/{sendgrid,resend}.adapter.ts` by `MAIL_PROVIDER`); templates in `src/templates/`. **Newsletter** = **Resend** contacts with **per-locale audiences** (`/api/subscribe` → `src/service/subscribe.service.ts` → `resendAudience.ts`). _Mailchimp is gone_ — the `@mailchimp/*` dep + `MAILCHIMP_*` env vars are dead code pending removal (ICR-110).
```

After:

```markdown
- **Email**: adapter pattern (`src/service/mailing.service.ts` selects `mailing/{sendgrid,resend}.adapter.ts` by `MAIL_PROVIDER`); templates in `src/templates/`. **Newsletter** = **Resend** contacts with **per-locale audiences** (`/api/subscribe` → `src/service/subscribe.service.ts` → `resendAudience.ts`).
```

- [ ] **Step 5: `AGENTS.md:101-107` — delete ONLY the Mailchimp paragraph, KEEP the fallback paragraph**

Before (lines 101–107):

```markdown
> ⚠️ **`MAILCHIMP_API_KEY` / `MAILCHIMP_API_SERVER` / `MAILCHIMP_AUDIENCE_ID` are DEAD.** The newsletter
> moved to **Resend** (per-locale audiences). They are still declared in `src/types/environment.d.ts` and
> listed in `.env.example`, but **nothing reads them** — setting them does nothing. ICR-110 removes them.
> **Do not provision Mailchimp for a new deploy.**
>
> `RESEND_AUDIENCE_ID` (no locale suffix) is a legacy single-audience fallback, used only for the
> **default** locale when the per-locale var is unset (`src/service/resendAudience.ts`).
```

After:

```markdown
> `RESEND_AUDIENCE_ID` (no locale suffix) is a legacy single-audience fallback, used only for the
> **default** locale when the per-locale var is unset (`src/service/resendAudience.ts`).
```

- [ ] **Step 6: `forms-and-email.md:66-69` — rewrite the ICR-44 blockquote; re-point ICR-18 → ICR-156**

ICR-18 is the _design-system_ story, not a Mailchimp decommission. The real decommission ticket is **ICR-156**. Before:

```markdown
> **ICR-44:** `/api/subscribe` was repointed from Mailchimp to Resend Contacts. Mailchimp env vars are
> kept in `.env.example` as a reference but are **no longer used** by the app; they can be removed when
> the Mailchimp account is decommissioned (ICR-18). Existing Mailchimp subscribers are **not** migrated
> — the Resend audiences populate exclusively from new signups (start fresh).
```

After (keeps the "not migrated / start fresh" fact, which is still load-bearing):

```markdown
> **ICR-44:** `/api/subscribe` writes to **Resend Contacts** (per-locale audiences). The previous
> provider's package and env vars were removed in ICR-110; unsetting the leftover Vercel variables and
> closing the old account is tracked in **ICR-156**. Subscribers were **not** migrated — the Resend
> audiences populate exclusively from new signups (start fresh).
```

- [ ] **Step 7: `forms-and-email.md:127` — delete the false "several are missing" claim**

All six vars below it ARE in `.env.example` (verified). Before:

```markdown
> All of these are **required at runtime but several are missing from `.env.example`** — flag and set them. Never put real values in docs or commits; reference names only.
```

After:

```markdown
> All of these are **required at runtime**. Never put real values in docs or commits; reference names only.
```

- [ ] **Step 8: `forms-and-email.md:129-137` — flip the six false ❌, and REPLACE the Mailchimp row with the real Resend audience vars**

Deleting the Mailchimp row alone would leave the table with **no** row for what `/api/subscribe` consumes — an operator-facing hole. AC6 ("the env table names **only** Resend") is satisfied by _replacing_ it. All values verified against `apps/web/.env.example`.

Before:

```markdown
| Variable                                                               | Used by                                      | In `.env.example`? |
| ---------------------------------------------------------------------- | -------------------------------------------- | :----------------: |
| `MAIL_PROVIDER` (`sendgrid`\|`resend`)                                 | `mailing.service.ts`                         |     ❌ missing     |
| `CONTACT_FORM_RECIPIENT_EMAIL`                                         | `contact-form-email.service.ts`              |     ❌ missing     |
| `FROM_EMAIL`                                                           | `mailing.service.ts`                         |     ❌ missing     |
| `SENDGRID_API_KEY`                                                     | `sendgrid.adapter.ts` (if provider=sendgrid) |     ❌ missing     |
| `RESEND_API_KEY`                                                       | `resend.adapter.ts` (if provider=resend)     |     ❌ missing     |
| `MONGODB_URI`                                                          | `contact.service.ts`                         |     ❌ missing     |
| `MAILCHIMP_API_KEY` / `MAILCHIMP_API_SERVER` / `MAILCHIMP_AUDIENCE_ID` | `/api/subscribe`                             |     ✅ present     |
```

After:

```markdown
| Variable                               | Used by                                               | In `.env.example`? |
| -------------------------------------- | ----------------------------------------------------- | :----------------: |
| `MAIL_PROVIDER` (`sendgrid`\|`resend`) | `mailing.service.ts`                                  |         ✅         |
| `CONTACT_FORM_RECIPIENT_EMAIL`         | `contact-form-email.service.ts`                       |         ✅         |
| `FROM_EMAIL`                           | `mailing.service.ts`                                  |         ✅         |
| `SENDGRID_API_KEY`                     | `sendgrid.adapter.ts` (if provider=sendgrid)          |         ✅         |
| `RESEND_API_KEY`                       | `resend.adapter.ts` (if provider=resend) + newsletter |         ✅         |
| `MONGODB_URI`                          | `contact.service.ts`                                  |         ✅         |
| `RESEND_AUDIENCE_ID_ES_AR`             | `/api/subscribe` → `resendAudience.ts` (`es-AR`)      |         ✅         |
| `RESEND_AUDIENCE_ID_EN_US`             | `/api/subscribe` → `resendAudience.ts` (`en-US`)      |         ✅         |
| `RESEND_AUDIENCE_ID`                   | legacy single-audience fallback (default locale only) |         ✅         |
```

- [ ] **Step 9: `contributing.md:12` — drop Mailchimp AND the stale "incomplete" claim**

Before:

```markdown
- A `.env` with the **required** variables — copy from `CLAUDE.md`'s env tables, **not** just from `.env.example` (which is incomplete; see below). Ask @gdamalis for the Contentful / Mailchimp / Mongo / mail-provider credentials.
```

After:

```markdown
- A `.env` with the **required** variables — see `CLAUDE.md`'s env tables or copy from `.env.example`. Ask @gdamalis for the Contentful / Mongo / mail-provider credentials.
```

- [ ] **Step 10: `likes-and-mongodb.md:34` and `:48` — the broadcast log now records Resend**

Line 34, before → after:

```
  campaignId?: string; // Mailchimp campaign id, set on success
  campaignId?: string; // Resend broadcast id, set on success
```

Line 48, before → after:

```
insert, the unique index throws E11000, and the engine interprets that as `already-sent` — no second
Mailchimp send. A `failed` doc matches the filter and is re-claimed (retryable). No doc → upserted
```

```
insert, the unique index throws E11000, and the engine interprets that as `already-sent` — no second
Resend broadcast. A `failed` doc matches the filter and is re-claimed (retryable). No doc → upserted
```

**The field name `campaignId` does not change** — only the comment describing it.

- [ ] **Step 11: `agent-harness.md:289` and `.claude/config.json:200` — the twin sentence, fixed together**

Both carry the identical stale claim. Fixing one and leaving the other is the cross-file contradiction that misleads every future agent session.

`agent-harness.md:289`, before → after:

```
  `/api/subscribe` or `/api/contact` — Mailchimp/SendGrid/Resend are presumed LIVE on staging unless sandbox
  `/api/subscribe` or `/api/contact` — SendGrid/Resend are presumed LIVE on staging unless sandbox
```

`.claude/config.json:200` (`qa.env.staging.liveIntegrationNote`), the same one-word deletion:

```
... BUT Mailchimp/SendGrid/Resend are presumed LIVE on staging unless sandbox creds exist ...
... BUT SendGrid/Resend are presumed LIVE on staging unless sandbox creds exist ...
```

- [ ] **Step 12: Prove the `.claude/config.json` edit is semantically a ONE-VALUE change**

`.claude/config.json` is in the prettier backlog, so the husky `lint-staged` hook may churn ~140 unrelated lines around this 1-word edit. Don't ask a reviewer to trust that diff — prove it structurally:

```bash
node -e '
const cp=require("child_process"), a=JSON.parse(cp.execSync("git show HEAD:.claude/config.json",{maxBuffer:1e8})), b=require("./.claude/config.json");
const flat=(o,p="",out={})=>{for(const k in o){const v=o[k],key=p?p+"."+k:k; v&&typeof v==="object"?flat(v,key,out):out[key]=v}return out};
const fa=flat(a), fb=flat(b);
const added=Object.keys(fb).filter(k=>!(k in fa)), removed=Object.keys(fa).filter(k=>!(k in fb));
const changed=Object.keys(fa).filter(k=>k in fb && fa[k]!==fb[k]);
console.log(`keys added: ${added.length}, removed: ${removed.length}, values changed: ${changed.length}`);
changed.forEach(k=>console.log("  changed:",k));
'
```

Expected: **`keys added: 0, removed: 0, values changed: 1`** → `qa.env.staging.liveIntegrationNote`. Paste this output in the commit body and the PR.

- [ ] **Step 13: Run the AC harness — it must now be GREEN**

Run: `"${TMPDIR:-/tmp}/icr110-check.sh" 2>&1 | tee "${TMPDIR:-/tmp}/icr110-GREEN.txt"`
Expected: **`RESULT: GREEN`**, exit 0 — every negative at zero AND every positive still matching (the fallback prose survived, `.husky` intact, `docs/product/` untouched, `ICR-156` referenced).

If a **positive** assertion fails, you over-deleted. Restore the destroyed prose — do not "fix" the harness.

- [ ] **Step 14: Commit**

```bash
git add CLAUDE.md AGENTS.md docs/architecture/forms-and-email.md docs/architecture/contributing.md \
        docs/architecture/likes-and-mongodb.md docs/architecture/agent-harness.md .claude/config.json
git commit -m "chore(ICR-110): correct every engineering doc that still names Mailchimp"
```

---

## Task 4 (GREEN): Full verification and harness teardown

**Files:** none modified.

- [ ] **Step 1: Run the full stack**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
Expected: all green. `pnpm test` must report **508 passed / 49 files** — identical to the pre-change baseline.

- [ ] **Step 2: Confirm the three Resend suites passed unchanged**

They must not have been edited at all:

```bash
git diff --name-only origin/main...HEAD | grep -E 'subscribe|resendAudience' && echo "STOP: a Resend file was modified" || echo "✅ no Resend file touched"
```

Expected: **`✅ no Resend file touched`**. (`resendAudience.test.ts` 3 tests, `subscribe.service.test.ts` 4, `app/api/subscribe/route.test.ts` 9 — all pass within the 508.)

- [ ] **Step 3: Confirm the real change set (three-dot diff)**

Run: `git diff --name-only origin/main...HEAD`
Expected exactly these 12 files (+ the spec/plan docs):

```
.claude/config.json
AGENTS.md
CLAUDE.md
apps/web/.env.example
apps/web/package.json
apps/web/src/service/broadcast/types.ts
apps/web/src/types/environment.d.ts
docs/architecture/agent-harness.md
docs/architecture/contributing.md
docs/architecture/forms-and-email.md
docs/architecture/likes-and-mongodb.md
pnpm-lock.yaml
```

Use the **three-dot** form — a two-dot diff against an advanced `main` silently reports other tickets' commits as yours.

- [ ] **Step 4: Delete the throwaway harness and confirm it never entered the repo**

```bash
rm -f "${TMPDIR:-/tmp}/icr110-check.sh"
git status --porcelain | grep -i 'icr110' && echo "STOP: harness leaked into the repo" || echo "✅ harness not in the tree"
```

Expected: **`✅ harness not in the tree`**.

- [ ] **Step 5: No commit** — this task only verifies. The RED and GREEN outputs captured in Tasks 0 and 3 go into the PR body as the evidence this ticket delivered value.
