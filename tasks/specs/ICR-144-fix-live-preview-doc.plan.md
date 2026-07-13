# ICR-144 — Live Preview Doc Correction: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite § Live Preview of `docs/architecture/contentful-data-layer.md` so it describes the
Live Preview mechanism as it actually works (a `previewLike` env gate + direct page URLs on staging)
instead of the wrong, secret-leaking `/api/draft/enable?secret=…` Content Preview URL.

**Architecture:** Pure documentation edit to one section of one file. Three sub-edits inside § Live
Preview: fix the section intro, extend the (already-correct) CSP env-gating block to name all three
Vercel tiers, and fully replace the "Editor setup" block. No code, no config, no behavior change.

**Tech Stack:** Markdown. Prettier (`pnpm format:check`) is the only formatter that touches `docs/**`.

**Spec:** `tasks/specs/ICR-144-fix-live-preview-doc.md`
**Worktree:** `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144`
**Branch:** `docs/ICR-144-fix-live-preview-doc`

## Global Constraints

- **Docs-only.** Do **not** edit `apps/web/src/app/api/draft/enable/route.ts` or any other code/config
  file. No new route params. If you feel tempted to change code, stop — that is out of scope by design.
- **Never write a secret value.** Reference `CONTENTFUL_PREVIEW_SECRET` by **name** only. This is the
  defect the ticket exists to remove; reintroducing it fails the ticket.
- **State what the code does, not what the ticket said.** The real gate is
  `previewLike = VERCEL_ENV === "preview" || NODE_ENV === "development"` (`apps/web/config/headers.js:4-6`).
  The Jira text says only `VERCEL_ENV === "preview"` — it is incomplete. Write the code's condition.
- **Scope every grep to § Live Preview.** Line 122 — in the _Draft mode_ section, **above** § Live
  Preview — legitimately mentions `/api/draft/enable?secret=…&locale=…` as the **production draft
  opt-in**, and it is **correct**. Leave line 122 alone. A whole-file grep for `draft/enable?secret=`
  will hit it and read as a false failure.
- **Prettier baseline:** the repo has known repo-wide Prettier drift (~173 files, tracked as
  **ICR-134**), but `docs/architecture/contentful-data-layer.md` **passes `prettier --check` today**.
  The bar is that this file still passes after the edit. Check the file specifically, not just the
  repo-wide script.
- Prose style: match the file — bold lead-ins, ~100-column wrapping, backticked identifiers, tables
  for enumerable facts.

---

### Task 1: Rewrite § Live Preview

**Files:**

- Modify: `docs/architecture/contentful-data-layer.md` (§ Live Preview, lines 126-187)

**Interfaces:**

- Consumes: nothing (first and only task).
- Produces: the corrected § Live Preview. No downstream task depends on it.

The section has three sub-edits: **1a** the intro, **1b** the CSP env-gating block, **1c** the editor
setup block. Do all three, then verify once.

- [ ] **Step 1: Capture the "before" state so the verification greps are meaningful**

Run from the worktree root:

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
sed -n '126,188p' docs/architecture/contentful-data-layer.md
```

Expected: the section as described in the spec, with the bad URL template at line 181
(`<preview-deploy-url>/api/draft/enable?secret=<CONTENTFUL_PREVIEW_SECRET value>&locale=<locale>`).
Confirm the line numbers still match before editing — if they drifted, re-locate by content, not by
number.

- [ ] **Step 2 (1a): Replace the section intro**

Find this paragraph (currently lines 128-132):

```markdown
Editors can open the home + community/Creed pages inside Contentful's **Live Preview** pane on a
Vercel preview deployment and see field edits reflect in real time, plus an inspector overlay that
click-jumps from rendered content back to the field being edited. Additive and **preview-only**; the
production fetch path, `/api/revalidate`, and `revalidateTag` above are untouched. First-pass scope
is the **home** + **community/Creed** components only — other content types are not yet live-wired.
```

Replace it with:

```markdown
Editors can open the home + community/Creed pages inside Contentful's **Live Preview** pane — on the
**staging** deployment (the standing target) or on any per-PR preview — and see field edits reflect in
real time, plus an inspector overlay that click-jumps from rendered content back to the field being
edited. Additive and **draft-only**; the production fetch path, `/api/revalidate`, and `revalidateTag`
above are untouched. First-pass scope is the **home** + **community/Creed** components only — other
content types are not yet live-wired.
```

(Only two changes: name staging as the standing target, and `preview-only` → `draft-only`, since the
gate is draft mode, not the Vercel "Preview" tier specifically.)

- [ ] **Step 3 (1b): Extend the CSP env-gating block to name all three tiers**

Find the opening of the CSP block (currently lines 159-167):

```markdown
**CSP env-gating.** `config/headers.js` delegates to the pure, unit-tested
`buildSecurityHeaders({ previewLike })` in `config/securityHeaders.js`, branching on
`VERCEL_ENV`/`NODE_ENV`:

- **Production** (default branch): strict clickjacking protection — `X-Frame-Options: SAMEORIGIN`
  **and** `frame-ancestors 'self'` (no Contentful origins). Production is never Contentful-framable.
- **Preview / dev** (`VERCEL_ENV==='preview'` or `NODE_ENV==='development'`): `X-Frame-Options` is
  **omitted entirely** and `frame-ancestors` additionally allows `https://app.contentful.com` and
  `https://app.eu.contentful.com`.
```

Replace with (keeps both bullets verbatim in meaning; adds the explicit flag + the three-tier table):

````markdown
**CSP env-gating.** `config/headers.js` delegates to the pure, unit-tested
`buildSecurityHeaders({ previewLike })` in `config/securityHeaders.js`, branching on a single flag:

```js
const previewLike = VERCEL_ENV === "preview" || NODE_ENV === "development";
```

- **Production** (default branch): strict clickjacking protection — `X-Frame-Options: SAMEORIGIN`
  **and** `frame-ancestors 'self'` (no Contentful origins). Production is never Contentful-framable.
- **Preview / dev** (`previewLike`): `X-Frame-Options` is **omitted entirely** and `frame-ancestors`
  additionally allows `https://app.contentful.com` and `https://app.eu.contentful.com`.

The **same** flag also drives `shouldUseDraftMode()` (`lib/contentful/draftMode.ts`), so one condition
turns on draft content **and** opens the frame. Across the three Vercel tiers:

| Tier                 | Host                          | `previewLike` | Contentful-framable? | Live Preview role                                  |
| -------------------- | ----------------------------- | :-----------: | :------------------: | -------------------------------------------------- |
| **Production**       | `www.idcredentor.org`         |       ✗       |        **No**        | Deliberately never a preview target                |
| **Preview** (per-PR) | `*-git-<branch>-*.vercel.app` |       ✓       |         Yes          | Works, but the host changes every PR               |
| **Staging**          | `staging.idcredentor.org`     |       ✓       |         Yes          | **Stable host → the standing Live Preview target** |

Staging is a Vercel **branch** deployment, so Vercel injects `VERCEL_ENV=preview` there — the same
branch as a per-PR preview, but on a hostname that doesn't rot when a PR merges.
````

Leave the two paragraphs that follow (the `X-Frame-Options`-vs-`frame-ancestors` **Gotcha**, and the
`next.config.ts` build-time note, currently lines 169-175) **exactly as they are** — they are correct.

- [ ] **Step 4 (1c): Replace the "Editor setup" block — the actual defect**

Delete this entire block (currently lines 177-187):

````markdown
**Editor setup (one-time, human, per environment).** In Contentful: **Settings → Content preview**,
add a Content Preview URL of the form:

```
<preview-deploy-url>/api/draft/enable?secret=<CONTENTFUL_PREVIEW_SECRET value>&locale=<locale>
```

Reference the secret by the environment variable **name** `CONTENTFUL_PREVIEW_SECRET` — never paste
its value into the Contentful UI notes or into docs/commits. This only works against a **preview**
deployment: production intentionally cannot be framed by Contentful (see CSP env-gating above), so
there is no production Content Preview URL to configure.
````

Replace it with:

```markdown
**Editor setup (one-time, human).** Live Preview needs **no secret, no cookie, and no query string** —
`previewLike` alone serves draft content _and_ allows the Contentful iframe. So a Content Preview URL
is simply **the page's own URL** on a framable host.

In Contentful → **Settings → Content preview**, create **two** preview environments:

| Preview environment | Content Preview URL                                  |
| ------------------- | ---------------------------------------------------- |
| Home                | `https://staging.idcredentor.org/{locale}`           |
| Community / Creed   | `https://staging.idcredentor.org/{locale}/community` |

`{locale}` is `es-AR` (the default) or `en-US`.

**Why two.** Contentful configures a preview URL **per content type**, but here entry→page is
**many-to-many**: the same content type — and even the same _entry_ — renders on both pages
(`contactCta` is a `section`; `ourMissionCollection` is a `contentCollection`; both appear on home
**and** on community). No single URL per content type can disambiguate, so the editor chooses the
preview environment instead. The rule generalizes: **one preview environment per page**, not per type —
a future content type on a third page needs a third preview environment.

> ⚠️ **Two unrelated things are called "staging".** The Vercel **staging deployment** (a hosting tier)
> is not the Contentful **`staging` environment** (the model-work content env — see
> `contentful-environments.md`). A Live Preview target must read the content env editors actually
> author in: `lib/contentful/fetch.ts` resolves `CONTENTFUL_ENVIRONMENT ?? "master"`, and the `master`
> alias points at `production`, where editors author. So **`CONTENTFUL_ENVIRONMENT` must stay unset on
> the staging deployment** (it is). Setting it to `staging` would silently aim the preview pane at the
> model-work env — blank or stale content, with **no error**.

**Not `/api/draft/enable`.** That route is not on the Live Preview path at all. Its only remaining role
is the **production draft opt-in**: it validates `CONTENTFUL_PREVIEW_SECRET`, enables Next draft mode,
and **always redirects to `/{locale}`** (the home page — it cannot deep-link to `/community` or a blog
post); `/api/draft/disable` turns it back off. Never use it as a Content Preview URL, and **never paste
the value** of `CONTENTFUL_PREVIEW_SECRET` into a Contentful settings field — reference secrets by
**name** only.

Production has no Content Preview URL by design: it is intentionally not Contentful-framable (see CSP
env-gating above).

> Actually performing this Contentful configuration is **ICR-135** (human-only — no MCP/CMA path exists
> for content-preview settings).
```

- [ ] **Step 5: Verify the section reads correctly end-to-end**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
awk '/^## Live Preview$/,/^## On-demand revalidation$/' docs/architecture/contentful-data-layer.md
```

Read it as an editor would. Expected: no sentence contradicts another; the mechanism is stated once
and clearly; nothing still implies a secret or a query string is needed for Live Preview.

- [ ] **Step 6: Run the negative assertions (the ACs are absence claims — test them as such)**

Scope to § Live Preview only. Line 122 is **above** the section and correctly documents the production
opt-in; it must survive.

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
SECTION=$(awk '/^## Live Preview$/,/^## On-demand revalidation$/' docs/architecture/contentful-data-layer.md)

# AC-1: no draft/enable Content Preview URL form, no pasted-secret instruction, inside the section
echo "$SECTION" | grep -n 'draft/enable?secret=' && echo "FAIL: URL form still present" || echo "PASS: no draft/enable?secret= form"
echo "$SECTION" | grep -n '<CONTENTFUL_PREVIEW_SECRET value>' && echo "FAIL: secret-value placeholder present" || echo "PASS: no secret-value placeholder"

# The production opt-in mention OUTSIDE the section must still exist (guard against over-deletion)
grep -n 'opt into drafts in production' docs/architecture/contentful-data-layer.md \
  && echo "PASS: line ~122 production opt-in preserved" || echo "FAIL: over-deleted line 122"
```

Expected: three PASS lines, zero FAIL lines.

- [ ] **Step 7: Run the positive assertions**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
SECTION=$(awk '/^## Live Preview$/,/^## On-demand revalidation$/' docs/architecture/contentful-data-layer.md)
for s in 'staging.idcredentor.org/{locale}/community' 'previewLike' 'www.idcredentor.org' \
         'vercel.app' 'CONTENTFUL_ENVIRONMENT' 'always redirects to `/{locale}`' 'ICR-135'; do
  echo "$SECTION" | grep -qF "$s" && echo "PASS: $s" || echo "FAIL missing: $s"
done
```

Expected: seven PASS lines. (Covers every acceptance criterion: the two direct URLs, the true
mechanism, all three tiers, the `CONTENTFUL_ENVIRONMENT` warning, the home-redirect fact, the ICR-135
cross-reference.)

- [ ] **Step 8: Formatting + lint**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
pnpm exec prettier --check docs/architecture/contentful-data-layer.md
```

Expected: `All matched files use Prettier code style!`

If it fails, run `pnpm exec prettier --write docs/architecture/contentful-data-layer.md` and re-check.
(Markdown tables are the usual culprit — Prettier re-pads the column widths. Let it.)

```bash
pnpm lint
```

Expected: pass. ESLint does not read `docs/**`, so this is a no-regression check, not a real gate on
this diff.

> Do **not** run `pnpm format:check` repo-wide and treat a failure as yours: ~173 unrelated files are
> already Prettier-dirty (ICR-134). Only this file's status matters.

- [ ] **Step 9: Confirm the diff touches exactly one file, and it is a doc**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
git status --short
git diff --stat
```

Expected: exactly `docs/architecture/contentful-data-layer.md` modified. **If any file under
`apps/web/` appears, you have exceeded scope — revert it.**

- [ ] **Step 10: Commit**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-144
git add docs/architecture/contentful-data-layer.md
git commit -m "docs(ICR-144): correct the Live Preview content preview URL guidance"
```

(`docs:` — not `chore:` — is deliberate because it describes the change **honestly**. Be aware of the
release impact: this repo's `.releaserc.json` maps `docs` → **patch**, so a `docs:` PR title **does**
cut a version bump on merge (`chore` is the `release: false` type). That is the repo's intended,
documented behavior — see `docs/architecture/contributing.md` § Releases and `AGENTS.md:134` — and
precedent: PR #82 (`docs: fix newsletter env drift`) cut `1.25.3`. Pick the type that is _true_, and
accept its release impact; do not pick a type to dodge a bump.)

---

## Self-Review

**Spec coverage** — every requirement maps to a step:

| Spec req                                           | Step                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| 1. Delete broken URL form                          | Step 4 (delete), Step 6 (assert gone)                    |
| 2. Correct Content Preview URLs (2 preview envs)   | Step 4 (table), Step 7 (assert)                          |
| 3. Explain why two                                 | Step 4 ("Why two" para)                                  |
| 4. State the actual mechanism                      | Step 3 (`previewLike` js block), Step 4 (lead para)      |
| 5. Name all three tiers                            | Step 3 (tier table), Step 7 (assert)                     |
| 6. Two-`staging`s warning                          | Step 4 (⚠️ callout), Step 7 (assert)                     |
| 7. `/api/draft/enable`'s only role + home redirect | Step 4 ("Not `/api/draft/enable`" para), Step 7 (assert) |
| 8. Secrets by name only                            | Global Constraints, Step 4, Step 6 (assert)              |
| 9. Fix section intro                               | Step 2                                                   |
| 10. Cross-reference ICR-135                        | Step 4 (closing note), Step 7 (assert)                   |
| Testing Strategy                                   | Steps 5-9                                                |

**Placeholder scan:** none — every step contains the literal markdown to write and the exact command
to run, with expected output.

**Consistency:** `previewLike` is spelled identically in Steps 3, 4, and 7. The staging URL
`https://staging.idcredentor.org/{locale}/community` is byte-identical between the Step 4 table and the
Step 7 assertion.

**Known trap encoded:** the line-122 false-positive is called out in Global Constraints _and_ guarded
by an explicit "did I over-delete it?" assertion in Step 6.
