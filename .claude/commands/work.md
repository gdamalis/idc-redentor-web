---
description: Pull a Jira issue and drive it through spec → plan → implement → verify → QA → PR. Two human gates (brainstorm + spec review). Two automated Jira transitions; never Done.
argument-hint: ICR-N
---

# /work — Ticket-Driven Pipeline Orchestrator

> **Monorepo paths (read this):** the site lives under **`apps/web/`**. Every app path mentioned in this file — `src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, and config files (`next.config.ts`, `tsconfig.json`, `playwright.config.ts`, `vitest.config.ts`) — resolves under `apps/web/` (e.g. `apps/web/src/...`). Only `.claude/`, `docs/`, and `tasks/` stay at the repo root. When you **create, read, or edit** an app file, use the `apps/web/` prefix. Bare `pnpm <task>` at the repo root works (Turbo proxy); for path- or flag-carrying app commands use `pnpm -C apps/web <cmd>`.

This command is the orchestrator playbook. **You (the main thread) follow it step by step.** Spawn subagents only at the points marked `(subagent: …)`. Human gates (★) stay in this conversation — never delegate them.

The issue key is in `$1` (e.g., `ICR-45`). If empty, ask the user.

Task tracking lives in **Jira project "IDC Redentor"** (key **`ICR`**, `divinelab.atlassian.net`), accessed via the **Atlassian MCP** (`mcp__atlassian-divinelab__*`; tools may be deferred — load them via ToolSearch `select:mcp__atlassian-divinelab__getJiraIssue,mcp__atlassian-divinelab__getTransitionsForJiraIssue,mcp__atlassian-divinelab__transitionJiraIssue,mcp__atlassian-divinelab__addCommentToJiraIssue,mcp__atlassian-divinelab__createJiraIssue` before first use). Every Atlassian call takes the Jira `cloudId` (`config.tracker.cloudId` = `0228eaa6-e8fa-4746-b2ac-6c58f1478e42`) and, when creating issues, the `projectKey` `ICR`. **`ICR-N` is the native Jira issue key — `N` is the issue number.** Resolve the issue directly via `getJiraIssue(cloudId, issueIdOrKey="ICR-N")` — no board/list scan — and use the `ICR-N` key string for every write.

Always read `.claude/config.json` first — every command, path, status name, and the `config.tracker.workflow` order comes from there. Do not hardcode commands/paths or numeric transition IDs. **Jira issues move between statuses by workflow transition resolved by name** (`config.tracker.statusResolution: by-name`; match `transition.to.name` against `config.tracker.statuses`), never by a hardcoded id — see "Status workflow & human gate" below.

## Status workflow & human gate

The workflow (`config.tracker.workflow`, in order) is:

`Backlog → To Do → In Progress → In Review → In Testing → Done`

**`/work` owns exactly two Jira transitions:**

1. **To Do → In Progress** (step 3) — transition to `config.tracker.statuses.inProgress`, right after the worktree exists.
2. **In Progress → In Review** (step 14, via `pr-author` at PR-ready) — transition to `config.tracker.statuses.inReview`, paired with a PR-link comment.

The next transition, **In Review → In Testing**, is owned by **`/merge`** (transition #3, after the user-triggered squash-merge) — never by `/work`.

**`/work` must NEVER transition an issue to Done.** `Done` is **human-only** — set by the human after they deploy to production and close the issue (the issue sits in **In Testing** until then). There is intentionally no Done transition anywhere in this pipeline, in any subagent, or in the failure handler. `Backlog` and `To Do` are also human/PM-owned (grooming) — `/work` only reads them.

Every Jira **write** (`transitionJiraIssue`, `addCommentToJiraIssue`, `editJiraIssue`) happens at or after a human gate, mirroring our discipline: the two transitions above occur after the worktree exists and after the PR is ready, respectively; the PR-link comment is posted with the In Review transition.

---

## 0. Pre-flight

1. Read `.claude/config.json`. Pin to local variables: `config.commands`, `config.paths`, `config.worktree`, `config.playwrightProjectMap`, `config.graphify`, and the whole `config.tracker` block — `cloudId`, `projectKey`, `statuses` (status names for `todo`/`inProgress`/`inReview`/`inTesting`/`done`), the ordered `workflow`, `statusResolution` (`by-name`), `issueTypeToCommitType`, `ticketKeyPrefix`. Transitions resolve by status **name** at runtime via `getTransitionsForJiraIssue` — **do not pin or hardcode numeric transition IDs.** (`inTesting` is pinned for reference only — `/work` never transitions there; `/merge` owns that transition.)
2. Read `${config.paths.lessons}` (`tasks/lessons.md`) — internalize prior corrections before working.
3. Validate `$1` matches `ICR-\d+` (case-insensitive; normalize to uppercase). The full key (e.g. `ICR-45`) is what every Atlassian call uses as `issueIdOrKey`. If it doesn't match, stop and ask the user.
4. **Resume check** — see "Resume-from-state hook" at the end of this file; run it here, before pulling the card. If a state file exists for this ticket, branch to resume / start-over.
5. Verify `${config.paths.qaEnv}` (`qa-env.json`) exists at `MAIN_REPO_ROOT`. Pre-merge QA is always-on (step 13): `ui`/`api` tickets test against the PR's Vercel **preview** deploy and need `qa-env.json` (preview baseUrl + Jira creds for evidence posting). If missing, warn: "Create `qa-env.json` (Vercel preview baseUrl + Jira creds) before UI/API QA." Do **not** hard-stop — `chore` QA (vitest/local) needs no deployed target, and the Jira post degrades to the MCP fallback — but record that deployed-target QA / REST evidence posting is degraded.
6. Resolve `MAIN_REPO_ROOT` early: `git rev-parse --git-common-dir` then `dirname`. Pin it — every later step that needs the main repo path uses this.
7. **No board to activate** — Jira issues resolve by key (`getJiraIssue(cloudId, issueIdOrKey="ICR-N")`); there is no board-activation step. (Atlassian tools are namespaced `mcp__atlassian-divinelab__*` and may be deferred — load them via ToolSearch if a call errors as unavailable.)
8. **Graphify update (with lock)** — see the "Graphify refresh" section below. Pin `GRAPHIFY_AVAILABLE` (boolean) and `GRAPHIFY_FRESH` (boolean) for use when dispatching subagents.

### Graphify refresh

If `config.graphify.enabled` is `false`, set both flags to false and skip this section. Otherwise:

1. Check `${MAIN_REPO_ROOT}/${config.graphify.graphFile}` exists.
   - If missing and `config.graphify.enabled === true`, fail loudly: "Graphify required by config but graph.json not found. Run `/graphify` once first." Stop the pipeline.
   - If missing and `config.graphify.enabled === "auto"`, set `GRAPHIFY_AVAILABLE=false` and skip the refresh; subagents will fall back to Grep/Read.
2. If present, attempt the lock + update:
   ```bash
   LOCK="${MAIN_REPO_ROOT}/${graphify.lockDir}"
   # Portable timeout: stock macOS has no `timeout` (it ships as coreutils' `gtimeout`).
   # Prefer gtimeout, then timeout; if neither exists run unwrapped — `graphify update`
   # is AST-only (no LLM) and finishes in seconds, so the missing cap is acceptable.
   if command -v gtimeout >/dev/null 2>&1; then TIMEOUT="gtimeout ${graphify.updateTimeoutSeconds}s"
   elif command -v timeout >/dev/null 2>&1; then TIMEOUT="timeout ${graphify.updateTimeoutSeconds}s"
   else TIMEOUT=""; fi
   if mkdir "$LOCK" 2>/dev/null; then
     echo "$$ $(date +%s)" > "$LOCK/info"
     # We hold the lock — run the update with timeout, then release.
     $TIMEOUT ${graphify.updateCommand} "${MAIN_REPO_ROOT}"   # config.graphify.updateCommand == "graphify update" (subcommand form, NOT `graphify --update`); $TIMEOUT is "" when no timeout binary exists
     rc=$?
     rm -rf "$LOCK"   # the lock dir holds an `info` marker, so rmdir would fail — rm -rf releases it
     if [ $rc -eq 0 ]; then
       GRAPHIFY_FRESH=true
     else
       GRAPHIFY_FRESH=false  # update failed or timed out; existing graph still usable
     fi
   else
     # Lock held by another /work session — check if stale.
     LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK/info" 2>/dev/null || echo 0) ))
     if [ "$LOCK_AGE" -gt ${graphify.lockStaleSeconds} ]; then
       # Stale (crashed process). Reclaim.
       rm -rf "$LOCK"
       # Try again (single retry).
       if mkdir "$LOCK" 2>/dev/null; then
         echo "$$ $(date +%s)" > "$LOCK/info"
         $TIMEOUT ${graphify.updateCommand} "${MAIN_REPO_ROOT}"   # config.graphify.updateCommand == "graphify update" (subcommand form, NOT `graphify --update`); $TIMEOUT is "" when no timeout binary exists
         rm -rf "$LOCK"   # non-empty (holds `info`) — rm -rf, not rmdir
         GRAPHIFY_FRESH=true
       else
         GRAPHIFY_FRESH=false
       fi
     else
       # Another /work is updating right now — proceed with existing graph.
       GRAPHIFY_FRESH=false
     fi
   fi
   GRAPHIFY_AVAILABLE=true
   ```
3. Report to the user one line: "graphify: available, fresh" / "graphify: available, used cached (locked by another session)" / "graphify: available, update timed out, using cached" / "graphify: not present, falling back to grep".
4. When dispatching `explorer` and `implementer` later, pass both `GRAPHIFY_AVAILABLE` and `GRAPHIFY_FRESH` so they don't re-check or refresh themselves.

**Why only here**: the orchestrator updates ONCE per `/work` invocation, holds the lock just long enough to do the incremental extraction, then releases. Concurrent `/work` sessions on other tickets see the lock and use the existing graph — no races, no duplicate LLM cost.

**Relationship to the git post-commit hook**: `graphify hook install` keeps the _code_ side of the graph fresh continuously (AST re-extract on every commit, no LLM). This per-session `graphify update` is still worth running because it also re-extracts _doc/content_ (semantic) changes the AST hook ignores, and folds in any `graphify save-result` memory entries from prior sessions. So: commits keep code fresh for free; `/work` catches semantic drift once per session.

## 1. Pull the Jira issue

`ICR-N` is the native Jira issue key — fetch the issue directly (no board/list scan):

1. `mcp__atlassian-divinelab__getJiraIssue(cloudId, issueIdOrKey="ICR-N")`. Jira resolves by key. Pin the `key` (use it as `issueIdOrKey` for every subsequent Atlassian call).
2. From the returned issue capture: `key`, `summary` (title), `description`, current `status`, `labels`, `issuetype`, `priority`, the browse URL (`https://divinelab.atlassian.net/browse/ICR-N`), and any custom fields.
3. Read field values:
   - **QA Depth** — resolve per `config.qaDepth.sourceNote` (a `qa-<depth>` label → a `QA: <depth>` token in the description → default `standard`). Reject if not in `config.qaDepth.allowed`.
   - **Priority** — read Jira's native `priority` value; if meaningful, record it for the brainstorm; if unset, prompt once during refinement (step 6).
   - **Current status** — log only; you transition it later.
4. **Commit-type inference** from the **issue type** via `config.tracker.issueTypeToCommitType`: `Bug`→`fix`, `Story`→`feat`, `Task`→`chore` (use `refactor`/`perf` when the work is purely that, or when a `perf`/`refactor` label overrides). Override if `summary` explicitly starts with `chore:`/`docs:`/etc.
5. **QA TYPE inference** — derive `qaType` (`ui` | `api` | `chore`), **independent of depth** (depth is the effort dial; TYPE is what to test):
   - `api` — when the change touches API/route logic only: `src/app/api/*` or `src/service/*` route/handler logic.
   - `ui` — when it touches rendered UI: `src/app/[locale]/*` pages or `src/components/*`.
   - `chore` — pure config/docs/tooling/test-only changes (no UI, no API): `.claude/*`, `docs/*`, `*.config.*`, `e2e/*`, `src/utils/*` unit-only, etc.
   - A ticket touching **both** UI and API runs as `ui` with the API request-level checks folded in (or runs both type baselines).
   - At this point `changedPaths` may not exist yet (no code written); infer from the issue's described areas / explorer findings, then **reconcile against the real `git diff` `changedPaths` at the QA step (13)** and correct `qaType` if the diff disagrees. Record `qaType`; the pre-merge QA step uses it.
6. **Already-past guard**: if the issue is currently in `In Review`, `In Testing`, or `Done` (any `config.tracker.workflow` entry with `order > inProgress.order`), stop and ask the user whether to continue. If it sits in `Backlog`/`To Do`, proceed. If its status isn't in `config.tracker.workflow`, surface the drift rather than proceeding silently.

## 1.5 Entry gate — needs-refinement ★ HUMAN GATE ★

This gate runs **after the card is resolved** (right after the already-past guard bullet above) and **BEFORE any side effect** — no worktree, no branch, and no `To Do → In Progress` move yet. Its job: refuse to start work on an un-refined card.

> **Invariant:** This gate runs BEFORE Transition #1. An issue that fails the gate is never transitioned `To Do → In Progress`, never gets a worktree, and never gets a state file.

1. **Resolve the matcher from config** (pinned in pre-flight): `config.tracker.needsRefinementLabel` (`"needs-refinement"`). Refinement state is a Jira **label** (`config.tracker.needsRefinementMechanism: "label"`). Read the value from config — do **not** hardcode the literal.
2. **Read the issue's labels.** From the issue already fetched in section 1 (`getJiraIssue` → `fields.labels`), check whether `config.tracker.needsRefinementLabel` is present. (If you need a fresh read, re-fetch via `mcp__atlassian-divinelab__getJiraIssue(cloudId, issueIdOrKey="ICR-N")`.)
3. **Gate decision:**
   - **PASS** — if the `needs-refinement` label is **absent** → the issue is `/work`-ready. Proceed to section 2. (A To Do issue without the label is the ready signal; treat absence on a legacy issue as ready.)
   - **STOP + carrail** — if the `needs-refinement` label is **present** → STOP before any worktree/transition and present a carrail via `AskUserQuestion` (same mechanism as the step-8.1 / step-15 prompts):

     > Issue `ICR-N` still carries the `needs-refinement` label — it is not `/work`-ready. What now?

     Two single-select options:
     - **(a) Refine now** — dispatch the `product-manager` subagent with `mode: refine` and the `ICR-N` issue. Wait for it to return (it removes the `needs-refinement` label via `editJiraIssue` per its own lifecycle when the issue meets the ready bar). Then **RE-READ the labels** (repeat step 2):
       - if the label is now gone → proceed to section 2;
       - if `product-manager` left it on (still not ready) → report what it said is missing and **STOP cleanly** (no worktree, no transition, no state file).
     - **(b) Pick another ticket** — abort cleanly: **NO** worktree, **NO** Jira transition, **NO** state file. Print: "Stopped: `ICR-N` is not refined. Run `/pm` to refine it, or `/work <other-ICR>`." and end.

## 2. Create worktree + branch ★ MANDATORY

**Every `/work` invocation runs in its own worktree. No exceptions.** The user works 3–6 tickets in parallel. All worktrees live inside the **main repo's** `.claude/worktrees/` directory (gitignored).

### Resolve the main repo root first

You may be invoked from inside an existing worktree (e.g., another `/work` session left you there). To prevent nested-worktree hell, always anchor to the MAIN repo:

```bash
git rev-parse --git-common-dir
```

This returns the path to the main repo's `.git/` **even when run from inside a worktree**. Take its `dirname` → that's the main repo root. It is already pinned as `MAIN_REPO_ROOT` from pre-flight.

### Create the worktree

Worktree directory: `${MAIN_REPO_ROOT}/${config.worktree.parentDir}/ICR-N` — i.e., `<main-root>/.claude/worktrees/ICR-N/`.

Branch name: `<typePrefix>ICR-N-<slug>` where `<typePrefix>` comes from `config.branchPrefixByType[commitType]` and `<slug>` is a 3–5-word kebab-case from `card.name` (e.g. `feat/ICR-45-redesign-creed-section`).

Invoke `superpowers:using-git-worktrees`. Inputs:

- branch name (above)
- worktree path (above — absolute)
- base: `origin/main` (from `config.worktree.base` — always; **never** branch off a feature branch). If `origin/main` is stale, `git fetch origin main` first.

After the skill returns, `cd` into the worktree path. **All further steps run from inside the worktree.**

Then set the session name now: `/rename ICR-N-<slug>` (same kebab slug as the branch — e.g. `/rename ICR-45-redesign-creed-section`).

> The `.claude/worktrees/` directory is gitignored at the main checkout, so the worktree directories don't pollute `git status` on the main branch. Each worktree's working tree is a normal checkout of the feature branch and behaves independently.

## 3. Transition issue → In Progress (AUTOMATED TRANSITION #1)

Resolve the transition **by target status name** — never a hardcoded numeric ID:

1. `mcp__atlassian-divinelab__getTransitionsForJiraIssue(cloudId, issueIdOrKey="ICR-N")` → a list of `{ id, name, to: { name } }`.
2. Pick the transition whose **`to.name`** equals `config.tracker.statuses.inProgress` ("In Progress"), compared case-insensitively/trimmed.
3. `mcp__atlassian-divinelab__transitionJiraIssue(cloudId, issueIdOrKey="ICR-N", transition={ id: <matched.id> })`.
4. If **zero** transitions match, stop and report the current status + the available `to.name`s — never invent an ID. If the transition call fails, stop and report (do not proceed silently).
5. (Optional, gated) post a short start comment via `mcp__atlassian-divinelab__addCommentToJiraIssue` — only if the team wants it; default is no comment until PR-ready to keep writes minimal.

> Rule for the rest of the pipeline: `/work` drives only **In Progress** (here) and **In Review** (step 14). Never `Done`. Never `Backlog`/`To Do`.

## 4. Ensure scratchpad exists

`tasks/todo.md` lives at `${MAIN_REPO_ROOT}/tasks/todo.md` (gitignored) and is shared across all concurrent worktrees as the stray-observations log. If it doesn't exist, create it with the following exact contents (the file is gitignored, so a fresh clone won't have it):

````markdown
# tasks/todo.md — Stray Observations Log

**This file is gitignored.** Append-only scratchpad for things agents (and you) notice while working but that don't belong in the current ticket. At the end of each `/work` run, the orchestrator triages entries tagged with the current ticket and promotes them to Jira issues in **To Do** (project ICR).

## Entry format

```
- YYYY-MM-DD HH:MM | <TICKET-ID> | <author> | <one-line observation> — <file:line or area>
```

`<TICKET-ID>` is `ICR-N`. `<author>` is `explorer`, `implementer`, `qa-runner`, or `human`.

## Open observations

<!-- agents append below this line; do not edit this header -->
````

Do NOT overwrite an existing file — concurrent `/work` runs may have appended entries.

You (the orchestrator) do NOT mirror pipeline progress here. Granular in-session tracking is handled by `TaskCreate`/`TaskList`. The scratchpad is reserved for **stray observations** that agents (and the user) write during the run; the triage step (15) drains them.

## 5. Explore (subagent: explorer)

Dispatch the `explorer` subagent with:

- `mode: ticket-context`
- card title + description
- obvious areas if clear from the title (blog? contact/subscribe forms? likes/Mongo? i18n? CSP/headers? Contentful data layer?)
- `graphifyAvailable: <GRAPHIFY_AVAILABLE>`
- `graphifyFresh: <GRAPHIFY_FRESH>`
- `mainRepoRoot: <MAIN_REPO_ROOT>`

Wait for the subagent's summary (≤400 words). It returns relevant files, existing patterns, reusable utilities, **Sensitive areas touched**, and risk notes. Save the summary in conversation context — you'll feed it into brainstorming.

**Parse and pin two signals from the explorer's report:**

- `EXPLORER_NEEDS_DESIGN_GATE` (boolean) — from the explorer's `Design gate` section (`needsDesignGate: true|false`).
- `EXPLORER_SUGGESTED_QA_DEPTH` — from the explorer's `Suggested QA depth` section (`light|standard|heavy`).

**Fail-safe:** if the explorer omitted `needsDesignGate` (older output) or it can't be parsed as a literal boolean, default `EXPLORER_NEEDS_DESIGN_GATE = true` — never auto-skip the design gate on ambiguity. These signals drive whether sections 6 (brainstorm) and 7 (spec) run.

## 6. Brainstorm ★ HUMAN GATE ★ (conditional)

**Conditional gate.** This section **and section 7 (spec)** run ONLY when `EXPLORER_NEEDS_DESIGN_GATE === true`. When `false` (trivial ticket: no sensitive areas, QA depth `light`, no data-model/API/CSP/i18n/email touch), **SKIP both** — print one line `Design gate: not required (needsDesignGate=false) — proceeding automated to implementation` and jump straight to **section 8 (write the implementation plan)**, building the plan from the card description + explorer findings (no spec doc). When `true`, this gate is **MANDATORY**.

Invoke the `superpowers:brainstorming` skill. Pass the card description + explorer findings as initial context.

**Do not skip this when the gate is required (needsDesignGate=true) — even for tickets that look simple.** The brainstorming skill is rigid; follow it. The user will steer scope, design choices, edge cases. Outcome: an agreed design in conversation (not yet a doc).

### Sensitive-areas heads-up

If the explorer's report has a non-empty `Sensitive areas touched` section, lead the brainstorm with an explicit callout:

> 🛡️ This ticket touches: `<areas>`. We should explicitly cover threat-model and risk implications during design.

Concrete prompts per ICR area:

- `email-services` (`src/service/contact-form-email.service.ts`, `mailing.service.ts`, `src/templates/`) — "What stops this from being abused to send spam? Is the recipient/sender controllable? Are the SendGrid/Resend/Mailchimp keys read only server-side?"
- `form-pii-spam` (`src/app/api/contact`, `/subscribe`) — "What validation / rate-limiting / anti-spam guards the endpoint? Is PII logged anywhere it shouldn't be? Zod schema coverage?"
- `likes-mongo` (`src/app/api/likes`, `src/service/database.service.ts`) — "Can this be spammed to inflate counts? Is the write idempotent/bounded? Is `MONGODB_URI` only server-side?"
- `csp-headers` (`config/headers.js`) — "Does this loosen CSP or any security header? What's the blast radius?"
- `env-secrets` — "Any new secret? Confirm it's never sent to the client / committed."

The brainstorming skill's normal Socratic flow then handles the rest.

### Priority handling during refinement

The Jira **Priority** field is set ONCE during refinement and never updated by agents again. If it's already set, surface it in the brainstorm intro; if unset and the team wants one, ask once and set it via `mcp__atlassian-divinelab__editJiraIssue(cloudId, issueIdOrKey="ICR-N", fields={ priority: { name: "<choice>" } })` — a single touch, never re-touched. The team may skip this entirely.

## 7. Write the spec (conditional)

**Runs only when `EXPLORER_NEEDS_DESIGN_GATE === true`** (same condition as section 6). When the design gate is skipped there is no spec file — section 8 builds the plan directly from the card + explorer summary. The `★ HUMAN GATE ★` spec-review block below executes only when the gate is required.

Write the spec to the **main checkout** at `${MAIN_REPO_ROOT}/${config.paths.specs}/ICR-N-<slug>.md` (pass this absolute path as the `superpowers:brainstorming` spec-location override — do NOT rely on the session cwd, which is the main repo regardless of the worktree). It lives in main during design + review so you can open it at the usual `tasks/specs/` location; section 8.3 moves it into the worktree after the plan is approved so it rides the feature PR. Required sections (ICR-tailored):

1. **Dependencies Check** — what must exist before starting
2. **Requirements** — numbered, code-level detail
3. **Data Model Changes** — TypeScript interfaces; **Contentful GraphQL fragments** (hand-written in `lib/contentful/*`, NOT codegen — ignore `codegen.ts`); MongoDB indexes only if the **likes** feature is touched. **If this changes the Contentful content _model_** (a new/changed/deleted content type or field, or an entry remap — not just a read fragment), this section MUST include the **env-cutover plan** (the `staging` work env, how `.env.local`/the branch Vercel Preview point at it, and the human cutover — default lane: Merge/scripts; heavy lane: alias-swap — plus rollback) per `docs/contentful-environments.md`. The step 8.2 gate enforces it.
4. **API Changes** — Zod schemas + request/response contracts for `src/app/api/*` routes
5. **New Files / Modified Files** — tables with purpose or change description
6. **Component Hierarchy** — ASCII tree (`src/components/{features,shared,ui}`), responsive variants if UI
7. **Edge Cases** — numbered, with expected behavior
8. **i18n** — keys for **`es-AR` (default) and `en-US`** in `public/locales/{es-AR,en-US}.json`; note next-intl routing (`src/i18n/*`, proxy at `src/proxy.ts`)
9. **Testing Strategy** — **Vitest** unit smoke (minimal seeded) + manual smoke against the Vercel **preview** deploy + which `config.playwrightProjectMap` tags apply (e2e specs authored per-ticket on heavy depth only)
10. **Implementation Checkpoints** — numbered. Each has: files touched, verification steps, conventional-commit message in `<type>(ICR-N): …` form
11. **Open Questions** — anything deferred

Flag sensitive areas if touched: **email services, forms (contact/subscribe), likes/Mongo writes, CSP/headers, env/secrets.**

**★ HUMAN GATE ★** — Ask the user explicitly, printing the **absolute main-checkout path**: "Spec written to `${MAIN_REPO_ROOT}/${config.paths.specs}/ICR-N-<slug>.md` (main checkout — open it there). Please review and let me know if any changes before I write the implementation plan. After you approve the plan I'll move the spec + plan into the worktree so they're committed in this ticket's PR." Wait for approval. Apply revisions until they're happy.

## 8. Write the implementation plan

Invoke the `superpowers:writing-plans` skill. Output goes to the **main checkout** at `${MAIN_REPO_ROOT}/${config.paths.specs}/ICR-N-<slug>.plan.md` (same dir as the spec, `.plan.md` suffix — pass this absolute path as the plan-location override). The plan turns each spec checkpoint into concrete file edits with verification steps. Section 8.3 moves it (with the spec) into the worktree after this step + its guards pass.

> **When the design gate was skipped** (sections 6 + 7 did not run, so there is **no spec doc**): pass the **card description + explorer summary** to `superpowers:writing-plans` instead of a spec path. The plan is still written to the main checkout at `${MAIN_REPO_ROOT}/${config.paths.specs}/ICR-N-<slug>.plan.md` (section 8.3 then moves the `.plan.md` alone — there is no spec `.md` to move). When a spec exists, behave as today (plan from the spec).

### 8.1 Ticket-too-large guard

After the plan is written, count the **Implementation Checkpoints** in it (each numbered checkpoint = 1). If the count is **> 8**, surface to the user with `AskUserQuestion`:

> The plan has `<N>` checkpoints. Tickets with more than 8 are usually better split into multiple Jira issues (smaller scope = faster PRs + easier review). Continue with this ticket as-is, or stop and split?

Options:

- **Continue anyway** — proceed to step 9 (you've decided the size is justified).
- **Stop and split** — abort the pipeline cleanly. The spec + plan files stay in the **main checkout** (the 8.3 move runs only after this guard passes); the worktree stays; the issue stays **In Progress**. Print: "Pipeline paused at step 8.1. Spec is at `${MAIN_REPO_ROOT}/${config.paths.specs}/ICR-N-<slug>.md`. Suggest splitting into N follow-up Jira issues in To Do, then `/work` each separately."

This guard is a one-time gate; once the user picks "Continue anyway," subsequent checkpoints inside the same `/work` run don't re-trigger.

### 8.2 Contentful model-change gate

After the plan is written, determine whether it changes the **Contentful content model** — it creates / updates / deletes a **content type or field**, or **remaps entries** — as opposed to only adding a read-side GraphQL fragment/getter in `lib/contentful/*`. Signals: the spec's "Data Model Changes" section describes a content-type/field change; the plan uses the Contentful MCP write tools (`mcp__contentful__{create,update,delete}_content_type`, `…_entry`) or `scripts/contentful/` migrations.

**If it does NOT touch the model** (pure read fragment / code-only): skip this gate → step 9.

**If it DOES touch the model:** route it through one of the two model-change lanes (`.claude/config.json` → `contentful`; full runbook `docs/contentful-environments.md`). STOP and confirm with `AskUserQuestion` — **which lane?**

> `ICR-N` changes the Contentful content model. Which lane?
>
> - **Default — permanent `staging`** _(recommended)_: develop in the standing `staging` env, promote to prod at cutover via Contentful Merge and/or the committed `scripts/contentful/` migrations. Low setup; rollback = reverse migration.
> - **Heavy — alias-swap cutover**: for a big **breaking** change (type deletions, field renames, merges) that needs instant flip-back rollback. Build in the permanent `staging` env; the human performs the stable-name alias-swap at cutover (see `docs/contentful-environments.md` → Heavy alias-swap runbook).

**Default (`staging`) lane:**

1. Ensure `staging` exists and (if entry-accuracy matters) is current — its one-time setup is already done (API keys + MCP/`.env.local`/preview point at it). The implementer makes changes in `staging` via the MCP + `scripts/contentful/` migrations, **never** the `master` alias.
2. The spec's "Data Model Changes" section must include the cutover plan: the migration to apply to prod + the reverse/rollback step.
3. **Cutover is HUMAN-ONLY and deferred** — at PR-merge time the human applies the tested migration to production (Merge and/or the scripts). `/work` never writes to prod or the alias.

**Heavy (alias-swap) lane** — the breaking change is developed in `staging`, the same permanent work env as the default lane. The only difference is the **cutover mechanism**: the human performs the stable-name alias-swap instead of applying a forward migration. Refer to `config.contentful.heavyCutover` for the step-by-step procedure. Then:

1. **Work env is `staging`** — the one-time setup (`config.contentful.oneTimeConfigTouch`: API keys granted, MCP `ENVIRONMENT_ID` set, `.env.local` + branch-scoped Vercel Preview pointed at `staging`) is already done. The implementer writes to `staging` only; never `master` or `production`.
2. **Implementer writes to `staging` ONLY** — via the Contentful MCP + committed `scripts/contentful/` migrations. **Never** `master` or `production`.
3. **The spec must carry the alias-swap cutover plan** in its "Data Model Changes" section: what changes land in `staging`, the alias-swap steps (reference `config.contentful.heavyCutover`), and the flip-back rollback (re-point `master` → cold-backup of old production).
4. **Cutover is HUMAN-ONLY and deferred** — `/work` NEVER re-points the `master` alias or touches `production`. At PR-merge time the human executes the alias-swap. A **Done-class human gate**: like merge and Done, no agent or command performs it.

One-time gate; once the lane is chosen, later checkpoints in the same run don't re-trigger.

## 8.3 Move spec + plan into the worktree (so they ride the PR)

The spec and plan were written + reviewed in the **main checkout** for quick access. Now that the plan is approved and the 8.1/8.2 guards have passed, **move both into the worktree** so the implementer's PR carries them and the main checkout stays clean (no more untracked `tasks/specs/` clutter that needs periodic manual sweeps). The orchestrator does this here — do **not** leave it to the implementer:

```bash
SPECS_REL="${config.paths.specs}"                                    # tasks/specs
WORKTREE_PATH="${MAIN_REPO_ROOT}/${config.worktree.parentDir}/ICR-N"  # <main>/.claude/worktrees/ICR-N
mkdir -p "${WORKTREE_PATH}/${SPECS_REL}"

# Move whichever exist: the .plan.md always; the spec .md only when the design gate ran.
moved=()
for f in "ICR-N-<slug>.md" "ICR-N-<slug>.plan.md"; do
  src="${MAIN_REPO_ROOT}/${SPECS_REL}/$f"
  if [ -f "$src" ]; then
    mv "$src" "${WORKTREE_PATH}/${SPECS_REL}/"
    moved+=("${SPECS_REL}/$f")
  fi
done

# Commit them on the feature branch (the first commit on the branch; implementation commits build on top).
git -C "${WORKTREE_PATH}" add "${moved[@]}"
git -C "${WORKTREE_PATH}" commit -m "docs(ICR-N): add spec and implementation plan"
```

- **Design-gate-skipped run** (no spec `.md`): only the `.plan.md` moves — use the plan-only message `docs(ICR-N): add implementation plan`.
- After this step, `git status` in the main checkout shows **no** untracked `tasks/specs/ICR-N-*` — they now live (committed) in the worktree and land in `main`'s history when the PR merges.
- All remaining steps (§9 onward) already run against the worktree, so the implementer's commits build on top of this docs commit.

## 9. First checkpoint: implement (subagent: implementer)

Dispatch the `implementer` subagent with:

- `specPath` — `tasks/specs/ICR-N-<slug>.md` — **omit when the design gate was skipped** (no spec was written); the plan alone is authoritative in that case.
- `planPath` — `tasks/specs/ICR-N-<slug>.plan.md` — **always present** (written in section 8 whether or not a spec exists).
- `checkpointNumber: 1`
- `branch` — current feature branch name
- `worktreePath` — absolute path to the worktree
- `commitType` — conventional-commit prefix derived from the Jira issue type
- `ticketId` — `ICR-N`
- `graphifyAvailable: <GRAPHIFY_AVAILABLE>`
- `graphifyFresh: <GRAPHIFY_FRESH>`
- `mainRepoRoot: <MAIN_REPO_ROOT>`

The implementer composes `superpowers:test-driven-development` + `superpowers:executing-plans`. It commits at the end of the checkpoint with message `<type>(ICR-N): …`.

> The remaining-checkpoints loop (section 12) reuses this input shape — it likewise **omits `specPath` when no spec was written** and always passes `planPath`.

## 10. First verify (subagent: verifier)

Dispatch the `verifier` subagent. Inputs:

- `depth` — `light` | `standard` | `heavy` (from the card's `QA Depth`)
- `worktreePath` — absolute path

Verifier runs the stack per QA Depth: `light` = `pnpm type-check` + `pnpm lint` + `pnpm test`; `standard`/`heavy` = + `pnpm build`. (Uses `config.commands`; note ICR's `type-check` hyphen. If `pnpm test` script is absent, the verifier reports it rather than failing silently.) On fail, the verifier returns structured errors.

### Verify-loop guard ★ MAX 3 ATTEMPTS

Maintain an `attemptCount` and a `lastTwoFailures` array. On each verifier failure:

1. Increment `attemptCount`.
2. If `attemptCount >= 3`, **STOP the pipeline** and surface to the user with the cumulative failure outputs. Do not re-dispatch the implementer. Trigger the **Failure handler** (see end of file).
3. Compare the new failure to the previous one. If the truncated error output is identical to the prior attempt's, surface to the user before re-dispatching (the loop is stuck).
4. Otherwise, re-dispatch the implementer with `previousFeedback` set to the verifier's structured errors.

Do not move on until verify passes. Reset `attemptCount = 0` once the verifier passes.

## 11. Open draft PR ★ EARLY ★ (subagent: pr-author)

Dispatch the `pr-author` subagent with `action: "open_draft"`. Inputs:

- `action: "open_draft"`
- `ticketId` — `ICR-N`
- `ticketTitle` — the Jira issue summary
- `ticketUrl` — `https://divinelab.atlassian.net/browse/ICR-N` (the issue browse URL)
- `branch` — feature branch
- `worktreePath` — absolute path
- `commitType` — derived from the Jira issue type
- `explorerSummary` — output from the explorer subagent (used for the Changes section)
- `specPath` — for pulling the Summary
- `verifierLastReport` — used to pre-tick Test-plan checkboxes
- `prTemplatePath` — `.github/PULL_REQUEST_TEMPLATE.md`

pr-author runs `git push -u origin <branch>`, `gh pr create --draft` with a **conventional title `<type>(ICR-N): <description>`** (satisfies `pr.yml`'s `amannn/action-semantic-pull-request`), fills the near-empty `# Description` / `# Changes` template, then posts a comment on the Jira issue with the PR URL via `addCommentToJiraIssue(cloudId, issueIdOrKey="ICR-N", ...)`. **Issue stays In Progress.**

After this point, **every subsequent checkpoint commit-and-pushes to this open PR**, so cloud review agents can review iteratively.

## 12. Remaining checkpoints (loop)

For each remaining checkpoint N in the plan:

1. Dispatch `implementer` with the same input shape as step 9 but `checkpointNumber: N`. Include `previousFeedback` if re-dispatching after a verifier failure.
2. Dispatch `verifier` with the same inputs as step 10.
3. If verify passes, the implementer has already pushed. Move on.
4. If verify fails, **apply the Verify-loop guard from step 10** (max 3 attempts per checkpoint, diff prior failures). Loop until clean.

When all checkpoints are done, move to QA.

## 13. QA (subagent: qa-runner)

**Pre-merge QA is UNCONDITIONAL for every testable ticket.** There is no longer a `light = skip` early-return — QA always runs, on the PR's Vercel **preview** deploy. Depth only scales how much EFFORT QA spends; it never decides _whether_ QA runs.

Compute `changedPaths` first: `git diff --name-only origin/main...HEAD` (from inside the worktree). **Reconcile `qaType`** (inferred at step 1.5) against this real diff and correct it if the diff disagrees (e.g. a "UI" card that only touched an API route).

### Resolve the preview target FIRST (`ui` / `api` only)

For `qaType` `ui` or `api`, QA must run against the **PR's Vercel preview**, never a local dev server. **You must resolve the preview URL and pass it in** — `qa-runner`'s contract falls back to a **local dev server when no `env.baseUrl` is supplied** (see `.claude/agents/qa-runner.md` Inputs), so passing only `envName` would make the evidence + acceptance-judge verdict come from `localhost`, not the preview. The draft PR from step 11 has a preview deploy by now; resolve it:

1. Find the PR's preview URL: `mcp__claude_ai_Vercel__list_deployments` for project `idc-redentor-website` filtered to the PR's branch/commit → latest **READY** preview; or `gh pr view <pr> --json statusCheckRollup` and read the Vercel preview deployment URL.
2. Validate it against `config.qaLoop.env.preview` (host matches `baseUrlHostAllow`; not in `productionHostDeny`; `requirePreviewEnvironment` → confirm `target=preview`). If no READY preview yet, poll up to `config.qaLoop.deploy.timeoutSeconds`; if still none, mark QA **BLOCKED** (do **not** silently fall back to `localhost`) and surface it via the QA-loop guard.
3. Build the env block: `env = { name: "preview", baseUrl: <resolved preview URL>, ...config.qaLoop.env.preview }`. Pin the resolved URL as `PREVIEW_URL` — it's reused for `meta.targetUrl` in the dual-post (13.2).

For `qaType` `chore`, **skip** preview resolution — chore QA runs local codebase checks only (no deploy), so `env` is intentionally omitted and the runner runs locally.

Dispatch `qa-runner` with:

- `depth` — QA Depth from the card (effort dial)
- `qaType` — `ui` | `api` | `chore` (reconciled against `changedPaths`)
- `env` — the resolved **preview env block** above for `ui`/`api` (**REQUIRED** for them — without `env.baseUrl` the runner targets `localhost`); **omit** for `chore` (local-only by design)
- `envName: "preview"` — names the active env block (agrees with `env.name`)
- `worktreePath` — absolute path
- `ticketId` — `ICR-N`
- `slug` — kebab-case slug from the card name
- `changedPaths` — array from the `git diff` above
- `mainRepoRoot: <MAIN_REPO_ROOT>`

The orchestrator (not the runner) owns preview-URL resolution + validation above; `qa-env.json` only supplies the Jira REST creds for posting. The prod hard-deny applies in every env.

**TYPE → what the runner tests** (depth scales effort within each):

- `ui` → **MCP browser walk + screenshots, ALWAYS** (both `es-AR`/`en-US` locales when i18n-relevant) + mapped `e2e*` Playwright projects.
- `api` → mapped `api*` Playwright projects + request-level checks at the network boundary (no live-integration happy-path POST on staging per the env policy).
- `chore` → `pnpm test` (vitest run) + local codebase checks only — **no browser, no preview deploy needed**.

### 13.1 Acceptance judge (verdict)

After the tester (`qa-runner`) returns its **EVIDENCE bundle** (written report + screenshot paths + raw per-AC observations), dispatch the **acceptance-judge** subagent (agent name from `config.qaLoop.reviewAgents.acceptance` → `acceptance-judge`) with:

- the tester's evidence (written report + screenshot paths + the block-1 JSON)
- the issue's acceptance criteria — parsed from the issue **description** (`getJiraIssue(cloudId, issueIdOrKey="ICR-N")` → `fields.description`)
- `ticketId: "ICR-N"`, `envName: "preview"`

It returns the **authoritative** `overall: pass | partial | fail` verdict plus a `perAC` array (`{n, text, type, verdict, rationale, evidenceRef}`) shaped for the jira-result table. **The tester proves what the system does; the judge decides whether it meets the issue — never fuse them.** The QA-loop guard's pass/fail decision keys off the **judge's** verdict, not the tester's raw output.

> Map the judge's verdict onto the jira-result `perAC` table: `verdict → result`, `rationale (+evidenceRef) → notes`, `overall → status` (pass→PASS, partial→PARTIAL, fail→FAIL, blocked-present→BLOCKED).

### 13.2 Dual-post evidence (PR + Jira)

Post the SAME evidence + judge verdict to **BOTH** the Jira issue and the PR. Build both from the one bundle. **Secret-scrub before every write** (security invariant #4 — the script scrubs; the PR path must scrub too).

**Jira (screenshots as issue attachments):** write a `0600` temp payload JSON:

```jsonc
{
  "ticketKey": "ICR-N", // the Jira issue key — every REST call uses it
  "qaEnvPath": "<config.paths.qaEnv>", // "qa-env.json"
  "configPath": ".claude/config.json",
  "meta": {
    "title": "<issue summary>",
    "testedAt": "<iso>",
    "envName": "preview",
    "host": "<preview host>",
    "targetUrl": "<previewUrl>",
    "testType": "<qaType>",
    "postedBy": "/work",
    "runId": "<run id>",
  },
  "result": {
    /* judge overall→status + perAC mapped to {n,text,type,result,notes} + summary */
  },
  "evidence": [{ "path": "<abs screenshot>", "caption": "...", "ac": 1 }],
}
```

Run `node .claude/scripts/qa/post-jira-result.mjs <payload>` (it uploads each screenshot as an issue attachment via the Jira REST API, then posts a comment whose body renders the per-AC table + each shot inline; reads `jira.{email,apiToken}` from `qa-env.json` and `jira.site` from `.claude/config.json`). **`meta.envName` is REQUIRED** (it exits 2 if absent) and **`meta.postedBy: "/work"`** so the comment isn't mislabeled as `/qa`. On exit code 3 (creds absent) fall back to a text-only `mcp__atlassian-divinelab__addCommentToJiraIssue(cloudId, issueIdOrKey="ICR-N", commentBody=...)` (no inline images).

**PR (report + verdict table + link — screenshots live on the Jira issue):** GitHub has **no simple CLI to upload local image files into a PR comment**, so do NOT invent a `gh` image upload. Post the WRITTEN acceptance report + the per-AC verdict table + a **link to the Jira issue** (which carries the screenshots as attachments) via:

```bash
gh pr comment <pr-url> --body-file <scrubbed-report.md>
```

The report body contains: overall status, the per-AC verdict table (`# | Criterion | Type | Result | Notes`), the blockers list, and a line `Screenshots: see the Jira issue <https://divinelab.atlassian.net/browse/ICR-N> (attachments).` There is no native `gh` image upload, so screenshots live on the Jira issue; the PR carries the report + verdict + link.

### QA-loop guard ★ MAX 3 ATTEMPTS

Same shape as the Verify-loop guard. Maintain `qaAttemptCount` and `lastTwoQaFailures`. After 3 attempts, **STOP** and trigger the Failure handler. If the failure output is identical to the prior attempt, surface before re-dispatching. The pass/fail decision keys off the **acceptance-judge's** verdict (13.1), not the tester's raw output.

If QA fails (and we have attempts left), route back to the implementer with the failures. Re-run the verifier after, then re-dispatch qa-runner → acceptance-judge → dual-post. **QA is always-on and evidence is dual-posted (PR + Jira).** The loop still auto-remediates up to the 3-attempt cap and **NEVER auto-merges**; the merge gate remains human-only (handed to `/merge` in a later phase).

## 13.5 Docs evaluation

Per `~/CLAUDE.md` Documentation policy: after every implementation, evaluate whether `docs/` (engineering docs) **and** `docs/product/` (the church "brain") need updating. Run this once, after QA passes and before flipping the PR to ready.

Ask yourself (and surface to the user if non-trivial):

> Did this change alter behavior that any existing file in `docs/` describes? Did it add a non-obvious tradeoff, integration, or constraint worth documenting for future agents/humans?

Process:

1. Read the touched files (from the QA step's `changedPaths`) and the `docs/` index. Cross-reference: which docs are stale?
2. If **none impacted**, skip. Append a one-line note to the PR body: `Docs: no changes needed.`
3. If **one or more impacted**, list them to the user and ask:
   - **Update now** — dispatch `implementer` with a focused mini-spec ("Update `docs/<name>.md` to reflect: <delta>"). Run `verifier` after, commit, push to the open PR.
   - **Defer** — append a stray-observation to `tasks/todo.md` (`docs update: <file> — <reason>`) so the triage step at 15 promotes it.
   - **Not needed** — skip; explain briefly in the PR body.
4. A new `docs/<name>.md` is acceptable if the change introduces a complex flow not documented anywhere (per `~/CLAUDE.md` "When to document" rules). Organize by domain area, not by date/ticket.

**Don't** auto-update docs without surfacing — doc edits are higher-judgment than code edits and the user should see the proposed delta before it lands.

## 14. Mark PR ready + Jira (AUTOMATED TRANSITION #2) (subagent: pr-author)

Dispatch `pr-author` with `action: "mark_ready"`. It runs `gh pr ready`, posts a final comment on the Jira issue summarizing what shipped (PR URL + screenshot links if heavy) via `addCommentToJiraIssue(cloudId, issueIdOrKey="ICR-N", ...)`, and **transitions the issue `In Progress → In Review`** — resolving the transition by status name (`getTransitionsForJiraIssue` → match `transition.to.name` against `config.tracker.statuses.inReview` → `transitionJiraIssue`), not a hardcoded ID. **This is the second and final automated transition. It does NOT touch Done.**

## 14.5 Post-PR review + CI loop (detached — ScheduleWakeup)

After the PR is **ready** and the issue is **In Review**, `/work` enters a **detached, dynamic-paced loop** that watches the PR's **code-review comments** (including the **Codex review bot**, which posts a few minutes after PR-ready) **and CI**, auto-remediates via the `implementer`, and notifies you when the PR is ready for your eyes. The loop **NEVER merges and NEVER transitions an issue** — it only fixes, replies, and notifies. Merge stays human-only (`/merge`, a later phase).

> **Invariant (unchanged):** this section adds **no** Jira transition and **no** merge. `/work` still owns exactly two automated transitions (steps 3 and 14) and never touches Done. The loop is read-fix-reply-notify only.

### Pre-flight: pin config + decide whether the loop runs

1. **Read `config.reviewLoop`** (added in Phase 0). Pin **by name** — never hardcode the values:
   `driver`, `firstCheckSeconds`, `pollSeconds`, `afterPushSeconds`, `maxIterations`, `totalTimeoutSeconds`, `ciTimeoutSeconds`, `watch`, `idempotency`, `readinessRequires`, `notify`.
2. **Graceful degradation — REQUIRED.** If **`config.reviewLoop` is absent** OR the **`ScheduleWakeup` tool is unavailable at runtime** (it is the spec-mandated driver but may be runtime-only / not present in this harness build), **SKIP the detached loop entirely**. Instead do a **single one-shot check** right now — pull review threads + CI once (the TICK procedure below, steps i–vi, with no scheduling) — then fire **one** `PushNotification` (or, if `PushNotification` is also unavailable, print a plain user message) telling the user the PR is up and they should **watch it manually**: e.g. `"ICR-N PR is up: <prUrl>. Auto-loop unavailable — watch CI + review comments yourself, then /merge when green."`. Then fall through to **step 15 (triage)**. The rest of `/work` MUST NOT break when the loop can't run — the loop is purely additive.
3. If the loop **can** run, initialize loop bookkeeping in the state file (see "Resume-from-state hook" → Shape): `loopActive=true`, `loopIteration=0`, `loopStartedAt=<now-epoch>`, `lastPushAt=0`, `addressedThreadIds=[]` (preserve any pre-existing ids on resume), `lastStepCompleted=14`. Persist before scheduling.

### Schedule the FIRST wakeup, then STOP this turn

```
ScheduleWakeup(
  delaySeconds = config.reviewLoop.firstCheckSeconds,   // ~240s: catch the Codex review bot (it posts a few
                                                         //   minutes after PR-ready) + the first CI signal
  reason = "/work ICR-N post-PR loop: tick 1 — pull review threads + CI for PR <prUrl>"
)
```

Then **STOP this turn — do not block or busy-wait.** The session resumes on the scheduled wakeup and runs the TICK procedure. (`delaySeconds` always comes from `config.reviewLoop`; the comment above is rationale, not a literal source of truth.)

### TICK procedure (runs on every wakeup)

i. **Kill-switch FIRST (before any work):** if `loopIteration >= config.reviewLoop.maxIterations` OR `(now-epoch − loopStartedAt) >= config.reviewLoop.totalTimeoutSeconds` → go to **CAP exit**.
ii. **Increment** `loopIteration`; **persist state** (so caps bind even if the tick does work).
iii. **Pull review threads.** From inside the worktree: `gh pr view <prUrl> --json comments,reviews,reviewThreads`. Cross-check unresolved threads via `mcp__github__pull_request_read` (load first: ToolSearch `select:mcp__github__pull_request_read`). **Actionable threads** = unresolved (`isResolved=false`) AND not our own replies (`author != self`) AND whose `threadId` is **NOT** in `addressedThreadIds`. Filter out pure bot-noise / acknowledgements.
iv. **Pull CI.** `gh pr checks <prUrl>` (and/or `statusCheckRollup` from `gh pr view <prUrl> --json statusCheckRollup`). Classify `ciState` as `green | red | pending`. If **pending** and `(now-epoch − lastPushAt) < config.reviewLoop.ciTimeoutSeconds`, treat CI as **still-running** (NOT red) — a fix we just pushed kicks a fresh run and reading too soon shows stale/pending.
v. **Read the latest QA verdict (`qaPass`).** Use the most recent `acceptance-judge` result / the QA comment dual-posted in step 13.2 — **do NOT re-run QA here.**
vi. **DECISION:** if there are **actionable threads** OR `ciState === red` → go to **FIX branch**. Else → go to **READINESS evaluation**.

### FIX branch (actionable threads and/or red CI)

Dispatch the **`implementer`** subagent (see its `prReviewThreads` input contract) with:

- `prReviewThreads` — the actionable threads as an array, each `{ threadId, commentId, path, line, body, author }`
- `replyPerThread: true`
- `previousFeedback` — when CI is red, the failing-check excerpts (red CI feeds back through the **same** channel)
- `prUrl`, `branch`, `worktreePath`, `ticketId` (`ICR-N`), `commitType`
- `graphifyAvailable`, `graphifyFresh`, `mainRepoRoot`

Instruct: the implementer **invokes `superpowers:receiving-code-review`** (verify / fix / push-back-with-rationale — never blind agreement), fixes on the **feature branch** (NEVER `--no-verify`), commits + pushes to the open PR, and **replies per-thread** via `mcp__github__add_reply_to_pull_request_comment`.

After the implementer returns:

1. **IDEMPOTENCY — persist immediately.** Append every `threadId` the implementer reports as `replied`/`pushed-back` into `addressedThreadIds`, and **persist the state file right away** (`idempotency: "reply-marker"`). This must happen the instant the implementer returns so a crash-then-resume never double-replies. Do **not** mark a `threadId` addressed if the implementer reported it `unreplied`.
2. Set `lastAction="pushed-fix"`, `lastPushAt=<now-epoch>`; persist.
3. **Schedule the next wakeup** at the after-push pace:
   ```
   ScheduleWakeup(
     delaySeconds = config.reviewLoop.afterPushSeconds,   // ~420s: our push kicked a fresh CI run —
                                                           //   wait for it to start + finish before re-checking
     reason = "/work ICR-N post-PR loop: tick <n+1> after push — re-check CI + threads"
   )
   ```
4. **STOP the turn.**

### READINESS evaluation (no actionable threads, CI not red)

Compute `clean` = ALL of `config.reviewLoop.readinessRequires` true:

- `qaPass === true` (latest acceptance-judge verdict)
- `ciState === "green"`
- `commentsAddressed` — no unaddressed actionable threads remain.

- If **clean** → **CLEAN exit**.
- If **not clean only because CI is still pending** → schedule the next **idle** wakeup:
  ```
  ScheduleWakeup(
    delaySeconds = config.reviewLoop.pollSeconds,   // ~270s: idle re-check, inside the 5-min prompt-cache window
    reason = "/work ICR-N post-PR loop: tick <n+1> idle — awaiting CI"
  )
  ```
  Then **STOP the turn.**

### CLEAN exit

Fire the readiness notification (`config.reviewLoop.notify === "push"`):

```
PushNotification(
  status: "proactive",
  message: "ICR-N PR ready for your review: <prUrl> (CI green, QA pass, all review threads addressed)"   // <200 chars
)
```

Set `loopActive=false`; persist. Then **continue to step 15 (triage)** in the same resumed turn. The issue stays **In Review** — the loop never merges, never transitions.

### CAP exit (maxIterations or totalTimeoutSeconds hit)

Fire the "needs your eyes" notification + the reason:

```
PushNotification(
  status: "proactive",
  message: "ICR-N needs your eyes: <reason e.g. 'maxIterations(8) hit' | 'totalTimeout(40m) hit'>, <m> open threads, CI <state>: <prUrl>"   // <200 chars
)
```

Do **NOT** keep scheduling. Leave the issue **In Review** and the PR as-is. Set `loopActive=false`; persist. Then proceed to **step 15** — the human takes over.

> **This loop NEVER merges and NEVER transitions the issue.** It only fixes / replies / notifies. Merge is owned by `/merge` (a later phase) on an explicit human trigger; `Done` stays human-only.

## 14.6 In-session merge hand-off (HUMAN-GATED)

After the post-PR loop (14.5) has reached its **CLEAN** or **CAP** exit and you (the human) have reviewed the PR, you may, **in this same `/work` conversation, explicitly say "merge"**. Only then — merge is **NEVER autonomous**; `config.qaLoop.autoMerge.enabled` stays `false` — `/work` **hands off to the `/merge` logic**.

> **Do NOT reimplement merge here.** The real owner is `.claude/commands/merge.md`. This subsection only routes the live session into that logic; the squash-merge, worktree/branch cleanup, the `In Review → In Testing` transition, and the post-merge staging QA all live there.

On an explicit in-session "merge", run the **`/merge ICR-N`** logic, passing the already-resolved state from this `/work` run so `/merge` does not re-resolve from scratch:

- the `ICR-N` key, `prUrl` / PR number, `branch`, and `worktreePath` (all pinned in the state file / orchestrator state).

`/merge` then, per `merge.md`: enforces `config.merge.requireCiGreen` (**refuses on red/pending CI**), **squash-merges** + deletes the remote branch, removes the local **worktree + branch** (anchored to `MAIN_REPO_ROOT`; if this session is inside the target worktree, it leaves it first via `ExitWorktree`), transitions the issue **In Review → In Testing** (automated transition #3, owned by `/merge`), and runs **post-merge staging QA** (tester → `acceptance-judge` → post to Jira). It **never** transitions the issue to **Done**.

> **`/work`'s contract is unchanged.** `/work` itself still **NEVER merges** and **NEVER transitions an issue to Done**. The third automated transition (`In Review → In Testing`) is owned by **`/merge`**, not `/work` — so `/work` keeps its **exactly-two-transitions** contract (steps 3 and 14). The hand-off is a human-gated delegation, not a new `/work` transition.

## 15. Triage stray observations

Triage runs after the post-PR loop (step 14.5) reaches its **CLEAN** or **CAP** exit, or immediately after step 14 when `config.reviewLoop` is absent / the loop was skipped via graceful degradation.

Open `${MAIN_REPO_ROOT}/tasks/todo.md`. Filter the entries to ones tagged with the current ticket (`ICR-N`). Observations tagged with other tickets or `—` (human, generic) are NOT yours to triage — leave them.

If there are zero entries for the current ticket, skip this step.

### Present each observation to the user

For each entry tagged with the current ticket, ask the user with `AskUserQuestion`:

> Observation: `<the one-line entry>` — what should we do?

Options (one per question, single-select):

- **Promote to Jira** — create a To Do issue. Recommended for anything that's its own piece of work.
- **Fix now** — small enough to address before closing this `/work`. You'll loop back to the implementer with a focused mini-spec.
- **Discard** — was noise, won't track.
- **Keep in todo.md** — leave for later (a different ticket may pick it up; the human will revisit).

### For each "Promote to Jira"

Spawn the `explorer` subagent with `mode: observation-context`. Inputs:

- the raw observation line
- the file/area it points at (parse from the `— <file:line>` suffix if present)
- `graphifyAvailable: <GRAPHIFY_AVAILABLE>`
- `graphifyFresh: <GRAPHIFY_FRESH>`
- `mainRepoRoot: <MAIN_REPO_ROOT>`

The explorer returns a structured issue draft (fields: `title`, `description`, `relatedFiles`, `acceptanceCriteria`, `suggestedIssueType`, `suggestedLabels`). Create the issue in **To Do**:

```
mcp__atlassian-divinelab__createJiraIssue(
  cloudId: config.tracker.cloudId,
  projectKey: "ICR",
  issueTypeName: <draft.suggestedIssueType ?? "Task">,   // Bug | Story | Task
  summary: <draft.title>,
  description: <draft.description>,
  additional_fields: { labels: <draft.suggestedLabels as free-form strings, optional> }
)
```

New issues land in **To Do** (the default status at creation) — no transition needed. Do NOT set Priority or QA Depth (human-set during refinement). Capture the new issue's browse URL (`https://divinelab.atlassian.net/browse/<key>`); show the user: _"Promoted: `<observation>` → `<issue URL>`"_.

### For each "Fix now"

Dispatch the `implementer` with a small focused mini-spec (the observation + relevant files). Run `verifier` after. If it passes, commit + push to the open PR. Then remove the entry from todo.md.

### For each "Discard" / "Keep"

Discard: remove the entry from todo.md. Keep: leave the entry as-is.

### Clean up todo.md

After processing, rewrite `tasks/todo.md` with all the entries that were NOT discarded/promoted/fixed. The "Open observations" header stays. Other concurrent worktrees' entries stay untouched.

### Report

Summarize to the user:

- Promoted to Jira: `<count>` issues (URLs)
- Fixed now: `<count>` (commits)
- Discarded: `<count>`
- Kept for later: `<count>`

## 16. Lessons

**Mandatory** after any user correction during this run, per `~/CLAUDE.md` Self-Improvement Loop: "After ANY correction from the user: update `tasks/lessons.md` with the pattern." If a correction landed (user told you to do something different than what you proposed, fixed a wrong assumption, redirected scope, etc.), you MUST append an entry capturing the pattern in imperative form to `${config.paths.lessons}` referencing `ICR-N`, so future runs avoid the same mistake.

Optional (but encouraged) if no corrections came up but you spotted a useful pattern worth carrying forward.

Report the final summary to the user: PR URL, Jira issue URL, files touched, QA results, promoted-from-observations count. Stop. **You do not merge and you do not transition the issue to Done — the human does both.** Delete the state file on successful completion.

---

## Resume-from-state hook

To survive aborted runs (user `Ctrl-C`, machine sleep, network drop), the orchestrator persists progress to a state file alongside the spec.

### Where

`${MAIN_REPO_ROOT}/${config.paths.specs}/ICR-N-<slug>.state.json` — in the **main checkout**'s `tasks/specs/` (gitignored). The orchestrator (this main session) owns it, so unlike the spec + plan — which section 8.3 moves into the worktree — the state file stays in main, keeping resume state durable even if the worktree is removed on an aborted run.

### Shape

```json
{
  "ticketId": "ICR-N",
  "branch": "feat/ICR-N-...",
  "worktreePath": "/abs/.../.claude/worktrees/ICR-N",
  "prUrl": "https://github.com/.../pull/M",
  "qaDepth": "standard",
  "lastStepCompleted": 11,
  "checkpointsCompleted": [1, 2],
  "loopActive": false,
  "loopIteration": 0,
  "loopStartedAt": 0,
  "lastPushAt": 0,
  "addressedThreadIds": [],
  "updatedAt": "<iso>"
}
```

### When to write

After completing each major step (5 onward), **and on every post-PR loop tick (step 14.5)** — persist `loopIteration`, `addressedThreadIds`, and `lastPushAt` **before** scheduling the next wakeup (and immediately after the implementer returns in the FIX branch), so a session drop mid-loop resumes idempotently and never double-replies. Overwrite atomically — write to `<file>.tmp` then `mv`. Don't fail the pipeline if the state write fails; just log a warning.

### When to read

At the start of `/work ICR-N`, after pre-flight (step 0) and before pulling the card (step 1). If a state file exists for the requested ticket ID:

1. Read it. Surface to the user with `AskUserQuestion`:
   > Prior `/work ICR-N` run found, last completed step `<N>`. Resume or start over?
   - **Resume from step `<N+1>`** — load `ticketId` (the `ICR-N` key), `branch`, `worktreePath`, `prUrl`, `qaDepth` into orchestrator state and skip ahead. Verify the worktree still exists and is on the right branch; if not, fall back to "start over."
     - **Loop resume:** if `loopActive === true`, the prior run was inside the post-PR loop (step 14.5). Re-load `addressedThreadIds`, `loopIteration`, `loopStartedAt`, and `lastPushAt`, then re-enter the TICK procedure. Do **NOT** re-reply to any thread already in `addressedThreadIds`; before posting any reply, cross-check that the thread's latest reply author is **not** self (guards the crash-after-reply-before-persist window). Re-evaluate the kill switches against the persisted `loopStartedAt` / `loopIteration` — a resume does not reset the caps.
   - **Start over** — delete the state file, clean up the existing worktree + branch (print the commands; don't auto-execute), then run the pipeline from step 0.
2. If the user picks Resume but verification fails (worktree gone, branch deleted), fall back to "Start over" with a warning.

### When to delete

On successful completion of step 16 (lessons), delete the state file. The ticket is done from the harness's perspective. On a Failure-handler trigger, **leave** the state file — the user may want to resume after fixing the cause.

---

## Failure handler

Triggered when the pipeline aborts for any reason after step 11 (the draft PR exists), or hits a 3-attempt cap in the verify or QA loops. Goal: leave the world in a recoverable state — no orphaned PR, no orphaned card, clear next steps for the user.

1. **Comment the draft PR** with a brief postmortem:
   ```
   gh pr comment <pr-url> --body "🛑 Pipeline halted at step <N>. Reason: <one-line>. Attempts: <N>. Last error excerpt below. The branch is left as-is for human review."
   ```
2. **Comment the Jira issue** with the same summary + PR URL via `mcp__atlassian-divinelab__addCommentToJiraIssue(cloudId, issueIdOrKey="ICR-N", ...)`.
3. **Leave the issue In Progress.** Do NOT transition to In Review. **Do NOT transition to Done.**
4. **Do NOT delete the worktree.** The user inspects it. Print the cleanup commands they can run when ready:
   ```
   git worktree remove .claude/worktrees/ICR-N
   git branch -D feat/ICR-N-...
   gh pr close <pr-url>  # only if they're abandoning the work
   ```
5. **Append a lessons entry** to `${MAIN_REPO_ROOT}/tasks/lessons.md` describing what failed and what to change next time, per the global self-improvement rule.
6. **Stop.** Do not attempt to restart or recover automatically.

---

## The EXACTLY-two transitions /work owns

- **OWNS — Transition #1:** `To Do → In Progress` at **step 3**, via `getTransitionsForJiraIssue` → `transitionJiraIssue` matched **by status name** to `config.tracker.statuses.inProgress`, immediately after the mandatory worktree exists.
- **OWNS — Transition #2:** `In Progress → In Review` at **step 14** (delegated to `pr-author`), via `getTransitionsForJiraIssue` → `transitionJiraIssue` matched **by status name** to `config.tracker.statuses.inReview`, paired with the PR-link `addCommentToJiraIssue`, only after `gh pr ready`.
- **MUST NOT do:** transition any issue to **Done** — ever, in any step, subagent, or the failure handler. Also does not transition issues into `Backlog` or `To Do` (PM/human-owned grooming; `/work` only reads them). The failure handler explicitly leaves the issue in **In Progress**.
- **NOT `/work`'s — Transition #3 is owned by `/merge`:** the third automated transition, `In Review → In Testing` (`config.tracker.statuses.inTesting`), is dispatched **only** on an explicit in-session human "merge" (the **14.6** hand-off to `merge.md`) — `/work` itself never performs it. So `/work` still owns exactly Transitions #1 and #2 and never touches Done; `/merge` owns Transition #3 after a verified squash-merge.

## Notes for the main thread

- **Branch hygiene**: never commit on `main`. The worktree ensures this — the branch is created off `origin/main` and lives in a sibling directory.
- **Concurrency**: `/work` is safe to run in parallel sessions on different tickets. The worktree-per-ticket isolation means no branch or file collisions.
- **Cost discipline**: depth scales QA EFFORT, not whether QA runs. Every testable ticket gets at least its TYPE's baseline QA (ui/api/chore); reserve `heavy` (authored e2e + both-locale walk) for high-risk tickets.
- **Self-correction**: if any subagent returns "I don't know how to proceed", stop the pipeline and surface to the user rather than guessing.
- **Failure modes**: the verify-loop and QA-loop guards (steps 10, 12, 13) enforce a 3-attempt cap with prior-error diff. Both routes call the Failure handler above.
- **The two automated Jira transitions are the only tracker state changes `/work` makes; Done is exclusively human.**
