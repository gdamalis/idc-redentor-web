# ICR-145 — `/predica` scripts: make `@playwright/test` resolvable from the repo root

**Type:** Bug (`fix`) · **QA depth:** standard · **QA type:** chore
**Jira:** https://divinelab.atlassian.net/browse/ICR-145
**Branch:** `fix/ICR-145-predica-playwright-resolution`

---

## Problem (verified, not assumed)

Three root-invoked harness scripts statically import Playwright:

| Script                                                  | Line |
| ------------------------------------------------------- | ---- |
| `.claude/scripts/predica/build-predica-pdf.mjs`         | 77   |
| `.claude/scripts/predica/build-predica-featured.mjs`    | 50   |
| `.claude/scripts/predica/build-predica-segment-pdf.mjs` | 28   |

```js
import { chromium } from "@playwright/test";
```

Since the pnpm + Turborepo migration, `@playwright/test` is installed **only** into
`apps/web/node_modules`. pnpm does not hoist it to the root. Node resolves a bare specifier by
walking `node_modules` upward from the **importing module's own directory** (cwd is irrelevant),
so the walk is:

```
.claude/scripts/predica/node_modules
.claude/scripts/node_modules
.claude/node_modules
<repoRoot>/node_modules        <-- stops here; apps/web/node_modules is never consulted
```

→ `ERR_MODULE_NOT_FOUND: Cannot find package '@playwright/test'`.

### Two corrections to the ticket as written

1. **Three scripts are affected, not two.** `build-predica-segment-pdf.mjs` (multi-preacher segment
   PDFs) has the identical import and was omitted from the ticket. The chosen fix repairs it for free.
2. **The committed fixture has _never_ been valid for the PDF script.** AC4 asks for a check that runs
   both scripts against `.claude/scripts/predica/__fixtures__/sample-sermon.json`, but that fixture has
   **no `content` field at all** — only the pre-block digest fields (`lead`, `thesis`, `mainPoints`,
   `keyQuotes`, …). `build-predica-pdf.mjs`'s validator rejects it:

   ```
   error: invalid sermon.json:
     - locales.es-AR.content: required non-empty array of blocks
     - locales.en-US.content: required non-empty array of blocks
   ```

   It was added by `828d3df feat(ICR-80)` — the same PR that introduced the block-based `content[]`
   contract — and was never updated to match. **Fixing the fixture is a prerequisite for AC4**, not an
   optional extra.

### The verification trap (important)

Every worktree lives at `<mainRepo>/.claude/worktrees/<KEY>`, i.e. **nested inside the main checkout**.
Node's upward walk therefore _escapes the worktree_ and reaches `<mainRepo>/node_modules`, which still
contains the hand-made workaround symlink:

```
node_modules/@playwright/test -> ../../apps/web/node_modules/@playwright/test
```

Proof (`createRequire` from a worktree script) resolves to
`<mainRepo>/node_modules/.pnpm/@playwright+test@1.61.0/node_modules/@playwright/test/index.js`.

**Consequence:** a local "clean checkout" test _silently passes even when the bug is unfixed_. Any
AC1/AC3 verification must either delete that symlink first or assert the resolved path lies inside the
expected `node_modules`. A fresh CI clone has no parent `node_modules` and is the only structurally
honest verifier — which is precisely why the CI smoke job (below) is the real regression net.

---

## Dependencies Check

- pnpm workspace with root `package.json` + `pnpm-workspace.yaml` + `turbo.json`. ✅ present
- `apps/web/package.json` declares `"@playwright/test": "^1.61.0"` (caret) and
  `"playwright-core": "1.61.0"` (exact). Installed version today: **1.61.0**. ✅
- Root `pnpm.overrides` block exists; it has **no** playwright entry. ✅
- CI: a single PR workflow `.github/workflows/pr.yml` with jobs `validate-pr-title` and `eslint-tsc`
  (checkout → pnpm → node 22.x → `pnpm install --frozen-lockfile` → lint → type-check → test).
  **No browser install exists anywhere in CI.** ✅
- Root `pnpm test` is a Turbo proxy (`turbo run test`) and `turbo.json` has **no root `test` target** —
  a root-level test would not run today. This is why the regression check is a CI step, not a unit test.
- `build-predica-featured.mjs` supports `--no-ai`, and falls back to a deterministic typographic card
  when `GEMINI_API_KEY` is unset (line ~530: `note: GEMINI_API_KEY not set — using the typographic
fallback card`). **The smoke check must pass `--no-ai`** so CI is hermetic (no network, no AI spend,
  deterministic output).
- `build-predica-pdf.mjs` reads the church logo from
  `apps/web/public/assets/img/redentor_logo.png` (relative to the script, cwd-independent). ✅ committed.

---

## Requirements

1. **R1 — Root dependency.** Add `"@playwright/test": "1.61.0"` (exact, no caret) to the **root**
   `package.json` `devDependencies`. Exact-pin so it matches `apps/web`'s installed 1.61.0 and pnpm
   reuses one store entry and one browser revision.
2. **R2 — No script changes.** The three scripts keep their plain
   `import { chromium } from "@playwright/test";`. Do **not** add `createRequire` boilerplate. R1 alone
   makes the resolution walk succeed.
3. **R3 — Valid fixture.** Add a `content` array to **both** locales of
   `.claude/scripts/predica/__fixtures__/sample-sermon.json`, so it satisfies
   `build-predica-pdf.mjs`'s validator. Content must be faithful to the fixture's existing prose
   (Ephesians 2 / "El amor que derriba muros") and must exercise **every block type the renderer
   actually handles**: `h2`, `h3`, `p`, `blockquote`, `ul`, `ol`. This makes the smoke check a renderer
   regression net too.
   - Do **NOT** use `embeddedAsset`: it is in `VALID_BLOCK_TYPES` but has **no `case` in the renderer's
     switch** (`build-predica-pdf.mjs:154-168`) — it would validate and render nothing. (Logged as a
     stray observation; out of scope here.)
   - The change is purely **additive** — `build-predica-featured.mjs`'s validator only reads
     `slug`/`sermonDate`/`preacher`/`locales["es-AR"].title`, so it is unaffected.
4. **R4 — Smoke runner.** New file `.claude/scripts/predica/__smoke__.mjs`. It must:
   - run `build-predica-pdf.mjs` against the fixture with `--out <tmpdir>`;
   - run `build-predica-featured.mjs` **with `--no-ai`** against the fixture with `--out <tmpdir>`;
   - **assert positively**: each child exits **0**, AND each expected output file exists, AND each is
     **non-empty** (> 1 KB, guarding against a zero-byte or truncated write);
   - write only into an OS temp dir (`mkdtemp`), never into the repo working tree, and clean up;
   - exit non-zero with a clear message on any failure.
   - Expected outputs: `predica.es-AR.pdf`, `predica.en-US.pdf` (pdf script) and `featured.png`
     (featured script).
     > **Why "assert positively":** per the ICR-144 lesson, a check that takes the pass branch when the
     > tool never ran is worse than no check. Prove the file was observed before asserting anything
     > about it.
5. **R5 — Root script.** Add `"predica:smoke": "node .claude/scripts/predica/__smoke__.mjs"` to root
   `package.json` `scripts`, so the check is runnable locally and CI merely calls it.
6. **R6 — CI job.** Add a **new job** `predica-scripts` to `.github/workflows/pr.yml` (a separate job,
   not extra steps on `eslint-tsc`, so the chromium download runs in parallel and a failure attributes
   cleanly): checkout → pnpm → node 22.x → `pnpm install --frozen-lockfile` → cache
   `~/.cache/ms-playwright` → `pnpm exec playwright install --with-deps chromium` → `pnpm predica:smoke`.
   - The browser cache key **must include the playwright version**, or a stale cache yields a browser
     revision that does not match the installed library.
   - `pnpm exec playwright install` is run **from the root** — valid only because R1 puts the
     `playwright` binary in the root `node_modules/.bin`. This is the AC's "confirm
     `pnpm exec playwright install chromium` still provisions the browser".
7. **R7 — Remove the workaround.** Delete the main checkout's hand-made
   `node_modules/@playwright` directory and re-run `pnpm install` so pnpm owns that path. This is a
   local/machine action (the path is gitignored), and is the AC3 verification.
8. **R8 — Docs.** Browser-provisioning guidance currently says
   `pnpm -C apps/web exec playwright install chromium` in `.claude/commands/predica.md` (×2),
   `docs/architecture/predica-featured-image.md`, and `.claude/config.json`. With R1 the root form
   `pnpm exec playwright install chromium` is correct and simpler. Update these to the root form.

---

## Data Model Changes

None. No database, no Contentful content model, no API. The only "schema" touched is the
**test fixture's** JSON shape, which must conform to the _existing_ (unchanged) block contract:

```ts
type Block =
  | { type: "h2" | "h3" | "p" | "blockquote"; text: string }
  | { type: "ul" | "ol"; items: string[] };

interface SermonLocale {
  title: string;
  content: Block[]; // <-- the field the fixture is missing
  // …existing digest fields (lead, thesis, mainPoints, keyQuotes, …) stay as-is
}
```

Validator (unchanged, `build-predica-pdf.mjs:492-494, 554-568`):

```js
const VALID_BLOCK_TYPES = new Set([
  "h2",
  "h3",
  "p",
  "blockquote",
  "ul",
  "ol",
  "embeddedAsset",
]);
const TEXT_BLOCK_TYPES = new Set(["h2", "h3", "p", "blockquote"]);
const LIST_BLOCK_TYPES = new Set(["ul", "ol"]);
```

## API Changes

None. No routes, no Zod schemas, no request/response contracts.

---

## New / Modified Files

### New

| File                                    | Purpose                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `.claude/scripts/predica/__smoke__.mjs` | Regression runner (R4): invokes both scripts against the fixture into a temp dir and asserts exit 0 + non-empty outputs. |

### Modified

| File                                                      | Change                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `package.json` (root)                                     | + devDep `"@playwright/test": "1.61.0"`; + script `"predica:smoke"`.       |
| `pnpm-lock.yaml`                                          | Regenerated by `pnpm install`.                                             |
| `.claude/scripts/predica/__fixtures__/sample-sermon.json` | + `content[]` on `locales["es-AR"]` and `locales["en-US"]` (additive).     |
| `.github/workflows/pr.yml`                                | + job `predica-scripts` (chromium install + cache + `pnpm predica:smoke`). |
| `.claude/commands/predica.md`                             | Browser-provisioning command → root form (2 occurrences).                  |
| `docs/architecture/predica-featured-image.md`             | Same.                                                                      |
| `.claude/config.json`                                     | Same (the documented provisioning command string).                         |

**Explicitly NOT modified:** the three `build-predica-*.mjs` scripts. Their imports are already correct;
the bug was purely a dependency-placement problem.

---

## Component Hierarchy

Not a UI change. The resolution graph, before → after:

```
BEFORE                                   AFTER
.claude/scripts/predica/*.mjs            .claude/scripts/predica/*.mjs
  import "@playwright/test"                import "@playwright/test"
        │                                        │
        ▼ (walk up)                              ▼ (walk up)
  <root>/node_modules  ── ✗ absent         <root>/node_modules/@playwright/test ── ✓
        │                                     (real, pnpm-managed, from root devDep)
        ▼
  ERR_MODULE_NOT_FOUND
```

---

## Edge Cases

1. **Nested-worktree contamination.** Node escapes the worktree into `<mainRepo>/node_modules`. A local
   AC1/AC3 test is meaningless until the main checkout's workaround symlink is deleted (R7). _Expected
   behavior:_ after R7 + `pnpm install`, `createRequire(<script>).resolve("@playwright/test")` must
   resolve **inside a pnpm-managed `node_modules`**, not through a hand-made symlink; and CI (fresh
   clone, no parent `node_modules`) must pass.
2. **pnpm install colliding with the hand-made symlink.** `node_modules/@playwright/` currently contains
   a manually created symlink. Adding the dep could conflict. _Expected:_ `rm -rf node_modules/@playwright`
   **before** `pnpm install`; afterwards pnpm owns the path.
3. **Version drift (accepted risk).** Root pins `1.61.0` exact; `apps/web` uses `^1.61.0`. A future
   `apps/web` bump could land two playwright versions → two browser revisions downloaded. _Expected:_
   not a defect today; recorded in Open Questions. (The `pnpm.overrides` guard was considered and
   deliberately declined.)
4. **Stale browser cache in CI.** _Expected:_ cache key includes the playwright version; a version bump
   invalidates the cache rather than pairing a new library with an old browser.
5. **`--with-deps` needs root privileges** to apt-install OS libs. _Expected:_ fine on
   `ubuntu-latest` (passwordless sudo). If it ever proves flaky, drop `--with-deps` — GitHub's ubuntu
   image already carries most chromium deps.
6. **Featured script hitting the network in CI.** _Expected:_ `--no-ai` short-circuits **before** the
   `GEMINI_API_KEY` lookup and any Gemini call (`if (!a["no-ai"]) { … }`), so the run is hermetic and
   deterministic even if a key were somehow present in the environment.
7. **Smoke run dirtying the working tree.** _Expected:_ outputs go to `mkdtemp()`; `git status` stays
   clean after `pnpm predica:smoke`. (A `--out` default of "same dir as the input JSON" would otherwise
   write PDFs into `__fixtures__/`.)
8. **The PDF logo is missing.** The script warns and falls back to text rather than failing. _Expected:_
   the smoke check still passes (it asserts a non-empty PDF, not a byte-exact one) — we are testing
   resolution + render, not pixel output.

---

## i18n

No UI strings; `public/locales/{es-AR,en-US}.json` untouched. The **fixture** is bilingual and both
locales get `content[]` (R3) — the PDF script validates _both_ `es-AR` and `en-US`, so a single-locale
fixture would still fail.

---

## Testing Strategy

**Automated (the AC4 net):** `pnpm predica:smoke`, wired into CI as job `predica-scripts`. It is a true
end-to-end invocation — it would have caught this exact regression (`ERR_MODULE_NOT_FOUND`), _and_ catches
a missing browser, a rotted fixture, and a broken renderer.

**Why not a unit test:** there is no root test runner (root `pnpm test` proxies to Turbo, which has no
root `test` target), and a resolution-only assertion would not prove the scripts actually render.

**Manual smoke (local, post-fix):**

1. `rm -rf node_modules/@playwright && pnpm install` in the **main checkout** (R7).
2. `node -e` / `createRequire` → assert `@playwright/test` resolves through a pnpm-managed path.
3. `pnpm predica:smoke` → exits 0; `git status` clean.
4. Confirm `pnpm exec playwright install chromium` (root form) provisions the browser.

**No Playwright e2e suites apply** (`config.playwrightProjectMap` maps app paths; this ticket touches
none). QA type is **chore**: local/CI checks only, no browser walk, no deployed target.

---

## Implementation Checkpoints

### Checkpoint 1 — Root dependency + remove the workaround

- **Files:** `package.json` (root), `pnpm-lock.yaml`
- **Do:** add `"@playwright/test": "1.61.0"` to root `devDependencies`; `rm -rf node_modules/@playwright`;
  `pnpm install`.
- **Verify:** in the **worktree**, `node -p 'require("node:module").createRequire("<abs path to build-predica-pdf.mjs>").resolve("@playwright/test")'`
  resolves to a path **inside the worktree's own `node_modules`** (not the parent checkout's). Then run
  `node .claude/scripts/predica/build-predica-pdf.mjs .claude/scripts/predica/__fixtures__/sample-sermon.json --out /tmp/x`
  and confirm it now fails **only** on fixture validation (proving the import resolved) — not on
  `ERR_MODULE_NOT_FOUND`.
- **Commit:** `fix(ICR-145): add @playwright/test to root devDependencies`

### Checkpoint 2 — Make the fixture valid for the PDF script

- **Files:** `.claude/scripts/predica/__fixtures__/sample-sermon.json`
- **Do:** add `content[]` to both locales per R3 (h2/h3/p/blockquote/ul/ol; no `embeddedAsset`).
- **Verify:** both scripts now run green against the fixture:
  `node …/build-predica-pdf.mjs <fixture> --out /tmp/x` → exit 0, two PDFs;
  `node …/build-predica-featured.mjs --no-ai <fixture> --out /tmp/x` → exit 0, `featured.png`.
- **Commit:** `test(ICR-145): add content blocks to the predica sample-sermon fixture`

### Checkpoint 3 — Smoke runner + root script

- **Files:** `.claude/scripts/predica/__smoke__.mjs` (new), `package.json` (root)
- **Do:** implement R4 + R5.
- **Verify:** `pnpm predica:smoke` exits 0 and prints what it asserted; `git status` is clean afterwards.
  Then prove it **fails correctly**: temporarily point it at a bogus fixture (or stub the import) and
  confirm a non-zero exit — a check that cannot fail is not a check.
- **Commit:** `test(ICR-145): add predica scripts smoke check`

### Checkpoint 4 — CI job

- **Files:** `.github/workflows/pr.yml`
- **Do:** implement R6.
- **Verify:** YAML parses; the job appears on the PR and goes green (this is the authoritative AC1/AC3
  proof — a fresh clone with no parent `node_modules`).
- **Commit:** `ci(ICR-145): run the predica scripts smoke check on PRs`

### Checkpoint 5 — Docs

- **Files:** `.claude/commands/predica.md`, `docs/architecture/predica-featured-image.md`,
  `.claude/config.json`
- **Do:** implement R8 (provisioning command → root form). Note in the predica docs that the scripts'
  playwright dep now lives at the root.
- **Verify:** `grep -rn "apps/web exec playwright"` returns nothing stale; `pnpm format:check` passes.
- **Commit:** `docs(ICR-145): point playwright browser provisioning at the repo root`

---

## Open Questions

1. **Version drift guard (deferred by choice).** Root `1.61.0` exact vs `apps/web` `^1.61.0`. If they
   ever diverge, two browser revisions get downloaded and `pnpm exec playwright install` at the root
   provisions the _root's_ revision, which may not be the one `apps/web` runs. A one-line
   `pnpm.overrides` entry would make this structurally impossible. Deliberately declined for this PR —
   worth a follow-up if playwright is bumped.
2. **Segment-PDF smoke coverage (follow-up ticket).** `build-predica-segment-pdf.mjs` is **fixed** by
   this PR but **not smoke-tested**, because it needs a `combined.parts.json` fixture that does not
   exist. Follow-up ticket to author that fixture and extend `__smoke__.mjs`.
3. **`embeddedAsset` is a dead block type** — accepted by `VALID_BLOCK_TYPES` but absent from the
   renderer's `switch`, so it validates and silently renders nothing. Logged as a stray observation;
   not fixed here.

---

## Sensitive Areas

Touches **root `package.json`** and **`.github/**`**, both listed in
`.claude/config.json → qa.autoMerge.sensitivePaths`. This is why the design gate was mandatory. None of
the six domain-sensitive areas (email-services, form-pii-spam, likes-mongo, env-secrets, csp-headers,
i18n-messages) are touched: no secrets are read or added, no CSP/header change, no i18n message change.
The new CI job requires **no secrets** — it is hermetic by construction (`--no-ai`).
