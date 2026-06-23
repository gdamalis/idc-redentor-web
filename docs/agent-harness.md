# Agent Harness

> **Purpose:** How to use the Claude Code agent harness on this repo — the agents and slash commands, the human-gated Trello automation (To Do → In Progress → In Review, **never** Done), the branch/PR conventions, and the Phase-1 report-only QA loop on Vercel previews.
> **Last reviewed:** 2026-06-21

## What it is

A set of focused subagents plus four orchestrating slash commands that take a church-team idea from a Trello card to a reviewed pull request. The harness is **human-gated**: agents do the mechanical work (research, implement, verify, QA, open PRs, move cards forward) but a **human always merges the PR and closes the card**. Configuration lives in `.claude/config.json`; agent definitions in `.claude/agents/`; commands in `.claude/commands/`.

## Commands

| Command | Backed by | Does | Card moves |
|---------|-----------|------|------------|
| **`/pm`** | `product-manager` | Intake a raw idea → To Do card; refine a thin card to ready; groom the Dsicovery + To Do backlog. Enforces `docs/product/scope-and-boundaries.md`. **Never implements.** | Creates/updates cards up to **To Do**; never past it |
| **`/work [ICR-N]`** | explorer → implementer → verifier (+ pr-author) | Pick up a ready card, create a worktree, branch, implement against the spec, verify, open a PR, comment the PR link. | **To Do → In Progress** (at worktree creation), **In Progress → In Review** (at PR-ready) |
| **`/qa [ICR-N]`** | `qa-runner` + `qa-acceptance` | Depth-aware QA against the PR's **Vercel preview URL**; posts a structured result comment. **Phase 1: report-only.** | May move To Do/In Progress → In Review; **never Done** |
| **`/verify`** | verifier (+ security-reviewer) | Run `pnpm type-check && pnpm lint && pnpm test && pnpm build` and security checks. | none |

> The design references an 8-agent roster (product-manager, explorer, implementer, verifier, pr-author, qa-runner, qa-acceptance, security-reviewer). Some are present in `.claude/agents/` today (`product-manager`, `explorer`, `qa-runner`, `qa-acceptance`); the rest are orchestrated by the commands as the harness is filled in. Always check `.claude/agents/` for the current roster rather than assuming.

## The agents

- **`product-manager`** (`/pm`) — turns ideas into well-formed Trello cards and grooms the backlog, grounded in `docs/product/`. Three modes: **intake** (raw idea → To Do card), **refine** (thin card → ready), **groom** (read-only audit). Never writes code, never branches/PRs, never moves a card past To Do. Flags sensitive areas (email, contact/subscribe PII, likes Mongo writes, env/secrets, CSP).
- **`explorer`** — read-only codebase research for `/work`: traces the relevant files/patterns so the implementer doesn't start cold. Uses the graphify graph when present (see below).
- **`implementer`** — writes the change inside the feature-branch worktree, following the conventions in `CLAUDE.md` / `AGENTS.md`.
- **`verifier`** — runs the gate commands (`pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`) and reports failures rather than inventing missing scripts.
- **`pr-author`** — opens the PR with a conventional-commit title `<type>(ICR-N): description`, flips it to ready, posts the PR-link comment, and moves the card In Progress → In Review.
- **`qa-runner`** — depth-aware automated QA (light/standard/heavy). Maps changed paths to Playwright projects, runs against the local dev server or the PR's Vercel preview, and on heavy depth drives Chrome via the Playwright MCP and authors a new e2e spec. **Phase 1: no Mongo writes.**
- **`qa-acceptance`** — reads a card's acceptance criteria and validates the preview deployment against them, posting a structured result comment.
- **`security-reviewer`** — checks diffs against the sensitive paths (services, API routes, `proxy.ts`, `lib/contentful/fetch.ts`, `config/headers.js`, env files).

## Trello: keys, board, and the human gate

The tracker is the Trello board **"IDC Redentor website"** (`boardId` `67a7a743186065f07e87bbe9`, short link `sxuUAeck`), accessed via the Trello MCP (`mcp__trello__*`). All board/list/label ids come from `.claude/config.json` → `tracker` — never inline literal ids.

### Card keys (`ICR-N`)

`ICR-N` is a **derived display key**: `N` is the card's Trello `idShort`. There is no native `ICR-N` field. To act on `ICR-N`: `set_active_board(boardId)`, resolve the card whose `idShort === N`, then use the resolved card **id** for every write. Branches, commits, and PR titles use the `ICR-N` string.

### Workflow lists

```
Dsicovery → To Do → In Progress → In Review → Done
```

> **"Dsicovery" is misspelled on the real board.** That's intentional to preserve — do **not** "correct" it. Move cards by **listId** (from `config.tracker.lists`), not by name; if a listId 404s at runtime, re-fetch via `get_lists(boardId)`, match by name, and surface the drift rather than inventing an id.

| List | Set by | Automated? |
|------|--------|:---:|
| Dsicovery | PM / human (grooming) | no |
| To Do | PM / human (ready to pick up) | no |
| In Progress | `/work` (after worktree creation) | yes |
| In Review | `/work` via pr-author (at PR-ready) | yes |
| **Done** | **HUMAN ONLY** — on merge + card close | **never by any agent** |

`/work` owns exactly **two** automated moves (To Do → In Progress, In Progress → In Review) and posts the PR-link comment at PR-ready. **No agent or command ever moves a card to Done.** Done means merged-and-closed by a human.

### Labels → commit type

The board's four labels double as commit-type hints: **Feature → `feat`**, **Bug → `fix`**, **Integration → `feat`/`chore`**, **NFR → `chore`/`refactor`/`perf`**. Don't create new labels. "Needs refinement" is tracked structurally via a `Refinement → needs-refinement` checklist item, not a label — a To Do card with no open `needs-refinement` item is the `/work`-ready signal.

## QA loop (Phase 1: report-only)

`/qa` and `qa-acceptance` are driven by `config.qaLoop`. The important guardrails:

- **Modes** are `report | seed | fix | auto`, but **only `report` is enabled in Phase 1.** The others are recognized and gated.
- **Target is Vercel preview deployments**, discovered per-PR. There is **no separate staging environment.** The base-URL host must match `^[a-z0-9-]+\.vercel\.app$`; the production custom domain (`idcredentor.com` / `www.idcredentor.com` / `idcredentor.org`) is **denied**. QA refuses to run against production.
- **Auto-merge is disabled** (a kill switch). Even when `fix`/`auto` modes land later, `autoMerge.enabled` stays `false` until explicitly flipped — a human merges every PR. Sensitive paths (`src/service/**`, `src/templates/**`, `src/app/api/**`, `src/proxy.ts`, `src/i18n/**`, `lib/contentful/fetch.ts`, `config/**`, `next.config.*`, `package.json`, `.env*`, `.github/**`) raise the bar further.
- **QA depth** (`light`/`standard`/`heavy`, default `standard`) is resolved from a Trello custom field / label / description token, falling back to the default.
- **Mongo** access during QA is read-only and gated to a **test DB** (`^website-(test|qa|e2e)$`, excluding the production `website` db); **no writes in Phase 1.**

## Commands map (what the agents actually run)

From `config.commands` — these are the canonical invocations, accounting for ICR's actual scripts:

| Logical | Actual |
|---------|--------|
| typecheck | `pnpm type-check` *(hyphen — not `typecheck`)* |
| lint | `pnpm lint` (`eslint .`) |
| test | `pnpm test` (`vitest run`, single pass — never watch) |
| build | `pnpm build` |
| dev | `pnpm dev` |
| e2e | `pnpm e2e` (`playwright test`; no specs in Phase 1) |

If a script is absent at runtime, the verifier/qa-runner **reports it** rather than inventing one.

## Worktrees

`/work` creates an isolated git worktree per ticket under `.claude/worktrees/<ICR-N>`, based on `origin/main` (`config.worktree`). This keeps the user's working copy and other parallel jobs untouched. The session-namer hook reads the worktree dir (or branch) to title the session `ICR-N-<slug>`. See [`contributing.md`](./contributing.md) for the full branch/worktree flow.

## Scratchpads & specs

- `tasks/todo.md`, `tasks/lessons.md` — working scratchpads (gitignored).
- `tasks/specs/` — implementation specs for non-trivial tickets (read these before implementing).
- `docs/product/` — the church product brain the `product-manager` loads every run.

## graphify (codebase knowledge graph)

The repo is indexed into a knowledge graph at `graphify-out/graph.json` (gitignored, per-machine).
Querying it answers "how does X work / what calls Y / trace Z" from a pre-built index — far cheaper
than scanning the tree. It's an **accelerator, not a dependency**: every consumer falls back to
Grep/Read on an empty/stale/absent graph and notes it. Full guide: [`graphify.md`](./graphify.md).

- **Who queries** (`config.graphify.policy.whoQueries`): `explorer` always (query/explain/path);
  `implementer` for caller/dep + `explain` impact lookups before edits/deletes; `security-reviewer` for
  `explain` blast-radius on changed shared symbols; `product-manager` for reuse lookups. `verifier`/
  `qa-runner`/`pr-author` never. Ad-hoc sessions follow the same rule via the `## graphify` section in `CLAUDE.md`.
- **Who refreshes** (two layers): the **git post-commit hook** (`.husky/post-commit`) keeps the
  shared graph in sync with `main` on every commit (AST, no LLM, free; resolves the main repo root via
  the common git dir so it works from worktrees, lock-guarded); `/work` additionally runs
  `graphify update` once per session (lock-guarded) to catch *doc/content* (semantic) drift.
  `enabled: "auto"` detects the graph at runtime. A worktree's feature code enters the graph on merge.
- **Verbs** (`config.graphify.verbs`): `query` (BFS context), `affected` (reverse/blast-radius),
  `path` (shortest dependency path), `explain` (one-node onboarding), `save-result` (memory loop).
- **Command form**: the CLI uses a **subcommand** — `graphify update <root>`, never `graphify --update`
  (that flag form is the `/graphify` skill interface and silently errors on the raw CLI).

## Golden rules

1. **Never move a card to Done** — that's the human merge gate.
2. **Never run QA against production** — Vercel previews only, by allowlist.
3. **Never invent a script or a Trello id** — report drift instead.
4. **Respect the product scope** (`docs/product/scope-and-boundaries.md`) — the PM rejects/reframes out-of-scope ideas.
5. **Treat the sensitive paths as sensitive** — email, PII, API routes, CSP, env, middleware, the Contentful transport.
