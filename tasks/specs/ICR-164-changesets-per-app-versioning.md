# ICR-164 — Per-app independent versioning via Changesets

> **Jira:** [ICR-164](https://divinelab.atlassian.net/browse/ICR-164) · Task · Infra · Priority Medium
> **Commit type:** `chore` · **QA depth:** heavy · **QA type:** chore
> **Branch:** `chore/ICR-164-changesets-per-app-versioning`

Replace single-version `semantic-release` with **Changesets**, giving `@idcr/web` and `@idcr/admin`
independent version lines and per-package changelogs. Versioning here is **traceability, not deploy
control** — Vercel redeploys on git push and the release commit is `[skip ci]`, so a bump never
triggers a build. The only question is what the number communicates.

## Verification status of this design

Every load-bearing claim below was **verified empirically** against `@changesets/cli@2.31.1` in a
scratch workspace mirroring this repo's exact shape (root outside the workspace globs; all packages
`private: true`), not taken from memory or docs prose. Probe results are quoted inline.

## Dependencies Check

| Requirement                                          | State           | Evidence                                                                                                                                                           |
| ---------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo has ≥2 deployable apps                      | ✅ met          | `apps/web` (`@idcr/web` 1.27.0), `apps/admin` (`@idcr/admin` 0.0.0) both exist on `origin/main` @ 8377d89                                                          |
| ICR-124 (admin scaffold) merged                      | ✅ met          | squash-merged 2026-07-16; `apps/admin` present                                                                                                                     |
| `@changesets/cli` current version                    | ✅ 2.31.1       | `npm view @changesets/cli version`                                                                                                                                 |
| `@changesets/config` schema version                  | ✅ 3.1.4        | `npm view @changesets/config version`                                                                                                                              |
| `changesets/action`                                  | ⛔ **not used** | Direct-push flow is hand-rolled (Requirement 6); action is PR-flow only. Trap noted in Edge Case 1 for the record.                                                 |
| Nothing reads root `package.json` version at runtime | ✅ confirmed    | explorer grepped `apps/web/src`, `apps/admin/src`, `next.config.ts`, `instrumentation*`, `sentry*` for `require(...package.json`/`npm_package_version` — zero hits |
| Sentry release identity independent of version       | ✅ confirmed    | `withSentryConfig` passes no `release:` key → auto-detects git SHA                                                                                                 |
| No other workflow consumes semantic-release tags     | ✅ confirmed    | `contentful-drift.yml` + `predica-scripts` independent                                                                                                             |

## Requirements

1. **`.changeset/config.json`** exists at repo root with exactly:

   ```json
   {
     "$schema": "https://unpkg.com/@changesets/config@3.1.4/schema.json",
     "changelog": "@changesets/cli/changelog",
     "commit": false,
     "fixed": [],
     "linked": [],
     "access": "restricted",
     "baseBranch": "main",
     "updateInternalDependencies": "patch",
     "ignore": [],
     "privatePackages": { "version": true, "tag": true }
   }
   ```

2. **`ignore` is EMPTY — all workspace packages version. This overrides refinement decisions 2 AND 3.**
   - **Decision 2 (config/ui ignored) → overridden.** `@idcr/config` and `@idcr/ui` are **versioned**,
     not ignored. This is the changesets-idiomatic default for internal shared libraries and is
     **zero extra config** (empty `ignore` + the default `updateInternalDependencies: "patch"`). Each
     gets its own version line + `CHANGELOG.md`, and a change to a shared package **auto-cascades a
     patch to the apps that consume it** — the whole point of Changesets' dependency-aware bumping.
     Verified against the real graph (`@idcr/config ← @idcr/ui ← {web, admin}`): a single `@idcr/ui`
     patch changeset produced `@idcr/ui 0.0.0→0.0.1`, `@idcr/web 1.27.0→1.27.1`,
     `@idcr/admin 0.0.0→0.0.1` (both apps auto-bumped), `@idcr/config` unchanged, root unchanged, and
     `apps/web/CHANGELOG.md` recorded `Updated dependencies → @idcr/ui@0.0.1`. The `workspace:*` ranges
     were **not** rewritten (no lockfile churn). Accepted trade-off: a shared-package change patches
     **both** apps even if only one visibly uses it — correct under "did this app's inputs change."

   - **Decision 3 (root in `ignore`) → overridden.** The root package name **MUST NOT** appear in
     `ignore` — verified to hard-fail config validation:

     ```
     🦋  error ValidationError: Some errors occurred when validating the changesets config:
     🦋  error The package or glob expression "idc-redentor-platform" is specified in the `ignore`
          option but it is not found in the project.
     ```

     Root is **not a workspace member** (`pnpm-workspace.yaml` lists only `apps/*`, `packages/*`), so
     Changesets never sees it as a package — which is _also_ why it cannot be bumped. The
     changesets#1208/#1209 root-bump gotcha cited at refinement does not apply to this layout. Root is
     protected **structurally**; naming it breaks the config. Verified: `changeset version` left root
     at `1.27.0` while apps bumped.

3. **`privatePackages: { version: true, tag: true }`** is load-bearing, not decoration. The default is
   `{ version: true, tag: false }`. Every package here is `private: true`, so the default would
   **silently end the tag lineage** (52 `v1.x` tags exist today; `v1.27.0` was cut 2026-07-16).
   `version: true` is why private packages bump at all. With `ignore` empty, `tag: true` now tags all
   four packages on release (`@idcr/web@…`, `@idcr/admin@…`, `@idcr/ui@…`, `@idcr/config@…`).

4. **`@changesets/cli` goes in ROOT `devDependencies`.** pnpm with `shamefully-hoist=false` means
   root processes only resolve binaries in root `node_modules/.bin` (existing lesson: husky
   `commit-msg` → `pnpm exec commitlint`, and `release.yml` → semantic-release, both root processes).

5. **Retire semantic-release.** Delete `.releaserc.json`. Remove all 7 devDeps from root
   `package.json`: `semantic-release`, `@semantic-release/changelog`,
   `@semantic-release/commit-analyzer`, `@semantic-release/git`, `@semantic-release/github`,
   `@semantic-release/npm`, `conventional-changelog-conventionalcommits`.
   ⚠️ Verify `conventional-changelog-conventionalcommits` has no other consumer before removing —
   commitlint uses `@commitlint/config-conventional`, which is a **different** package and **stays**.

6. **Rewrite `.github/workflows/release.yml`** to a **hand-rolled direct-push release job**
   (Requirement 7): on every push to `main`, if changesets are present, version + tag + push back to
   `main` automatically — **no bot "Version Packages" PR**. This mirrors today's semantic-release
   direct-to-main flow (chosen by the maintainer over the Version-PR flow). `.github/workflows/pr.yml`
   is **untouched** — its `validate-pr-title` job (`amannn/action-semantic-pull-request@v5`) is
   independent of the release tool. **`changesets/action` is deliberately NOT used** — it implements
   only the PR-based flow; hand-rolling the direct push also sidesteps its `@v1`-camelCase /
   unreleased-`@v2`-kebab-case input trap entirely.

7. **Release job shape** — direct-push, guarded, atomic:

   ```yaml
   name: Release
   on:
     push:
       branches: [main]
   concurrency: # serialize: two quick merges can't race on pushing main
     group: release-main
     cancel-in-progress: false
   permissions:
     contents: write
   jobs:
     release:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with:
             fetch-depth: 0 # changeset version needs full history
             # persist-credentials defaults true → git push authenticates via GITHUB_TOKEN
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with:
             node-version: "22.x"
             cache: pnpm
         - run: pnpm install --frozen-lockfile
         - name: Version, tag, and push if changesets are present
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           run: |
             shopt -s nullglob
             real=(); for f in .changeset/*.md; do [ "$(basename "$f")" != README.md ] && real+=("$f"); done
             if [ ${#real[@]} -eq 0 ]; then echo "No changesets — nothing to release."; exit 0; fi
             git config user.name  "github-actions[bot]"
             git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
             pnpm exec changeset version
             git add -A
             git commit -m "chore(release): version packages [skip ci]"
             pnpm exec changeset tag
             git push --atomic --tags origin HEAD:main
   ```

   - **Changeset-presence guard** — a merge carrying no changeset is a clean no-op (`exit 0`). Only
     changeset-carrying merges release: the same trigger surface as today's semantic-release.
   - **No `pnpm run build`** — versioning is bookkeeping; Vercel builds the deploy, and `/work` heavy
     QA builds pre-merge. Dropping it keeps the job minimal (deliberate, flagged).
   - **Loop prevention (double-guarded)** — the release commit carries `[skip ci]` _and_ is pushed via
     `GITHUB_TOKEN`; GitHub Actions skips `[skip ci]` commits **and** never recursively triggers
     workflows from a `GITHUB_TOKEN` push. Vercel also honors `[skip ci]`, so the bookkeeping commit
     doesn't rebuild the site (the feature commit already deployed) — identical to today.

8. **Atomic tag + push closes the ICR-145 gap.** ICR-145: semantic-release once pushed the release
   **commit** to `main` but failed to push the **tag**, leaving `main` versioned with no tag. The
   direct-push job pushes the branch and all new tags in **one all-or-nothing transaction** —
   `git push --atomic --tags origin HEAD:main`. **Verified** against a bare remote: `main` advanced to
   the new version **and** per-app tags landed together; a pre-existing legacy tag (`v1.27.0`) was an
   untouched no-op; if any ref fails, none apply. Per-app tag format verified: `@idcr/web@1.28.0`,
   `@idcr/admin@0.0.0`, `@idcr/ui@0.0.0`, `@idcr/config@0.0.0`. Note `changeset tag` tags **every**
   package at its current version on the first run (so `@idcr/admin@0.0.0` etc. appear once as
   baselines) and only creates not-yet-existing tags thereafter — harmless. Legacy `v1.x` tags remain
   as history. **GitHub Releases lapse** (no `publish`/release-create step) — per-app `CHANGELOG.md` is
   the release-notes surface. An accepted, decided trade-off.

9. **Freeze root `package.json`.** Keep `"private": true`; leave `version` at its current value. Root
   is never bumped (Requirement 2).

10. **Root `CHANGELOG.md` frozen as legacy.** Add a short header note stating it is the historical
    record through `v1.27.0` (single-version era) and that per-app changelogs supersede it. Its 299
    lines are **not** migrated: those entries describe repo-wide changes including admin/infra work,
    so re-attributing them all to `@idcr/web` would be revisionist. `apps/web/CHANGELOG.md` starts
    fresh, created by Changesets on the first bump.

11. **Standardize the bump mapping — `docs` NO LONGER cuts a release.** The **old** `.releaserc.json`
    was **non-standard** (quoted verbatim, for the record of what is being retired):

    ```json
    "releaseRules": [
      { "type": "feat",  "release": "minor" },
      { "type": "fix",   "release": "patch" },
      { "type": "perf",  "release": "patch" },
      { "type": "docs",  "release": "patch" },   // ← non-standard; being DROPPED
      { "type": "chore", "release": false }
    ]
    ```

    The **new** mapping aligns to the standard conventional-changelog / angular preset — the
    authoritative bump table to carry into changeset files:

    | Commit type                          | Changeset bump                                                                   |
    | ------------------------------------ | -------------------------------------------------------------------------------- |
    | `feat`                               | `minor`                                                                          |
    | `fix`                                | `patch`                                                                          |
    | `perf`                               | `patch`                                                                          |
    | `docs`                               | _no changeset_ ← **standardized: `docs` no longer cuts a release** (was `patch`) |
    | `chore` / `refactor` / `test` / `ci` | _no changeset_                                                                   |

    **Behavior change, decided by the maintainer:** the old scheme cut a **patch** on `docs`; ICR-164
    drops that to match common practice. Vercel still redeploys the site on every push, so a docs
    change still ships — it just no longer earns a version bump. This **deliberately reverses** the
    ICR-109 / ICR-144 rule ("docs cuts a patch here — do not restore"); `tasks/lessons.md` is updated
    so no future agent "corrects" it back.

12. **Docs must paste the mapping table, never paraphrase it.** `tasks/lessons.md` records release-rule
    claims being gotten wrong **twice** (ICR-109, ICR-144). The standing discipline holds regardless of
    _which_ mapping is in force: _never write a sentence asserting release impact without pasting the
    bump table in the same breath._ The new table (Requirement 11) is now the standard preset, but the
    "paste, don't paraphrase" rule still applies to it.

13. **Docs must lead with the behavioral shift.** Today the **PR title** decides the release (the
    squash-merge commit message _is_ the PR title). Under Changesets the **`.changeset/*.md` file**
    decides it. This is the single biggest change and the most likely source of a third recurrence of
    the ICR-109/ICR-144 confusion.

14. **This PR itself ships no changeset.** It is `chore(ICR-164)`, and `chore` → no changeset per
    Requirement 11. Correct by construction: retiring release tooling must not bump an app. Post-merge
    the release job runs with zero changesets and does nothing — which is exactly the AC4 "root frozen
    across a real release-job run" observation.

## Data Model Changes

**None.** No database, no Contentful content-model change, no TypeScript interfaces. This ticket
touches build/release tooling, CI, and docs only. The Contentful model-change gate does **not** apply.

## API Changes

**None.** No routes, no Server Actions, no Zod schemas, no request/response contracts.

## New / Modified Files

### New

| Path                              | Purpose                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.changeset/config.json`          | Changesets config (Requirement 1)                                                                                                                                                              |
| `.changeset/README.md`            | Created by `changeset init`; keep as-is                                                                                                                                                        |
| `docs/architecture/versioning.md` | The versioning model: independent mode, versioned internals + auto-cascade, structural root freeze, the standardized bump mapping (docs no longer releases), the PR-title→changeset-file shift |

### Modified

| Path                                | Change                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `package.json` (root)               | `-7` `@semantic-release/*`/`semantic-release` devDeps; `+@changesets/cli@^2.31.1`; version frozen; stays `private: true` |
| `pnpm-lock.yaml`                    | Regenerated by `pnpm install`                                                                                            |
| `.github/workflows/release.yml`     | Rewritten: hand-rolled direct-push job (guard → version → commit `[skip ci]` → tag → atomic push)                        |
| `CHANGELOG.md` (root)               | Legacy header note only; 299 lines of history untouched                                                                  |
| `CLAUDE.md`                         | Line 11 stale `Version: 1.10.0` → per-app source of truth; the Code-Conventions `semantic-release` sentence → Changesets |
| `docs/architecture/contributing.md` | §Releases rewritten (lines ~89–101)                                                                                      |

### Deleted

| Path              | Why                                     |
| ----------------- | --------------------------------------- |
| `.releaserc.json` | The single-version config being retired |

### Created by tooling on the FIRST release after merge (not in this PR)

| Path                           | When                      |
| ------------------------------ | ------------------------- |
| `apps/web/CHANGELOG.md`        | first `@idcr/web` bump    |
| `apps/admin/CHANGELOG.md`      | first `@idcr/admin` bump  |
| `packages/ui/CHANGELOG.md`     | first `@idcr/ui` bump     |
| `packages/config/CHANGELOG.md` | first `@idcr/config` bump |

None of these exist in this PR (it ships no changeset). They are listed so their later appearance is
expected, not a surprise.

### Explicitly NOT touched

`.github/workflows/pr.yml` · `.husky/*` · `commitlint.config.*` · `turbo.json` · `pnpm-workspace.yaml` ·
all four package `package.json` **version** fields (bumped **by tooling** post-merge, never by hand in
this PR — `apps/web` stays `1.27.0`, `apps/admin`/`packages/*` stay `0.0.0` until their first changeset)

## Component Hierarchy

**N/A** — no UI. No components, no responsive variants, no locales.

## Edge Cases

1. **`changesets/action` is deliberately not used (direct-push flow) — which sidesteps its input
   trap.** For the record, that trap is real: the action's `main`-branch README shows `@v2` with
   **kebab-case** inputs, but `@v2` is only prereleased (`v2.0.0-next.*`); **latest stable is v1.9.0**
   with **camelCase** inputs, so kebab-case against `@v1` would be silently ignored. Because the
   release job is hand-rolled (Requirement 7), the action — and this trap — never enter the picture.
   If a future maintainer switches to the Version-PR flow, pin `@v1` + camelCase.

2. **Root in `ignore` → hard config failure.** Requirement 2. The failure is loud (every changeset
   command throws), so it cannot pass silently — but a future editor reading the Jira ticket's locked
   decision 3 _will_ be tempted to re-add it. → `versioning.md` documents the exact error and why.

3. **`privatePackages.tag` omitted → silent tag-lineage loss.** Unlike case 2, this fails **silently**:
   versions still bump, tags just stop appearing. → Requirement 3 sets it explicitly.

4. **Release-commit infinite-loop prevention.** The direct-push job commits + pushes back to `main`,
   which is itself a push to `main` — the release workflow's own trigger. Two independent guards stop a
   loop: (a) the commit message carries `[skip ci]`, which GitHub Actions honors by skipping the run;
   (b) pushes made with `GITHUB_TOKEN` never recursively trigger workflows. Either alone suffices;
   both are present. Verified mechanism matches today's semantic-release `[skip ci]` convention.

5. **`changeset publish` caveats are unreachable.** Changesets' `ignore`/dependency-update publish
   caveats only bite on `changeset publish`, which we never run (nothing is published; `access:
restricted` + all packages `private`). With `ignore` now empty, they are doubly moot.

6. **A change to `@idcr/config`/`@idcr/ui` cascades automatically.** They are **versioned** (empty
   `ignore`), so a changeset scoped to the shared package auto-bumps every consuming app by a patch —
   no manual re-scoping to the apps. Verified: an `@idcr/ui` patch bumped `@idcr/web` **and**
   `@idcr/admin`. Two things follow: (a) a shared-package change patches **both** apps even if only one
   renders the changed code — accepted as "the app's inputs changed"; (b) a changeset should be scoped
   to the package that actually changed (`@idcr/ui`), and Changesets handles the fan-out. Documented in
   `versioning.md`.

7. **`@idcr/admin` first bump.** Stays `0.0.0` until its first real changeset; a `feat` then takes it
   to `0.1.0`. Do **not** pre-bump it in this PR.

8. **Zero changesets on `main`.** The changeset-presence guard exits 0 — no commit, no tag, no push.
   Correct no-op (only changeset-carrying merges release).

9. **`changeset status` needs git history.** It resolves `baseBranch` divergence and errors with
   _"Failed to find where HEAD diverged from 'main'"_ in a repo without that history (observed in the
   scratch probe). Not an issue in CI or a real worktree; noted so it isn't misdiagnosed.

10. **`conventional-changelog-conventionalcommits` vs `@commitlint/config-conventional`.** Similar
    names, different packages. The former is semantic-release's preset (**remove**); the latter is
    commitlint's (**keep**). Confusing them breaks the husky `commit-msg` hook.

## i18n

**N/A** — no user-facing strings. `public/locales/{es-AR,en-US}.json` untouched.

## Testing Strategy

**No new permanent test harness.** Root's `test` script is a pure `turbo run test` proxy with no
root-level vitest; adding one (root vitest config + dep + turbo root-task wiring) would be ~4 files of
infrastructure for a single config assertion — disproportionate, and against the repo's
"impact minimal code" rule. The root-in-`ignore` trap **fails loudly on its own**; the `tag: false`
trap is guarded by explicit config + docs; the `docs`→no-release change is a config fact proven by the
dry-run + documented with the pasted mapping table.

Verification is instead **behavioral, at implementation time**, in the worktree:

1. **Dry-run proof (Checkpoint 1 gate)** — two temporary changesets, each proven then fully reverted
   (`git checkout -- . && rm` the temp changeset; **nothing committed**):
   - **1a — app isolation.** A `@idcr/web` changeset → `apps/web` bumps per its type; root, `apps/admin`,
     `packages/config`, `packages/ui` all **unchanged**; `apps/web/CHANGELOG.md` gets the right entry.
   - **1b — internal-package cascade.** An `@idcr/ui` changeset → `@idcr/ui` bumps; `@idcr/web` **and**
     `@idcr/admin` auto-bump a patch; `@idcr/config` and root **unchanged**; the apps' changelogs record
     `Updated dependencies → @idcr/ui@<v>`. (Confirms the empty-`ignore` cascade landed as designed.)

2. **Config validity.** `pnpm exec changeset status` runs without a `ValidationError`.

3. **Regression suite stays green.** `pnpm test` — baseline is **607 tests / 58 files, 3/3 turbo tasks**
   (captured on this worktree before any change). Must remain green.

4. **Full stack (heavy depth).** `pnpm type-check` + `pnpm lint` + `pnpm test` + `pnpm build`.

5. **Workflow YAML sanity.** Confirm `release.yml` parses (`actionlint`/`yq`); the direct-push job has
   the changeset-presence guard, the `--atomic --tags` push, and `[skip ci]`; no `changesets/action`.

6. **Post-merge observation (NOT pre-merge).** AC4 and AC5 are observations of a _real merge_ and
   cannot be proven in this PR — see Open Questions 1.

## Implementation Checkpoints

### CP1 — Add Changesets

- **Files:** `package.json` (root), `pnpm-lock.yaml`, `.changeset/config.json`, `.changeset/README.md`
- **Do:** `pnpm add -Dw @changesets/cli@^2.31.1`; `pnpm exec changeset init`; overwrite the generated
  config with Requirement 1 verbatim.
- **Verify:** `pnpm exec changeset status` → no `ValidationError`. Then the **full dry-run proof**
  (Testing Strategy 1) and revert it.
- **Commit:** `chore(ICR-164): add changesets with independent per-app versioning`

### CP2 — Retire semantic-release

- **Files:** `.releaserc.json` (delete), `package.json` (root), `pnpm-lock.yaml`
- **Do:** Delete `.releaserc.json`; remove the 7 devDeps (Requirement 5). Confirm
  `conventional-changelog-conventionalcommits` has no other consumer; **keep**
  `@commitlint/config-conventional`.
- **Verify:** `grep -ri "semantic-release" --exclude-dir=node_modules .` returns only intended
  historical mentions (root `CHANGELOG.md`, `tasks/lessons.md`). `pnpm install` clean; husky
  `commit-msg` still works (this checkpoint's own commit proves it).
- **Commit:** `chore(ICR-164): remove semantic-release config and dependencies`

### CP3 — Rewrite the release workflow

- **Files:** `.github/workflows/release.yml`
- **Do:** Replace with the direct-push job (Requirement 7): changeset-presence guard → `changeset
version` → commit `[skip ci]` → `changeset tag` → `git push --atomic --tags origin HEAD:main`. Add
  `concurrency: release-main`; `fetch-depth: 0`; `permissions: contents: write` only. No
  `changesets/action`, no `pnpm run build`, no `NPM_TOKEN`.
- **Verify:** YAML parses (`actionlint` or `yq`); changeset-presence guard present; `--atomic` push
  present; `[skip ci]` in the commit message; `permissions` least-privilege; no `changesets/action`
  reference; no `NPM_TOKEN`.
- **Commit:** `chore(ICR-164): replace semantic-release job with changesets release workflow`

### CP4 — Freeze root + legacy changelog note

- **Files:** `package.json` (root), `CHANGELOG.md` (root)
- **Do:** Confirm `private: true` + version left as-is. Add the legacy header note (Requirement 10).
- **Verify:** 299 lines of history intact below the note; root version untouched.
- **Commit:** `chore(ICR-164): freeze root version and mark root changelog as legacy`

### CP5 — Add `docs/architecture/versioning.md`

- **Files:** `docs/architecture/versioning.md` (new)
- **Do:** Per `divinelab:scribe`. Must cover: independent mode; **internal packages are versioned +
  auto-cascade** to consuming apps (empty `ignore`, `updateInternalDependencies: patch`) with the
  verified example; why root is **structurally** excluded **and must never be added to `ignore`** (quote
  the ValidationError); `privatePackages.tag: true` rationale; the **verbatim** standardized mapping
  table (Requirement 11) with an explicit callout that **`docs` no longer cuts a release** (reverses the
  old rule); the **direct-push release flow** (auto version+tag+push on every changeset-carrying merge
  to `main`; the atomic push + `[skip ci]` loop guard; how it closes the ICR-145 gap); the **PR-title →
  changeset-file shift** (Requirement 13); per-app tag format; GitHub Releases lapsing; Edge Cases
  1/6/7.
- **Verify:** Mapping table matches Requirement 11 character-for-character. No paraphrase of release
  impact anywhere (Requirement 12).
- **Commit:** `docs(ICR-164): document the changesets per-app versioning model`

### CP6 — Update `contributing.md` + `CLAUDE.md`

- **Files:** `docs/architecture/contributing.md`, `CLAUDE.md`
- **Do:** Rewrite §Releases (lines ~89–101) for Changesets, keeping the verbatim mapping table and
  linking `versioning.md`. Fix `CLAUDE.md:11` stale `Version: 1.10.0` → per-app source of truth. Fix
  the Code-Conventions `semantic-release` sentence.
- **Verify:** No stale semantic-release claims remain in either file; no version number that will
  drift again.
- **Commit:** `docs(ICR-164): update contributing and CLAUDE.md for changesets`

### CP7 — Confirm the Yoke follow-up ticket (already filed)

- **Files:** none (Jira only)
- **Do:** [YK-1](https://divinelab.atlassian.net/browse/YK-1) is **already filed and linked** (Relates
  ICR-164): _"Versioning-strategy-aware harness: adapt pr-author + /work to semantic-release vs
  Changesets (+ `versioning` canon block)."_ It owns the out-of-repo half — the declared `versioning`
  canon property, the adaptive branch (absent/`semantic-release` = today's behavior; `changesets` =
  scoped changeset), and the `pr-author` logic. No new ticket to create; confirm it still exists and
  the link holds at wrap-up.
- **Verify:** YK-1 open + linked; its scope matches this spec's Open Questions 1–2.
- **Commit:** none.

> **Note:** CP5/CP6 use `docs(...)`. Under the **standardized** mapping (Requirement 11), `docs` no
> longer triggers a release at all — and regardless, release impact now comes only from a **changeset
> file**, which this PR intentionally ships none of (Requirement 14). The PR squash-merges under a
> single `chore(ICR-164)` title anyway. Net: **no release impact** on either count.

## Open Questions

1. **AC4 and AC5 cannot be satisfied inside this PR — they are post-merge observations.**
   AC4 ("root version unchanged across at least one full release-job run") and AC5 ("`/work`'s
   pr-author writes a valid changeset, demonstrated on at least one real ticket merge") both require a
   _real merge_ to observe. This PR builds and proves the mechanism; the observations land afterward.
   AC5 additionally depends on the `YK` plugin work (CP7). → Proposal: mark AC4/AC5 as
   **verified-after-merge** on the Jira issue rather than claiming them green pre-merge.

2. **AC5's in-repo half is deliberately docs-only, and this repo adopts the config block only after
   Yoke ships it.** The harness is being made **versioning-strategy-aware** (YK-1): the plugin branches
   on a declared `versioning` block — absent / `tool: "semantic-release"` keeps today's behavior,
   `tool: "changesets"` writes a scoped changeset. Today `versioning` is **not yet a declared canon
   property** (`config.schema.json` lives in the plugin), and canon rule 6 bars plugin logic from
   depending on project-owned domain blocks — so adding the block to this repo's config now would sit
   unread and unsanctioned. The correct sequence: **YK-1 makes `versioning` a first-class canon
   property + ships the adaptive `pr-author`/`/work` logic → then idc-redentor-platform adds its own
   `versioning` block** (a trivial follow-up). ICR-164 therefore ships **docs only** for the config
   side and documents the manual "author a `.changeset/<slug>.md` before PR-ready" fallback until Yoke
   lands. → Tracked by **[YK-1](https://divinelab.atlassian.net/browse/YK-1)** (Relates ICR-164), which
   owns the schema, the adaptive branch, and the `pr-author` logic. _(Approved + broadened to the
   adaptive-harness framing during the design gate.)_

3. **GitHub Releases lapse.** Decided and accepted (per-app `CHANGELOG.md` becomes the release-notes
   surface). Flagged only so it is a conscious loss, not a silent one. Reversible later by adding a
   release-creation step.

4. **This spec deviates from two finalized Jira ACs — sync the Jira issue after spec approval.** Two
   maintainer decisions taken during spec review supersede the refined ACs:
   - **AC1 (the `ignore` array).** The Jira AC says `ignore: ["@idcr/config", "@idcr/ui",
"idc-redentor-platform"]`. Final design: **`ignore: []`** — internals are versioned + cascade
     (Requirement 2), and root can't be listed (ValidationError). AC1's "each app has its own CHANGELOG
     reflecting only its own changes" also softens: an app changelog will additionally carry
     `Updated dependencies` lines from cascaded shared-package bumps — still its own history.
   - **The bump mapping.** The Jira description preserved `docs`→patch; final design **standardizes
     `docs`→no release** (Requirement 11).
     → After approval, I update the ICR-164 Jira description's Acceptance Criteria + Resolved-decisions to
     match, so the acceptance-judge (which reads the Jira ACs) grades against the final design, not the
     superseded one.

## Sensitive areas

Per `.claude/config.json` → `qa.autoMerge.sensitivePaths`, this ticket has **maximal overlap** with the
repo's declared sensitive surface:

| Area                                | Touched                                      | Risk                                                                                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env-secrets` / CI release pipeline | `.github/workflows/release.yml`              | Release permissions + `GITHUB_TOKEN`. Keep least-privilege; **no `NPM_TOKEN`** (nothing is published). Never echo secrets.                                                                                                                                         |
| Dependency / lockfile               | `package.json`, `pnpm-lock.yaml`             | Both in `sensitivePaths`. Lockfile churn must come from `pnpm install` only.                                                                                                                                                                                       |
| Workspace config                    | `turbo.json`, `pnpm-workspace.yaml`          | In `sensitivePaths` — **not modified**, but adjacent.                                                                                                                                                                                                              |
| Release-rule behavior               | `.releaserc.json` → `.changeset/config.json` | The mapping is being **standardized** (old `docs`→patch dropped), but release rules here have been mis-stated **twice** (ICR-109, ICR-144). Requirements 11–13 exist to stop a third — paste the table, never paraphrase; call out the `docs` reversal explicitly. |

**Not touched:** `.husky/*` (secret-scan + commitlint hooks are load-bearing). The implementer must
**never** use `--no-verify`.
