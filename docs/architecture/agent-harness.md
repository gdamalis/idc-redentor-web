# Agent Harness

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** How to use the Claude Code agent harness on this repo — the agents and slash commands, the
> human-gated Jira automation (Backlog → To Do → In Progress → In Review → **In Testing** → Done, with
> **Done human-only**), the branch/PR/merge conventions, the always-on type-aware QA on both the Vercel
> preview and **staging**, the detached **post-PR review + CI loop**, and the user-triggered `/divinelab:merge`.
> **Harness brain:** `.claude/config.json` (canon-schema, validated by the `divinelab:canon` skill) is the single
> source of truth — every command and agent reads it first. This doc narrates it; on any disagreement the JSON wins.
> **Last reviewed:** 2026-07-02 (plugin migration)

## What it is

A set of focused subagents plus orchestrating slash commands that take a church-team idea from a Jira
issue all the way to a merged-and-staging-verified change. The harness is **human-gated at two points**:
(1) a _conditional_ brainstorm/spec gate during `/divinelab:work`, and (2) the **merge approval** — a human triggers
`/divinelab:merge`. Agents do the mechanical work (research, implement, verify, QA, open PRs, address review
comments, run the squash-merge when asked, run staging QA, transition issues forward) but **no agent ever
_autonomously_ merges, and no agent ever moves an issue to Done.** The harness itself — the slash commands, the
nine dev subagents, and the session/graph hooks — ships as the **divinelab plugin** (Claude Code marketplace
`DivineLab/divinelab-plugins`, enabled in `.claude/settings.json`). This repo carries only the **project facts**
in `.claude/config.json` (canon-schema, validated by the plugin's `divinelab:canon` skill) plus the local
**`/predica` domain command + its `predica-*` agents + `.claude/scripts/predica/`** (not part of the plugin).

> **What changed from v1.** v1 stopped at _"idea → reviewed PR"_ — it had a human merge every PR by hand and
> QA'd against per-PR Vercel previews only, with no dedicated staging target. v2 extended the pipeline to
> _"idea → merged → staging-verified"_: it added the **In Testing** status, a real **staging** QA env
> (`staging.idcredentor.org` / `website-staging` DB), the **`divinelab:acceptance-judge`** verdict agent (split
> from the QA tester), the detached **post-PR loop**, and the user-triggered **`/divinelab:merge`** command. Merge
> is not "humans do it by hand" — the human _triggers_ `/divinelab:merge`, which performs the squash. `autoMerge`
> stays `false`; nothing merges autonomously. The generic harness now lives in the reusable **divinelab plugin**
> (shared across the Divine Lab projects); this repo supplies only the ICR-specific facts (`.claude/config.json`)
> and the `/predica` domain pipeline, wiring the plugin to its `apps/web` monorepo, its Contentful-backed
> no-auth site, and its Vercel staging/prod split.

## Commands

| Command                                 | Backed by                                                                                                                                | Does                                                                                                                                                                                                                                                                                                                            | Issue transitions                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **`/divinelab:pm`**                     | `divinelab:product-manager`                                                                                                              | Intake a raw idea → To Do issue; refine a thin issue to ready; groom the Backlog + To Do statuses. Enforces `docs/product/scope-and-boundaries.md`. **Never implements.**                                                                                                                                                       | Creates/updates issues up to **To Do**; never past it                                            |
| **`/divinelab:work [ICR-N]`**           | divinelab:explorer → divinelab:implementer → divinelab:verifier → divinelab:qa-runner → divinelab:acceptance-judge → divinelab:pr-author | Pick up a ready issue, refine-gate it, create a worktree + branch, (conditionally) brainstorm + spec, implement ↔ verify, open a draft PR, run always-on type-aware pre-merge QA on the preview, mark ready, then run the detached post-PR review + CI loop. Hands off to `/divinelab:merge` on an explicit in-session "merge". | **To Do → In Progress** (step 3), **In Progress → In Review** (step 14, via divinelab:pr-author) |
| **`/divinelab:merge ICR-N`**            | `/divinelab:work` hand-off or standalone                                                                                                 | **User-triggered ONLY.** Squash-merge the PR (refuse on red/pending CI), delete the worktree + branch, transition the issue → In Testing, then run post-merge **staging** QA. **Never merges autonomously; never moves to Done.**                                                                                               | **In Review → In Testing** (after a verified squash-merge)                                       |
| **`/divinelab:qa [ICR-N] [--preview]`** | `divinelab:qa-acceptance` (tester) → `divinelab:acceptance-judge` (verdict)                                                              | Acceptance QA against the **staging** deployment by default; `--preview` re-targets the PR's Vercel preview. Posts a structured Jira comment with inline screenshots. **Phase 1: report-only.**                                                                                                                                 | May transition To Do/In Progress → In Review on the **preview** path only; **never Done**        |
| **`/divinelab:verify`**                 | divinelab:verifier (+ divinelab:security-reviewer)                                                                                       | Run `pnpm type-check && pnpm lint && pnpm test && pnpm build` and security checks. Local-only.                                                                                                                                                                                                                                  | none                                                                                             |

## The agents

The roster ships in the **divinelab plugin** (dispatched as `divinelab:<name>` via the Task tool) — run
`/agents` or check the plugin for the live set. The nine dev agents:

- **`divinelab:product-manager`** (`/divinelab:pm`) — turns ideas into well-formed Jira issues and grooms the backlog, grounded
  in `docs/product/`. Three modes: **intake** (raw idea → To Do issue), **refine** (thin issue → ready),
  **groom** (read-only audit of **Backlog + To Do**). Never writes code, never branches/PRs, never transitions
  an issue past To Do. Flags sensitive areas (email, contact/subscribe PII, likes Mongo writes, env/secrets, CSP).
- **`divinelab:explorer`** — read-only codebase research for `/divinelab:work`. Two modes: `ticket-context` (default) summarizes
  relevant code/patterns/risks for an incoming issue **and emits two machine-readable signals**:
  `Suggested QA depth` (`light|standard|heavy`) and a `needsDesignGate: true|false` line that drives whether
  `/divinelab:work`'s brainstorm + spec gates fire; `observation-context` enriches a stray `tasks/todo.md` line into a
  Jira issue draft (JSON). Uses the graphify graph when present (see below).
- **`divinelab:implementer`** — writes the change inside the feature-branch worktree, TDD-first, following the
  conventions in `CLAUDE.md` / `AGENTS.md`. In the post-PR loop it also takes
  **PR review-comment threads** as input: it invokes `superpowers:receiving-code-review` (verify → fix →
  push back with rationale, never blind agreement), fixes on the feature branch (**never `--no-verify`**),
  and **replies once per thread** via `mcp__github__add_reply_to_pull_request_comment`. Red CI is fed back
  through the same channel.
- **`divinelab:verifier`** — runs the gate commands (`pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`) per QA
  depth and reports failures rather than inventing missing scripts. Runs on the cheap model tier (haiku).
- **`divinelab:pr-author`** — opens the draft PR with a conventional-commit title `<type>(ICR-N): description`, fills
  the template, posts the PR-link Jira comment, and at `mark_ready` flips the PR to ready and transitions the
  issue **In Progress → In Review**. Runs a **mandatory secret-scrub** on every PR body and Jira comment write.
  **Never merges, never moves to Done.** The `In Review → In Testing` transition is owned by `/divinelab:merge`,
  not pr-author — preserving pr-author's single responsibility.
- **`divinelab:qa-runner`** — **tester-only**, type- and depth-aware automated QA. `qaType` decides **what** to test
  (`ui` → MCP browser walk + screenshots **always**; `api` → request-level checks at the network boundary;
  `chore` → vitest/local only, no browser); `depth` is the **effort dial within a type, never an on/off
  switch** (there is no `light = skip`). Env-aware by name (`preview`|`staging`). It produces
  **evidence**; it does not render the verdict.
- **`divinelab:qa-acceptance`** — **tester-only** per-issue acceptance QA: reads the issue's acceptance criteria (Spanish
  or English), drives a real browser via the Playwright MCP and hits APIs against the env resolved **by name**
  (`preview`|`staging`), captures screenshots, and returns a raw evidence bundle. The authoritative verdict
  comes from the `divinelab:acceptance-judge`, not here.
- **`divinelab:acceptance-judge`** — **fresh, evidence-only product verdict.** Modeled on
  `divinelab:security-reviewer` (fresh context, adversarial, read-only, **no execution** — never drives a browser, runs
  a command, hits an API/Mongo, or re-runs QA). Inputs = the tester's evidence bundle + the issue's acceptance
  criteria. Output = a structured compliance verdict (overall `pass|partial|fail` + per-AC
  `{n, text, type, verdict, rationale, evidenceRef}`) shaped to drop straight into the jira-result table.
  **Separation of concerns:** the **tester** proves _what the system does_ (evidence); the **judge** decides
  _whether that meets the issue_ (product). Never fused — the judge's verdict supersedes any provisional
  result the tester emitted.
- **`divinelab:security-reviewer`** — fresh, diff-only security + performance review. Scans a PR/branch diff against the
  sensitive paths (services, API routes, `proxy.ts`, `lib/contentful/fetch.ts`, `config/headers.js`, env
  files) and returns a structured gating verdict. Used by `/divinelab:qa` and `/divinelab:verify`; can run ad hoc.

## Jira: keys, project, and the human gates

The tracker is the Jira project **IDC Redentor** (key `ICR`) on `divinelab.atlassian.net` — a
company-managed software project, accessed via the Atlassian MCP (`mcp__atlassian-divinelab__*`). The project
key, cloudId, and the status/transition names come from `.claude/config.json` → `tracker` — never inline literal
ids. The MCP namespace and cloudId are **per-site** (shared with the other Divine Lab projects) — never renamed
per project.

### Issue keys (`ICR-N`)

`ICR-N` is the **native Jira issue key** — `N` is the issue number, not a Trello idShort (the `IDCR` alias also
resolves). There is no scan-to-resolve step: fetch the issue directly via `getJiraIssue(cloudId, "ICR-N")` and
use the `ICR-N` key for every read, write, and transition. Branches, commits, and PR titles use the same
`ICR-N` string.

### Workflow statuses

```
Backlog → To Do → In Progress → In Review → In Testing → Done
 (PM)     (PM)     (#1 work)    (#2 work)   (#3 merge)   (HUMAN, after prod deploy)
```

Transition issues by **status name** (`config.tracker.transitionResolution: "by-name"`, from
`config.tracker.workflow`), resolved at runtime via `getTransitionsForJiraIssue` matching `transition.to.name` —
never hardcode numeric transition ids. The status name is the contract; if a transition isn't offered at
runtime (the status is missing from the project's workflow, or was renamed), surface the drift rather than
inventing an id.

| Status      | Set by                                                            |       Automated?       |
| ----------- | ----------------------------------------------------------------- | :--------------------: |
| Backlog     | PM / human (backlog grooming)                                     |           no           |
| To Do       | PM / human (ready to pick up)                                     |           no           |
| In Progress | `/divinelab:work` step 3 (after the worktree exists)              |          yes           |
| In Review   | `/divinelab:work` step 14 via pr-author (at PR-ready)             |          yes           |
| In Testing  | `/divinelab:merge` (after a verified squash-merge)                |          yes           |
| **Done**    | **HUMAN ONLY** — after the human's manual prod deploy from Vercel | **never by any agent** |

There are exactly **three** automated transitions across the harness (`config.tracker.automatedTransitions`):

1. **To Do → In Progress** — owned by `/divinelab:work` (step 3, right after the worktree exists).
2. **In Progress → In Review** — owned by `/divinelab:work` via `divinelab:pr-author` (step 14, at PR-ready, paired with the
   PR-link comment).
3. **In Review → In Testing** — owned by **`/divinelab:merge`**, **only after a verified squash-merge**.

`/divinelab:work` owns exactly the first two and **never** performs transition #3 itself — even the in-session "merge"
hand-off (see below) delegates transition #3 to `/divinelab:merge`. **No agent or command ever moves an issue to Done.**
`config.tracker.forbiddenTransitions` blocks `→ done`. Done means: the human deployed to production from
Vercel and then transitioned the issue to Done themselves. Nothing infers "staging passed ⇒ safe for Done."

### Issue type → commit type

The Jira **issue type** drives the commit-type hint: **Bug → `fix`**, **Story → `feat`**, **Task → `chore`**,
with an optional label override for `perf`/`refactor` (`config.tracker.issueTypeToCommitType`). "Needs
refinement" is tracked via a **`needs-refinement` Jira label** (`config.tracker.needsRefinementLabel`), not a
checklist — a To Do issue **without** the `needs-refinement` label is the `/divinelab:work`-ready signal.
`/divinelab:work` reads this at its entry gate (step 1.5).

## `/divinelab:work` end-to-end

`/divinelab:work ICR-N` is the orchestrator playbook. The main thread follows it step by step; subagents are spawned
only at the marked points; the human gates (★) stay in the main conversation. The shape:

1. **Resolve the issue** by key `ICR-N` (`getJiraIssue`); pin its status, labels, QA depth. Infer the **commit
   type** (from the issue type) and the **QA TYPE** (`ui` | `api` | `chore`, independent of depth — reconciled against the real
   `git diff` at the QA step).
2. **Entry gate — needs-refinement ★ (step 1.5).** Runs after the issue is resolved and **before any side
   effect** (no worktree, no transition). It reads the issue's labels; if the **`needs-refinement`** label is
   present, it **STOPS** and offers a carrail: **(a) refine now** (dispatch `divinelab:product-manager` in
   `refine` mode, then re-read the labels) or **(b) pick another ticket** (abort cleanly — no worktree,
   no transition, no state file). An issue that fails this gate is never transitioned To Do → In Progress.
3. **Worktree + branch (mandatory).** Create an isolated worktree under `<main-root>/.claude/worktrees/ICR-N`
   off `origin/main`, branch `<type>/ICR-N-<slug>`. Then **To Do → In Progress** (automated transition #1).
4. **Explore (divinelab:explorer).** Returns relevant files / patterns / risks + **`needsDesignGate`** (boolean) and
   **`Suggested QA depth`**. `/divinelab:work` parses both literally; on absence/ambiguity it **fail-safe defaults
   `needsDesignGate = true`** (never auto-skip the design gate on ambiguity).
5. **Conditional design gate ★ (brainstorm + spec).** Sections 6 + 7 run **only when
   `needsDesignGate === true`** — a sensitive area touched, QA depth above `light`, or a data-model / API /
   CSP / i18n / email change. Then the human reviews the spec (`★ HUMAN GATE ★`). When `needsDesignGate ===
false` (a trivial copy/refactor), **both are skipped** and `/divinelab:work` auto-pilots straight to the
   implementation plan built from the issue + explorer summary. **The six sensitive areas always gate.**
6. **Implement ↔ verify loop.** The implementer executes each plan checkpoint TDD-first and commits; the
   verifier runs the gate stack per depth. A **3-attempt cap** (with prior-error diff) guards the loop; on
   cap it triggers the Failure handler.
7. **Contentful model-change gate ★ (project gate).** After the plan is written, if it changes the Contentful
   **content model** (a content-type/field create/update/delete, or an entry remap — not just a read fragment
   in `lib/contentful/*`), `/divinelab:work` **STOPS** and confirms **which lane** before implementing (see
   "Contentful model-change workflow" below). The `implementer` then writes to the chosen **work env** only,
   never the `master` alias/production; cutover is deferred to the human. Pure read-side / code-only changes
   skip this gate.
8. **Open a draft PR early (divinelab:pr-author).** `git push -u`, `gh pr create --draft` with a conventional title,
   fills the template, posts the PR-link Jira comment. **Issue stays In Progress.** Every later checkpoint
   commits-and-pushes to this open PR so cloud review agents can review iteratively.
9. **Always-on pre-merge QA on the PREVIEW (step 13).** **Unconditional for every testable ticket** — no
   `light = skip`. Type-aware: `ui` → browser walk + screenshots; `api` → API/request-level checks;
   `chore` → vitest/local only. The **tester (`divinelab:qa-runner`) → `divinelab:acceptance-judge` (verdict)** split applies;
   the loop's pass/fail decision keys off the **judge's** verdict. Evidence is **dual-posted to BOTH the PR
   and the Jira issue** (screenshots attach to the Jira issue; the PR carries the written report + per-AC verdict
   table + a link to the Jira issue). A 3-attempt QA cap mirrors the verify loop; it auto-remediates but
   **never auto-merges**.
10. **Docs evaluation (step 13.5)** then **mark ready (step 14, divinelab:pr-author).** `gh pr ready`, a final Jira
    comment, and **In Progress → In Review** (automated transition #2). This is `/divinelab:work`'s last automated transition.
11. **Detached post-PR review + CI loop (step 14.5).** See the next section.
12. **In-session merge hand-off (step 14.6).** After the loop reaches its CLEAN/CAP exit and the human has
    reviewed, the human may say **"merge"** in the same conversation; only then does `/divinelab:work` route the live
    session into the **`/divinelab:merge ICR-N`** logic (it does **not** reimplement merge). Merge is never autonomous.
13. **Triage stray observations (step 15)** and **lessons (step 16)**, then stop. `/divinelab:work` deletes its state
    file on success. **It never merges and never moves an issue to Done.**

`/divinelab:work` persists progress to a state file (`tasks/specs/ICR-N-<slug>.state.json`) so an aborted run (Ctrl-C,
sleep, network drop) can resume — including resuming mid-loop without double-replying to a thread.

### The detached post-PR review + CI loop (step 14.5)

After the PR is ready and the issue is In Review, `/divinelab:work` enters a **detached, dynamic-paced loop** driven by
`config.reviewLoop`. It watches the PR's **code-review comment threads** (including the **Codex review bot**,
which posts a few minutes after PR-ready) **and CI checks**, auto-remediates, and notifies the user when the
PR is ready for their eyes. **The loop NEVER merges and NEVER transitions an issue** — it only fixes, replies, and
notifies.

- **Driver: `ScheduleWakeup`** (the orchestrator-level driver; dynamic-paced, stateful, worktree-bound). The
  first wakeup fires ~`firstCheckSeconds` (240s) after PR-ready to catch the Codex review + the first CI
  signal; idle re-checks use `pollSeconds` (270s, inside the prompt-cache window); after the loop pushes a
  fix it waits `afterPushSeconds` (420s) for the fresh CI run.
- **Graceful one-shot fallback (required).** If `config.reviewLoop` is absent **or** `ScheduleWakeup` is
  unavailable at runtime, `/divinelab:work` **skips the detached loop**, does a **single one-shot** check (pull review
  threads + CI once), fires **one** notification telling the user to watch the PR manually, and falls through
  to triage. The rest of `/divinelab:work` must not break when the loop can't run — it is purely additive.
- **Each tick:** kill-switch check first (`maxIterations` 8 / `totalTimeoutSeconds` 40m), then pull review
  threads + CI + the latest QA verdict. **Actionable threads** = unresolved, not our own replies, and not
  already in `addressedThreadIds`.
  - **FIX branch** (actionable threads and/or red CI): dispatch the `divinelab:implementer` with `prReviewThreads` +
    `replyPerThread: true`; it invokes `superpowers:receiving-code-review`, fixes on-branch, pushes, and
    replies **once per thread**. The orchestrator persists every addressed `threadId` **immediately** on
    return (`idempotency: "reply-marker"`) so a crash-then-resume never double-replies, then schedules the
    next wakeup at the after-push pace.
  - **READINESS** (no actionable threads, CI not red): `clean` = `qaPass ∧ ciGreen ∧ commentsAddressed`. If
    clean → **CLEAN exit**: fire a `PushNotification` ("ready for your review") and continue to triage. If
    not clean only because CI is still pending → schedule an idle wakeup. On `maxIterations` /
    `totalTimeoutSeconds` → **CAP exit**: notify "needs your eyes" with the reason and stop scheduling.

## `/divinelab:merge ICR-N` (user-triggered)

`/divinelab:merge` is the **only** owner of the squash-merge and of the `In Review → In Testing` transition. It runs
**only when a human explicitly asks** (`config.merge.requireUserTrigger`; `config.qa.autoMerge.enabled`
stays `false`). It is invoked standalone or via the `/divinelab:work` step-14.6 hand-off.

1. **Pre-flight + guards.** Pin `config.merge` and `config.qa.env.staging` by name. The issue **must** be
   in **In Review**; resolve the PR by `ICR-N`. Refuse if the PR is a draft.
2. **CI gate (refuse on red).** With `config.merge.requireCiGreen`, anything not `SUCCESS`/`NEUTRAL`/`SKIPPED`
   — including still-`PENDING`/`IN_PROGRESS` — is **not green**. On not-green: **REFUSE**, leave the issue In
   Review, do not merge or clean up. (Re-read PR state right before merging — a `/divinelab:work` loop tick may have
   pushed after the human said "merge"; the CI gate + not-draft guard catch an in-flight fix.)
3. **Squash-merge ONLY.** `gh pr merge <n> --squash --delete-branch` (never `--merge`/`--rebase`). Verify the
   PR is MERGED afterward; on merge failure, stop and leave the issue In Review.
4. **Clean up worktree + local branch.** `--delete-branch` removed the remote branch; this step removes the
   local worktree + branch, anchored to `MAIN_REPO_ROOT`. If `/divinelab:merge` is running **inside** the target
   worktree, it leaves it first via `ExitWorktree(action: "remove")` so the shell is never stranded.
   "Already gone" is tolerated non-fatally.
5. **Transition In Review → In Testing (automated transition #3)** — only after the verified squash-merge. **Never Done.**
6. **Post-merge staging QA.** Validate the staging URL against `config.qa.env.staging` (host must match
   `^staging\.idcredentor\.org$`, prod hosts hard-denied; **skip** the must-be-a-Vercel-preview check —
   staging is not a **per-PR** preview deployment, so it has no `*.vercel.app` host to match. Note this
   is a statement about the QA _host_ gate only: staging **is** a Vercel branch deployment and so is
   built with `VERCEL_ENV=preview`, which is exactly what makes it draft-serving and Contentful-framable
   — see `contentful-data-layer.md` § Live Preview). Then **tester (`divinelab:qa-acceptance`) → `divinelab:acceptance-judge`** → post the result to
   the Jira issue (`postedBy: "/divinelab:merge"`, `envName: "staging"`). A `no-POST` happy-path AC the tester correctly
   skipped is **BLOCKED/deferred**, not FAIL.
7. **Stop.** Report the merge + cleanup + the staging verdict, and remind the user that **Done is human-only**
   — deploy prod from Vercel, then transition In Testing → Done. `/divinelab:merge` **never** moves an issue to Done.

## QA loop (Phase 1: report-only)

`/divinelab:qa`, `/divinelab:work`'s step 13, and `/divinelab:merge`'s post-merge QA are all driven by `config.qa`. The important
guardrails:

- **Env-by-name targets (`config.qa.env.<name>`).** `/divinelab:qa`'s **default target is `staging`**
  (`staging.idcredentor.org`); pass **`--preview`** to re-target the PR's Vercel preview. `/divinelab:work`'s pre-merge
  QA always targets **`preview`**; `/divinelab:merge`'s post-merge QA always targets **`staging`**. Every consumer
  selects its allowlist / db-allow / live-integration policy **off the env block by name** — never hardcoding
  preview literals.
- **Production is hard-denied in EVERY env.** Both the `idcredentor` custom domains **and** the production
  `*.vercel.app` aliases (`idc-redentor-website.vercel.app`, `idc-redentor-web.vercel.app`) are rejected for
  both `preview` and `staging` (`env.productionHostDeny`). The preview env additionally runs a
  must-be-a-Vercel-preview check (`requirePreviewEnvironment: true`); **staging skips that check**
  (`requirePreviewEnvironment: false` — it has its own allowlist) but **keeps the prod hard-deny**.
- **tester → acceptance-judge split everywhere.** Every QA path runs a fresh tester (`divinelab:qa-runner` or
  `divinelab:qa-acceptance`) for evidence, then a fresh `divinelab:acceptance-judge` for the authoritative verdict; results post
  via `post-jira-result.mjs` (the divinelab plugin bin, on PATH). The script uploads each screenshot as a Jira
  **attachment** and posts a comment whose ADF body references it as a `media` node (the Atlassian MCP can't
  attach files itself). `meta.envName` is **required** and drives the `Staging:` / `Preview:` label;
  `meta.postedBy` is the provenance footer (`/divinelab:qa` | `/divinelab:work` | `/divinelab:merge`). Jira creds come from
  `qa-env.json` (gitignored); on absent creds the script exits 3 and the orchestrator falls back to
  `mcp__atlassian-divinelab__addCommentToJiraIssue`.
- **Staging is `no-POST`** (`config.qa.env.staging.liveIntegrationPolicy`): no live happy-path POST to
  `/api/subscribe` or `/api/contact` — SendGrid/Resend are presumed LIVE on staging unless sandbox
  creds exist, so forms are tested only up to the network boundary; full end-to-end form POST is **DEFERRED**.
- **Mongo** is gated to a **test-DB-name allowlist**. Preview: `^website-(test|qa|e2e)$`. Staging:
  `^website-(test|qa|e2e|staging)$` — it **includes** the real `website-staging` DB (created + wired in
  Vercel), so reads/writes against `website-staging` are allowed. The production `website` DB is **excluded
  in both envs** — never read or written. Phase 1 keeps no Mongo writes during pre-merge QA.
- **Modes** are `report | seed | fix | auto`, but **only `report` is enabled in Phase 1.** The others are
  recognized and gated.
- **Auto-merge is disabled** (`config.qa.autoMerge.enabled` stays `false`, a kill switch). Even when
  `fix`/`auto` land later, nothing merges autonomously — the human triggers `/divinelab:merge`, which performs the
  squash. Sensitive paths (`apps/web/src/service/**`, `apps/web/src/templates/**`, `apps/web/src/app/api/**`,
  `apps/web/src/proxy.ts`, `apps/web/src/i18n/**`, `apps/web/lib/contentful/fetch.ts`, `apps/web/config/**`,
  `apps/web/next.config.*`, `package.json`, `.env*`, `.github/**`) raise the bar further.
- **QA depth** (`light`/`standard`/`heavy`, default `standard`) is the **effort dial within a type**, resolved
  from a `qa-<depth>` Jira label or a `QA: <depth>` description token. **There is no `light = skip` tier** —
  every testable ticket runs its TYPE's baseline.

## Contentful model-change workflow (two lanes)

When an issue changes the Contentful **content model** — a new/changed/deleted content type or field, or an
entry remap (**not** just a new read fragment in `lib/contentful/*`) — the harness routes it through one of
two lanes, wired in `.claude/config.json` → `contentful` and documented in full in
[`contentful-environments.md`](./contentful-environments.md). (Plain **content** edits — new posts, text
fixes, a sermon — happen live in production and need none of this.)

- **`master` is an alias → production**; the app reads the alias and production config never changes. Agents
  make model + entry changes in a **work env** via the Contentful MCP + committed `scripts/contentful/`
  migrations — **never** against the alias.
- **Default lane — permanent `staging`:** one stable work env (granted on the Delivery + Preview API keys
  **once**); at cutover a human applies the tested migration to production (Contentful **Merge** and/or the
  scripts). Rollback = reverse migration. Use for everyday model changes.
- **Heavy lane — versioned env + alias re-point:** for a big **breaking** change (type deletions, field
  renames, merges), clone prod into `master-<major>.<minor>.<patch>` (semver by change class: major =
  breaking, minor = additive, patch = fix) and a human **re-points the `master` alias** at cutover — atomic,
  with instant flip-back rollback. The single free-tier work-env slot is shared, so only one lane runs at a
  time. (Epic ICR-76 uses this lane → `master-1.0.0`.)
- **`/divinelab:work` Contentful gate (step 7 / former step 8.2):** if the plan touches the model, `/divinelab:work` stops, asks
  **which lane**, requires the spec's "Data Model Changes" section to carry the cutover plan, and defers the
  cutover to the human. The `divinelab:implementer` operates the MCP against the chosen **work env**, never the alias.
- **The cutover is HUMAN-ONLY** — agents never apply to production or re-point the `master` alias (like
  merge/Done).

## Commands map (what the agents actually run)

From `config.commands` — the canonical invocations, accounting for ICR's actual scripts:

| Logical   | Actual                                                |
| --------- | ----------------------------------------------------- |
| typecheck | `pnpm type-check` _(hyphen — not `typecheck`)_        |
| lint      | `pnpm lint` (`eslint .`)                              |
| test      | `pnpm test` (`vitest run`, single pass — never watch) |
| build     | `pnpm build`                                          |
| dev       | `pnpm dev`                                            |
| e2e       | `pnpm e2e` (`playwright test`; no specs in Phase 1)   |

If a script is absent at runtime, the verifier/qa-runner **reports it** rather than inventing one.

## Worktrees

`/divinelab:work` creates an isolated git worktree per ticket under `.claude/worktrees/<ICR-N>`, based on `origin/main`
(`config.worktree`). This keeps the user's working copy and other parallel jobs untouched. `/divinelab:merge` removes
the worktree + local branch after a verified squash-merge (leaving the worktree first via `ExitWorktree` if it
is running inside it). The divinelab plugin's `session-namer` hook (SessionStart + UserPromptSubmit) reads the
worktree dir (or branch) to title the session `ICR-N-<slug>` — deterministic and idempotent, so **don't run
`/rename`**; a manual rename is respected. See [`contributing.md`](./contributing.md) for the full
branch/worktree flow.

## Scratchpads & specs

- `tasks/todo.md`, `tasks/lessons.md` — working scratchpads (gitignored).
- `tasks/specs/` — implementation specs + plans + per-run `.state.json` files for non-trivial tickets (read
  the spec before implementing).
- `docs/product/` — the church product brain the `divinelab:product-manager` loads every run.

## graphify (codebase knowledge graph)

The repo is indexed into a knowledge graph at `graphify-out/graph.json` (gitignored, per-machine).
Querying it answers "how does X work / what calls Y / trace Z" from a pre-built index — far cheaper
than scanning the tree. It's an **accelerator, not a dependency**: every consumer falls back to
Grep/Read on an empty/stale/absent graph and notes it. Full guide: [`graphify.md`](./graphify.md).

- **Who queries** (`config.graphify.policy.whoQueries`): `divinelab:explorer` always (query/explain/path);
  `divinelab:implementer` for caller/dep + `explain` impact lookups before edits/deletes; `divinelab:security-reviewer` for
  `explain` blast-radius on changed shared symbols; `divinelab:product-manager` for reuse lookups. `divinelab:verifier`/
  `divinelab:qa-runner`/`divinelab:pr-author` never. Ad-hoc sessions follow the same rule via the `## graphify` section in `CLAUDE.md`.
- **Who refreshes** (two layers): the **git post-commit hook** (`.husky/post-commit`) keeps the
  shared graph in sync with `main` on every commit (AST, no LLM, free; resolves the main repo root via
  the common git dir so it works from worktrees, lock-guarded); `/divinelab:work` additionally runs
  `graphify update` once per session (lock-guarded) to catch _doc/content_ (semantic) drift.
  `enabled: "auto"` detects the graph at runtime. A worktree's feature code enters the graph on merge.
  (The divinelab plugin also ships a `graphify-hint` hook that nudges agents toward the graph.)
- **Verbs** (`config.graphify.verbs`): `query` (BFS context), `explain` (one-node onboarding + direction —
  the reliable impact lookup on this undirected graph), `path` (shortest dependency path), `affected`
  (reverse/blast-radius — needs a directed graph; prefer `explain` until rebuilt with `--directed`),
  `save-result` (memory loop).
- **Command form**: the CLI uses a **subcommand** — `graphify update <root>`, never `graphify --update`
  (that flag form is the `/graphify` skill interface and silently errors on the raw CLI).

## Golden rules

1. **Never move an issue to Done** — that's the human gate, after their manual prod deploy.
2. **No autonomous merge** — `autoMerge` stays `false`. Agents never merge on their own; the human triggers
   `/divinelab:merge`, which executes the squash-merge.
3. **Never run QA against production — in any env** — prod custom domains AND prod `*.vercel.app` aliases are
   hard-denied for both `preview` and `staging`.
4. **Never invent a script or a Jira transition** — report drift instead; transition issues by status name.
5. **Tester proves, judge decides** — never fuse the QA tester and the `divinelab:acceptance-judge`; the judge's
   verdict is authoritative.
6. **Respect the product scope** (`docs/product/scope-and-boundaries.md`) — the PM rejects/reframes
   out-of-scope ideas.
7. **Treat the sensitive paths as sensitive** — email, PII, API routes, CSP, env, middleware, the Contentful
   transport; they always gate the design discussion and raise the QA bar. **Staging is `no-POST`.**
8. **Never apply Contentful model changes to production or re-point the `master` alias** — that's a human
   promotion, like merge/Done. Agents make changes in a **work env** (the permanent `staging`, or a versioned
   env for big breaking changes) via the MCP + `scripts/contentful/` and propose; the human cuts over. See
   `docs/architecture/contentful-environments.md` (the `/divinelab:work` Contentful gate enforces this).
