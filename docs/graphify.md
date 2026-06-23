# graphify — the codebase knowledge graph

`graphify` indexes this repo into a navigable knowledge graph at `graphify-out/graph.json`. Querying
it answers "how does X work / what depends on Y / trace Z" from a pre-built index instead of scanning
the tree with Read/Grep/Glob. On this repo the benchmark shows **~64× fewer tokens per query**
(~1,750 tokens/query vs ~112k to read the corpus naively).

It is an **accelerator, not a dependency**: every consumer falls back to Grep/Read when the graph is
absent, empty, or stale, and says so.

> Two namesakes, one tool. The `/graphify` _skill_ builds the graph (semantic extraction via
> subagents); the `graphify` _CLI_ (`uv tool install graphifyy`) queries and incrementally updates it.
> The harness wires the **CLI** via Bash.

## Where it lives

- `graphify-out/graph.json` — the graph (nodes + edges + communities). **Gitignored** (`.gitignore`),
  so it's per-machine, never committed.
- `graphify-out/GRAPH_REPORT.md`, `graph.html` — human-readable report + interactive view.
- `graphify-out/memory/` — saved Q&A from `graphify save-result` (folded back in on the next update).

Because it's gitignored, a **fresh clone has no graph**. Build it once:

```bash
/graphify            # in an AI assistant session — full build (AST + semantic)
# or, code-only (no LLM): graphify extract .
```

Until it exists, `config.graphify.enabled: "auto"` simply detects its absence and agents Grep/Read.

## Querying (the read path)

Run from the repo root (where `graphify-out/` lives). **Match code symbols by their node label,
which includes `()`** — `getPage()`, not `getPage`.

| Verb                          | Use                                                                                         | Reliable on this graph?                           |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `graphify query "<question>"` | BFS context for a conceptual question                                                       | ✅ for "how does X work"; weak for "what calls X" |
| `graphify explain "Sym()"`    | one symbol + neighbours **with direction** (`<-- caller [imports\|calls]` = its dependents) | ✅ — the reliable impact/caller lookup            |
| `graphify path "A()" "B()"`   | shortest dependency path between two nodes                                                  | ✅                                                |
| `graphify affected "Sym()"`   | reverse-traversal blast-radius                                                              | ⚠️ **needs a directed graph** (see below)         |
| `graphify save-result …`      | persist a useful Q&A to `graphify-out/memory/`                                              | ✅                                                |

Examples that work today:

```bash
graphify query "trace the /api/contact request flow"
graphify explain "getPage()"                       # shows `<-- page.tsx [imports]` etc.
graphify path "fetchGraphQL()" "ContactForm()"     # → fetchGraphQL → getTextBlockComponent → page.tsx → ContactForm
```

### Directed vs undirected

This repo's graph is currently **undirected** (`graph.json` `directed: false`). Reverse traversal has
no meaning there, so `graphify affected …` returns nothing useful — use `explain` (which shows edge
direction) for "what depends on this". To unlock `affected` and directional queries, rebuild **once**
as directed:

```bash
/graphify --directed     # one full rebuild; graphify update then preserves directedness
```

(Not done automatically — a directed rebuild re-runs semantic extraction.)

## Freshness — two layers

1. **Git post-commit hook** (`.husky/post-commit`, tracked) — keeps the **shared graph in sync with
   main** on every commit via AST. No LLM, no network, ~2s, detached so it never blocks/fails the
   commit. It resolves the **main repo root via the common git dir** (so it works from `/work`
   worktrees, where `--show-toplevel` would point at the worktree and skip the refresh) and refreshes
   the one shared graph there, lock-guarded against races and yielding to a `/work` update. No-ops when
   graphify isn't installed or no graph exists. Because `graphify update` extracts from and writes to
   the same root (no output redirect), a **worktree's feature code enters the graph when it merges to
   main** — which is also the tree `/work`'s agents query.
2. **`/work` per-session update** — the first `/work` that acquires the lock runs `graphify update`
   (lock-guarded) to also catch **doc/content** (semantic) drift the AST hook ignores, and to fold in
   `graphify-out/memory/` entries.

For uncommitted edits in an everyday session, refresh manually: `graphify update .` (also free/AST-only
for code).

> **Husky owns the hooks path.** `core.hooksPath = .husky/_`, so `.git/hooks/` is ignored by git —
> `graphify hook install` (which writes `.git/hooks/post-commit`) would be **dead** here. The tracked
> `.husky/post-commit` is the correct, shareable mechanism. It activates once merged to main (the
> husky `_/post-commit` wrapper already exists; no `pnpm prepare` needed).

## Command form (gotchas)

- **`graphify update <path>`** is a **subcommand + path**. `graphify --update` is the `/graphify`
  _skill_ interface and silently errors on the raw CLI (`config.graphify.updateCommand` encodes the
  correct form).
- **No `timeout` on stock macOS** — it ships as coreutils' `gtimeout`. The harness uses a portable
  shim (prefer `gtimeout`, then `timeout`, else run unwrapped); `graphify update` is fast enough that
  the missing cap is acceptable.

## Who uses it (`config.graphify.policy.whoQueries`)

- `explorer` — always, when available (query/explain/path).
- `implementer` — caller/dependency + `explain` impact lookups before edits/deletes (Grep-confirm negatives).
- `security-reviewer` — `explain` blast-radius on changed shared symbols (diff-anchored).
- `product-manager` — reuse lookups (read-only; never updates).
- Ad-hoc sessions — via the `## graphify` rule in `CLAUDE.md`.
- `verifier` / `qa-runner` / `pr-author` — never.

## Maintenance

- **Version sync**: if the CLI warns `skill is from X, package is Y`, run `graphify install` to update
  the installed skill.
- **Config**: all knobs live under `config.graphify` (paths, lock, timeouts, `verbs`, `policy`).
- **Sponsor**: https://github.com/sponsors/safishamsi
