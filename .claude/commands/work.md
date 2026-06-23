---
description: Pull a Trello card and drive it through spec → plan → implement → verify → QA → PR. Two human gates (brainstorm + spec review). Two automated Trello moves; never Done.
argument-hint: ICR-N
---

# /work — Ticket-Driven Pipeline Orchestrator

This command is the orchestrator playbook. **You (the main thread) follow it step by step.** Spawn subagents only at the points marked `(subagent: …)`. Human gates (★) stay in this conversation — never delegate them.

The ticket key is in `$1` (e.g., `ICR-45`). If empty, ask the user.

Task tracking lives in **Trello board "IDC Redentor website"** (`boardId 67a7a743186065f07e87bbe9`, shortLink `sxuUAeck`), accessed via the **Trello MCP** (`mcp__trello__*`; many tools are deferred — load them via ToolSearch `select:mcp__trello__get_card,mcp__trello__get_cards_by_list_id,mcp__trello__move_card,mcp__trello__add_comment,...` before first use). **`ICR-N` is a derived display key: `N` is the Trello card's `idShort`.** There is no native key field — resolve the card by `idShort`, then use its Trello `id` for every write.

Always read `.claude/config.json` first — every command, path, list id/name, and the `config.tracker.workflow` order comes from there. Do not hardcode commands/paths. **Trello cards move between lists by `listId`** (from `config.tracker.lists`), not by status name — never invent a listId.

## List workflow & human gate

The board flow (`config.tracker.workflow`, in order) is:

`Dsicovery → To Do → In Progress → In Review → Done`

**`/work` owns exactly two Trello moves:**

1. **To Do → In Progress** (step 3) — `move_card` to `config.tracker.lists.inProgress.id`, right after the worktree exists.
2. **In Progress → In Review** (step 14, via `pr-author` at PR-ready) — `move_card` to `config.tracker.lists.inReview.id`, paired with a PR-link comment.

**`/work` must NEVER move a card to Done.** `Done` is **human-only** — set when the human merges the PR and closes the card. There is intentionally no Done move anywhere in this pipeline, in any subagent, or in the failure handler. `Dsicovery` and `To Do` are also human/PM-owned (grooming) — `/work` only reads them.

Every Trello **write** (`move_card`, `add_comment`, `update_card_details`) happens at or after a human gate, mirroring our discipline: the two moves above occur after the worktree exists and after the PR is ready, respectively; the PR-link comment is posted with the In Review move.

---

## 0. Pre-flight

1. Read `.claude/config.json`. Pin to local variables: `config.commands`, `config.paths`, `config.worktree`, `config.playwrightProjectMap`, `config.graphify`, and the whole `config.tracker` block — `boardId`, `lists` (id+name for `todo`/`inProgress`/`inReview`/`done`), `workflow`, `labelToCommitType`, `ticketKeyPrefix`. **Do not pin or hardcode anything Done-related as a move target.**
2. Read `${config.paths.lessons}` (`tasks/lessons.md`) — internalize prior corrections before working.
3. Validate `$1` matches `ICR-\d+` (case-insensitive; normalize to uppercase). Extract `N` (the numeric `idShort`). If it doesn't match, stop and ask the user.
4. **Resume check** — see "Resume-from-state hook" at the end of this file; run it here, before pulling the card. If a state file exists for this ticket, branch to resume / start-over.
5. Verify `${config.paths.qaEnv}` (`qa-env.json`) exists at `MAIN_REPO_ROOT`. If missing, warn: "Create `qa-env.json` (Vercel preview baseUrl) before heavy QA." Do **not** hard-stop for `light`/`standard` (Phase 1 QA is report-only against preview deploys), but record that heavy QA is unavailable.
6. Resolve `MAIN_REPO_ROOT` early: `git rev-parse --git-common-dir` then `dirname`. Pin it — every later step that needs the main repo path uses this.
7. **Activate the Trello board**: `mcp__trello__set_active_board(boardId="67a7a743186065f07e87bbe9")` so later list/card calls resolve on the right board.
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

**Relationship to the git post-commit hook**: `graphify hook install` keeps the *code* side of the graph fresh continuously (AST re-extract on every commit, no LLM). This per-session `graphify update` is still worth running because it also re-extracts *doc/content* (semantic) changes the AST hook ignores, and folds in any `graphify save-result` memory entries from prior sessions. So: commits keep code fresh for free; `/work` catches semantic drift once per session.

## 1. Pull the Trello card

`ICR-N` is a derived display key — there is no native key lookup. Resolve the card by `idShort = N`:

1. Preferred path — `mcp__trello__get_lists(boardId)` then `mcp__trello__get_cards_by_list_id` across the active lists (`todo`, `inProgress`, `inReview`; also `discovery`/`done` for the "already-past" check), matching the card whose `idShort === N`. If a faster `get_my_cards` or a direct card id is available, use it. Pin the resolved Trello **`id`** (`cardId`) — every write uses it; pin `idShort` for the display key `ICR-N`.
2. From the card capture: `id`, `idShort`, `name` (title), `desc` (description), the list it currently sits in, `labels`, `due`/`shortUrl` (the `https://trello.com/c/<shortLink>` URL), and any custom fields.
3. Read field values:
   - **QA Depth** — resolve per `config.qaDepth.sourceNote` (custom field → label/desc token → default `standard`). Reject if not in `config.qaDepth.allowed`.
   - **Priority** — Trello has no native priority; if a `Priority` label or `Priority: <x>` token exists, record it for the brainstorm; otherwise prompt once during refinement (step 6).
   - **Current list** — log only; you transition it later.
4. **Commit-type inference** from labels via `config.tracker.labelToCommitType`: `Bug`→`fix`, `Feature`→`feat`, `Integration`→`feat`|`chore` (pick after brainstorm), `NFR`→`chore` (or `refactor`/`perf`). Override if `card.name` explicitly starts with `chore:`/`docs:`/etc.
5. **Already-past guard**: if the card currently sits in `In Review` or `Done` (any `config.tracker.workflow` entry with `order > inProgress.order`), stop and ask the user whether to continue. If it sits in `Dsicovery`/`To Do`, proceed. If its list isn't in `config.tracker.lists`, surface the drift rather than proceeding silently.

## 2. Create worktree + branch  ★ MANDATORY

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

## 3. Move card → In Progress  (AUTOMATED MOVE #1)

1. `mcp__trello__move_card(cardId=<id>, listId=config.tracker.lists.inProgress.id /* "67a7a74bc9dd606c2e41cea2" */)`.
2. Verify by re-reading the card or trusting the move result. If the move fails, stop and report (do not proceed silently).
3. (Optional, gated) post a short start comment via `add_comment` — only if the team wants it; default is no comment until PR-ready to keep writes minimal.

> Rule for the rest of the pipeline: `/work` drives only **In Progress** (here) and **In Review** (step 14). Never `Done`. Never `Dsicovery`/`To Do`.

## 4. Ensure scratchpad exists

`tasks/todo.md` lives at `${MAIN_REPO_ROOT}/tasks/todo.md` (gitignored) and is shared across all concurrent worktrees as the stray-observations log. If it doesn't exist, create it with the following exact contents (the file is gitignored, so a fresh clone won't have it):

````markdown
# tasks/todo.md — Stray Observations Log

**This file is gitignored.** Append-only scratchpad for things agents (and you) notice while working but that don't belong in the current ticket. At the end of each `/work` run, the orchestrator triages entries tagged with the current ticket and promotes them to Trello cards in **To Do** (board IDC Redentor website).

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

## 5. Explore  (subagent: explorer)

Dispatch the `explorer` subagent with:
- `mode: ticket-context`
- card title + description
- obvious areas if clear from the title (blog? contact/subscribe forms? likes/Mongo? i18n? CSP/headers? Contentful data layer?)
- `graphifyAvailable: <GRAPHIFY_AVAILABLE>`
- `graphifyFresh: <GRAPHIFY_FRESH>`
- `mainRepoRoot: <MAIN_REPO_ROOT>`

Wait for the subagent's summary (≤400 words). It returns relevant files, existing patterns, reusable utilities, **Sensitive areas touched**, and risk notes. Save the summary in conversation context — you'll feed it into brainstorming.

## 6. Brainstorm  ★ HUMAN GATE ★

Invoke the `superpowers:brainstorming` skill. Pass the card description + explorer findings as initial context.

**Do not skip this even for "simple" tickets.** The brainstorming skill is rigid; follow it. The user will steer scope, design choices, edge cases. Outcome: an agreed design in conversation (not yet a doc).

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

Trello has no native priority. If unset and the team wants one, optionally add a `Priority: <x>` token via `update_card_details` once — a single touch, never re-touched. (Lower-stakes than a Jira priority field; the team may skip this entirely.)

## 7. Write the spec

Write the spec to `${config.paths.specs}/ICR-N-<slug>.md`. Required sections (ICR-tailored):

1. **Dependencies Check** — what must exist before starting
2. **Requirements** — numbered, code-level detail
3. **Data Model Changes** — TypeScript interfaces; **Contentful GraphQL fragments** (hand-written in `lib/contentful/*`, NOT codegen — ignore `codegen.ts`); MongoDB indexes only if the **likes** feature is touched
4. **API Changes** — Zod schemas + request/response contracts for `src/app/api/*` routes
5. **New Files / Modified Files** — tables with purpose or change description
6. **Component Hierarchy** — ASCII tree (`src/components/{features,shared,ui}`), responsive variants if UI
7. **Edge Cases** — numbered, with expected behavior
8. **i18n** — keys for **`es-AR` (default) and `en-US`** in `public/locales/{es-AR,en-US}.json`; note next-intl routing (`src/i18n/*`, proxy at `src/proxy.ts`)
9. **Testing Strategy** — **Vitest** unit smoke (minimal seeded) + manual smoke against the Vercel **preview** deploy + which `config.playwrightProjectMap` tags apply (e2e specs authored per-ticket on heavy depth only)
10. **Implementation Checkpoints** — numbered. Each has: files touched, verification steps, conventional-commit message in `<type>(ICR-N): …` form
11. **Open Questions** — anything deferred

Flag sensitive areas if touched: **email services, forms (contact/subscribe), likes/Mongo writes, CSP/headers, env/secrets.**

**★ HUMAN GATE ★** — Ask the user explicitly: "Spec written to `<path>`. Please review and let me know if any changes before I write the implementation plan." Wait for approval. Apply revisions until they're happy.

## 8. Write the implementation plan

Invoke the `superpowers:writing-plans` skill. Output goes to `${config.paths.specs}/ICR-N-<slug>.plan.md` (same dir, `.plan.md` suffix). The plan turns each spec checkpoint into concrete file edits with verification steps.

### 8.1 Ticket-too-large guard

After the plan is written, count the **Implementation Checkpoints** in it (each numbered checkpoint = 1). If the count is **> 8**, surface to the user with `AskUserQuestion`:

> The plan has `<N>` checkpoints. Tickets with more than 8 are usually better split into multiple Trello cards (smaller scope = faster PRs + easier review). Continue with this ticket as-is, or stop and split?

Options:
- **Continue anyway** — proceed to step 9 (you've decided the size is justified).
- **Stop and split** — abort the pipeline cleanly. The spec + plan files stay; the worktree stays; the card stays **In Progress**. Print: "Pipeline paused at step 8.1. Spec is at `<path>`. Suggest splitting into N follow-up Trello cards in To Do, then `/work` each separately."

This guard is a one-time gate; once the user picks "Continue anyway," subsequent checkpoints inside the same `/work` run don't re-trigger.

## 9. First checkpoint: implement  (subagent: implementer)

Dispatch the `implementer` subagent with:
- `specPath` — `tasks/specs/ICR-N-<slug>.md`
- `planPath` — `tasks/specs/ICR-N-<slug>.plan.md`
- `checkpointNumber: 1`
- `branch` — current feature branch name
- `worktreePath` — absolute path to the worktree
- `commitType` — conventional-commit prefix derived from the Trello label
- `ticketId` — `ICR-N`
- `graphifyAvailable: <GRAPHIFY_AVAILABLE>`
- `graphifyFresh: <GRAPHIFY_FRESH>`
- `mainRepoRoot: <MAIN_REPO_ROOT>`

The implementer composes `superpowers:test-driven-development` + `superpowers:executing-plans`. It commits at the end of the checkpoint with message `<type>(ICR-N): …`.

## 10. First verify  (subagent: verifier)

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

## 11. Open draft PR  ★ EARLY ★  (subagent: pr-author)

Dispatch the `pr-author` subagent with `action: "open_draft"`. Inputs:
- `action: "open_draft"`
- `ticketId` — `ICR-N`
- `ticketTitle` — the Trello card name
- `ticketUrl` — `https://trello.com/c/<shortLink>` (or the card `shortUrl`)
- `branch` — feature branch
- `worktreePath` — absolute path
- `commitType` — derived from the Trello label
- `explorerSummary` — output from the explorer subagent (used for the Changes section)
- `specPath` — for pulling the Summary
- `verifierLastReport` — used to pre-tick Test-plan checkboxes
- `prTemplatePath` — `.github/PULL_REQUEST_TEMPLATE.md`

pr-author runs `git push -u origin <branch>`, `gh pr create --draft` with a **conventional title `<type>(ICR-N): <description>`** (satisfies `pr.yml`'s `amannn/action-semantic-pull-request`), fills the near-empty `# Description` / `# Changes` template, then posts a Trello comment with the PR URL via `add_comment(cardId, ...)`. **Card stays In Progress.**

After this point, **every subsequent checkpoint commit-and-pushes to this open PR**, so cloud review agents can review iteratively.

## 12. Remaining checkpoints (loop)

For each remaining checkpoint N in the plan:
1. Dispatch `implementer` with the same input shape as step 9 but `checkpointNumber: N`. Include `previousFeedback` if re-dispatching after a verifier failure.
2. Dispatch `verifier` with the same inputs as step 10.
3. If verify passes, the implementer has already pushed. Move on.
4. If verify fails, **apply the Verify-loop guard from step 10** (max 3 attempts per checkpoint, diff prior failures). Loop until clean.

When all checkpoints are done, move to QA.

## 13. QA  (subagent: qa-runner)

Compute `changedPaths` first: `git diff --name-only origin/main...HEAD` (from inside the worktree).

Dispatch `qa-runner` with:
- `depth` — QA Depth from the card
- `worktreePath` — absolute path
- `ticketId` — `ICR-N`
- `slug` — kebab-case slug from the card name
- `changedPaths` — array from the `git diff` above
- `mainRepoRoot: <MAIN_REPO_ROOT>`

The runner reads `qa-env.json` itself (Vercel preview baseUrl; the host must match the `*.vercel.app` allowlist).

- `light` — runner returns immediately; the verifier already covered it.
- `standard` — runner runs Playwright tags per `config.playwrightProjectMap` for the changed paths against the **preview deploy** (Phase 1: runs only the specs that exist; report-only). No MCP walk. No new spec.
- `heavy` — runner runs the standard suite, then drives Chrome via `mcp__plugin_playwright_playwright__*` through the new feature on the preview URL, then writes a new `e2e/<area>/<slug>.spec.ts` and commits+pushes it.

### QA-loop guard ★ MAX 3 ATTEMPTS

Same shape as the Verify-loop guard. Maintain `qaAttemptCount` and `lastTwoQaFailures`. After 3 attempts, **STOP** and trigger the Failure handler. If the failure output is identical to the prior attempt, surface before re-dispatching.

If QA fails (and we have attempts left), route back to the implementer with the failures. Re-run the verifier after, then re-dispatch qa-runner. **Phase 1 is report-only — QA findings are reported; `/work` does not auto-remediate beyond this loop and never auto-merges.**

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

## 14. Mark PR ready + Trello  (AUTOMATED MOVE #2)  (subagent: pr-author)

Dispatch `pr-author` with `action: "mark_ready"`. It runs `gh pr ready`, posts a final Trello comment summarizing what shipped (PR URL + screenshot links if heavy) via `add_comment(cardId, ...)`, and **moves the card `In Progress → In Review`** via `move_card(cardId, listId=config.tracker.lists.inReview.id /* "67a7a74df6bfc532c70a06c8" */)`. **This is the second and final automated move. It does NOT touch Done.**

## 15. Triage stray observations

Open `${MAIN_REPO_ROOT}/tasks/todo.md`. Filter the entries to ones tagged with the current ticket (`ICR-N`). Observations tagged with other tickets or `—` (human, generic) are NOT yours to triage — leave them.

If there are zero entries for the current ticket, skip this step.

### Present each observation to the user

For each entry tagged with the current ticket, ask the user with `AskUserQuestion`:

> Observation: `<the one-line entry>` — what should we do?

Options (one per question, single-select):
- **Promote to Trello** — create a To Do card. Recommended for anything that's its own piece of work.
- **Fix now** — small enough to address before closing this `/work`. You'll loop back to the implementer with a focused mini-spec.
- **Discard** — was noise, won't track.
- **Keep in todo.md** — leave for later (a different ticket may pick it up; the human will revisit).

### For each "Promote to Trello"

Spawn the `explorer` subagent with `mode: observation-context`. Inputs:
- the raw observation line
- the file/area it points at (parse from the `— <file:line>` suffix if present)
- `graphifyAvailable: <GRAPHIFY_AVAILABLE>`
- `graphifyFresh: <GRAPHIFY_FRESH>`
- `mainRepoRoot: <MAIN_REPO_ROOT>`

The explorer returns a structured card draft (fields: `title`, `description`, `relatedFiles`, `acceptanceCriteria`, `suggestedLabels`). Create the card in **To Do**:

```
mcp__trello__add_card_to_list(
  listId: "67b500c7c65a4d3edf11e180",   // config.tracker.lists.todo.id
  name:   <draft.title>,
  description: <draft.description>
)
```

Apply labels (Feature/Bug/Integration/NFR) per `suggestedLabels` via `update_card_details` / `get_board_labels`. New cards land in **To Do** by virtue of the target listId. Capture the new card's `shortUrl`; show the user: _"Promoted: `<observation>` → `<card URL>`"_.

### For each "Fix now"

Dispatch the `implementer` with a small focused mini-spec (the observation + relevant files). Run `verifier` after. If it passes, commit + push to the open PR. Then remove the entry from todo.md.

### For each "Discard" / "Keep"

Discard: remove the entry from todo.md. Keep: leave the entry as-is.

### Clean up todo.md

After processing, rewrite `tasks/todo.md` with all the entries that were NOT discarded/promoted/fixed. The "Open observations" header stays. Other concurrent worktrees' entries stay untouched.

### Report

Summarize to the user:
- Promoted to Trello: `<count>` cards (URLs)
- Fixed now: `<count>` (commits)
- Discarded: `<count>`
- Kept for later: `<count>`

## 16. Lessons

**Mandatory** after any user correction during this run, per `~/CLAUDE.md` Self-Improvement Loop: "After ANY correction from the user: update `tasks/lessons.md` with the pattern." If a correction landed (user told you to do something different than what you proposed, fixed a wrong assumption, redirected scope, etc.), you MUST append an entry capturing the pattern in imperative form to `${config.paths.lessons}` referencing `ICR-N`, so future runs avoid the same mistake.

Optional (but encouraged) if no corrections came up but you spotted a useful pattern worth carrying forward.

Report the final summary to the user: PR URL, Trello card URL, files touched, QA results, promoted-from-observations count. Stop. **You do not merge and you do not move the card to Done — the human does both.** Delete the state file on successful completion.

---

## Resume-from-state hook

To survive aborted runs (user `Ctrl-C`, machine sleep, network drop), the orchestrator persists progress to a state file alongside the spec.

### Where

`${config.paths.specs}/ICR-N-<slug>.state.json` — same directory as the spec and plan.

### Shape

```json
{
  "ticketId": "ICR-N",
  "cardId": "<trello-card-id>",
  "idShort": 0,
  "branch": "feat/ICR-N-...",
  "worktreePath": "/abs/.../.claude/worktrees/ICR-N",
  "prUrl": "https://github.com/.../pull/M",
  "qaDepth": "standard",
  "lastStepCompleted": 11,
  "checkpointsCompleted": [1, 2],
  "updatedAt": "<iso>"
}
```

### When to write

After completing each major step (5 onward). Overwrite atomically — write to `<file>.tmp` then `mv`. Don't fail the pipeline if the state write fails; just log a warning.

### When to read

At the start of `/work ICR-N`, after pre-flight (step 0) and before pulling the card (step 1). If a state file exists for the requested ticket ID:

1. Read it. Surface to the user with `AskUserQuestion`:
   > Prior `/work ICR-N` run found, last completed step `<N>`. Resume or start over?
   - **Resume from step `<N+1>`** — load `cardId`, `branch`, `worktreePath`, `prUrl`, `qaDepth` into orchestrator state and skip ahead. Verify the worktree still exists and is on the right branch; if not, fall back to "start over."
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
2. **Comment the Trello card** with the same summary + PR URL via `mcp__trello__add_comment(cardId, ...)`.
3. **Leave the card in In Progress.** Do NOT move to In Review. **Do NOT move to Done.**
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

- **OWNS — Move #1:** `To Do → In Progress` at **step 3**, via `mcp__trello__move_card(cardId, listId="67a7a74bc9dd606c2e41cea2")`, immediately after the mandatory worktree exists.
- **OWNS — Move #2:** `In Progress → In Review` at **step 14** (delegated to `pr-author`), via `mcp__trello__move_card(cardId, listId="67a7a74df6bfc532c70a06c8")`, paired with the PR-link `add_comment`, only after `gh pr ready`.
- **MUST NOT do:** move any card to **Done** (`67a7a758f2da48a6482634a2`) — ever, in any step, subagent, or the failure handler. Also does not move cards into `Dsicovery` or `To Do` (PM/human-owned grooming lists; `/work` only reads them). The failure handler explicitly leaves the card in **In Progress**.

## Notes for the main thread

- **Branch hygiene**: never commit on `main`. The worktree ensures this — the branch is created off `origin/main` and lives in a sibling directory.
- **Concurrency**: `/work` is safe to run in parallel sessions on different tickets. The worktree-per-ticket isolation means no branch or file collisions.
- **Cost discipline**: skip phases the QA Depth doesn't warrant. Don't run heavy QA on `light` tickets.
- **Self-correction**: if any subagent returns "I don't know how to proceed", stop the pipeline and surface to the user rather than guessing.
- **Failure modes**: the verify-loop and QA-loop guards (steps 10, 12, 13) enforce a 3-attempt cap with prior-error diff. Both routes call the Failure handler above.
- **The two automated Trello moves are the only tracker state changes `/work` makes; Done is exclusively human.**
