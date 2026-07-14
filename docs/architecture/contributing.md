# Contributing

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** The day-to-day contributor flow — prerequisites, branch naming (`<type>/ICR-N-<slug>`), conventional commits, the PR-title rule and CI gates, semantic-release behavior, and the git-worktree workflow the agent harness uses.
> **Last reviewed:** 2026-06-21

## Prerequisites

- **Node 22.14.0** (`.nvmrc` — run `nvm use`).
- **pnpm** as the package manager. Do not use `npm` or `yarn`.
- A `.env` with the **required** variables — copy `apps/web/.env.example` to `apps/web/.env` and fill in the values, using `CLAUDE.md`'s env tables as the reference for what each var means. Ask @gdamalis for the Contentful / Mailchimp / Mongo / mail-provider credentials.

```bash
nvm use
pnpm install            # at the repo root — runs husky via the prepare script (whole workspace)
cp apps/web/.env.example apps/web/.env    # then fill in the required vars (see CLAUDE.md)
pnpm dev                # at the repo root (Turbo proxies) — or scope with: pnpm --filter @idcr/web dev
```

> ⚠️ **`.env.example` is current.** It carries every runtime variable (it was brought up to date in
> ICR-114) — copy it as-is and fill in the values. **Never commit real secret values.**

> ⚠️ **Env files live in `apps/web/`, not the repo root.** Next.js loads `.env*` from the **app**
> directory (`apps/web/`), which is also Vercel's Root Directory. A `.env.local` placed at the
> **repo root is silently ignored** — nothing reads it. The symptom is a local `pnpm build` failing
> with `TypeError: Invalid URL` (input `'undefined'`) from
> `new URL(process.env.NEXT_PUBLIC_BASE_URL!)` in `apps/web/src/app/[locale]/layout.tsx`. This has
> repeatedly been misdiagnosed as a "pre-existing local build limitation" — it is not; the env file
> is just in the wrong directory. Put it at `apps/web/.env.local` (or `apps/web/.env`) and the
> production build succeeds.

## Quality gates (run before pushing)

```bash
pnpm type-check    # tsc --noEmit   (hyphenated — not `typecheck`)
pnpm lint          # eslint .
pnpm test          # vitest run
pnpm build         # next build
pnpm format:check  # prettier --check .
```

`lint-staged` (via husky `pre-commit`) auto-fixes staged files (`eslint --fix` for code, `prettier --write` for json/md/css), and commitlint (`commit-msg`) enforces the commit format. CI re-runs these gates plus the PR-title check.

## Branching

- **Never commit to `main`.** Always work on a feature branch (or, with the harness, in a worktree).
- **Branch name:** `<type>/ICR-N-<slug>` — e.g. `feat/ICR-42-add-events-jsonld`, `fix/ICR-17-contact-email-escape`.
- **`<type>`** is one of `feat` · `fix` · `refactor` · `perf` · `chore` · `docs` · `test` · `ci` (see `config.branchPrefixByType`). It drives the branch prefix, the commit type, and the release impact.
- **`ICR-N`** is the Jira issue key (`N` = the issue number). Working without a ticket? Use a descriptive slug and open the issue afterward so the work is tracked.

## Commits

- **Conventional Commits**, header ≤ 100 chars, body lines ≤ 100 chars. Example: `feat(ICR-42): add Event JSON-LD to come-meet-us`.
- Commit `<type>` should match the branch/ticket type. The Jira **issue type** maps to it: Bug→`fix`, Story→`feat`, Task→`chore` (with an optional label override for `perf`/`refactor`).
- commitlint (`@commitlint/config-conventional`) rejects malformed messages at commit time.

## Pull requests

- **PR title MUST follow** `<type>(ICR-N): description` — e.g. `feat(ICR-42): add Event JSON-LD`. This is validated in CI by `amannn/action-semantic-pull-request`; a non-conforming title fails the check.
- Fill in the PR template; link the Jira issue.
- The harness `pr-author` opens the PR, flips it to ready, comments the PR link on the issue, and transitions the issue **In Progress → In Review**. If you're doing it by hand, do the same and transition the issue yourself.
- **A human reviews and merges.** No agent merges or transitions an issue to **Done** — Done means merged-and-closed by a person. See [`agent-harness.md`](./agent-harness.md).

## Releases (semantic-release)

`semantic-release` runs on **`main`** (`.releaserc.json`). On each push to main it analyzes the merged commits and cuts a version + changelog automatically. The release rules are **customized** — note the non-defaults:

| Commit type | Release                                                 |
| ----------- | ------------------------------------------------------- |
| `feat`      | **minor**                                               |
| `fix`       | **patch**                                               |
| `perf`      | **patch**                                               |
| `docs`      | **patch** ← non-standard: docs cut a patch release here |
| `chore`     | **none**                                                |

So a `docs:` or `perf:` commit on main **will** produce a release. Be deliberate with commit types. The release commit is `chore(release): <version> [skip ci]`; it updates `CHANGELOG.md` and `package.json`, tags the version, and creates a GitHub release. npm publishing is disabled (`npmPublish: false`). Types not listed (`refactor`, `test`, `ci`) don't trigger a release.

## The worktree workflow (harness default)

The agent harness isolates each ticket in a git worktree so parallel work and the user's checkout never collide:

```
.claude/worktrees/<ICR-N>      # one worktree per ticket, branched from origin/main
```

- `/divinelab:work` creates the worktree (`config.worktree`: parent `.claude/worktrees`, name = `<ticket-id>`, base `origin/main`), then transitions the issue To Do → In Progress.
- The divinelab plugin's session-namer hook reads the worktree dir (or the branch) and titles the session `ICR-N-<slug>`. The naming is automatic — **don't run `/rename`**; the hook handles it and a manual rename is respected if you do set one.
- When you're working by hand and want isolation, create a worktree the same way (`git worktree add .claude/worktrees/ICR-N -b <type>/ICR-N-<slug> origin/main`) or use your tooling's worktree helper. Worktrees are gitignored.
- Clean up the worktree after the PR is merged.

## Scratchpads

- `tasks/todo.md` / `tasks/lessons.md` — personal/working notes (gitignored). Capture lessons here after a correction.
- `tasks/specs/` — implementation specs for non-trivial work; read the relevant spec before coding.

## Conventions recap

Follow the conventions in `CLAUDE.md` / `AGENTS.md`: TypeScript strict, `interface` over `type`, const maps over enums, `satisfies`, `??` over `||`, RSC-first, always `await` runtime APIs, named exports, lowercase-dash dirs, Zod at boundaries, `cn()` for classes, every UI string in both `public/locales/*.json`. When in doubt, read the surrounding code and match it.
