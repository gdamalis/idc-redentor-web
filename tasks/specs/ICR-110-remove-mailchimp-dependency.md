# ICR-110 — Remove the unused `@mailchimp/mailchimp_marketing` dependency

> **Jira:** [ICR-110](https://divinelab.atlassian.net/browse/ICR-110) · Task · Medium · `newsletter`, `tech-debt`
> **Branch:** `chore/ICR-110-remove-mailchimp-dependency` · **PR title:** `chore(ICR-110): …`
> **Blocks:** [ICR-156](https://divinelab.atlassian.net/browse/ICR-156) (human-only runbook: unset `MAILCHIMP_*` in Vercel, close the account)
> **QA depth:** standard · **QA type:** `chore` (no UI, no API, no behavior change)

## 1. Dependencies Check

Everything below was verified against the branch (`origin/main` @ `ea8d799`), not inherited from the ticket.

| Claim                                                                                                 | Status                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Zero `import`/`require` of `@mailchimp/*` in `apps/`, `packages/`                                     | ✅ verified (paired with a positive control — a bare grep that errors prints nothing, which reads exactly like a clean negative) |
| Zero `process.env.MAILCHIMP_*` reads in any committed code                                            | ✅ verified                                                                                                                      |
| `superagent@3.8.1` + `dotenv@8.6.0` are dependencies of `@mailchimp/mailchimp_marketing` **only**     | ✅ verified in `pnpm-lock.yaml`                                                                                                  |
| No `tsconfig` `types` array, vitest setup file, or global augmentation references the Mailchimp types | ✅ verified                                                                                                                      |
| The three Resend tests are genuinely Resend-only                                                      | ✅ verified — `resendAudience.test.ts` (3), `subscribe.service.test.ts` (4), `app/api/subscribe/route.test.ts` (9)               |
| Baseline test count on this branch                                                                    | **508 passing / 49 files** — must be **unchanged** at the end                                                                    |

**Line-number drift from the ticket:** `package.json` is **L31** (dep) and **L67** (devDep), not L30/L65. Every other cited line is exact.

**One file the ticket and the explorer both missed:** `.claude/config.json:200`. Its `liveIntegrationNote` carries the _same_ stale sentence as `docs/architecture/agent-harness.md:289`. It sits outside AC2's grep footprint so it violates no AC — but fixing the doc and leaving its twin is the cross-file contradiction the ICR-144 lesson exists to prevent. **In scope, by human decision at the design gate.**

## 2. Requirements

1. Remove `@mailchimp/mailchimp_marketing` (deps) and `@types/mailchimp__mailchimp_marketing` (devDeps) from `apps/web/package.json`; regenerate `pnpm-lock.yaml`.
2. Delete the `MAILCHIMP_*` declarations from `apps/web/src/types/environment.d.ts` and `apps/web/.env.example`.
3. Correct the stale `Mailchimp` comment in `apps/web/src/service/broadcast/types.ts:13`.
4. Sweep every **engineering** doc that names Mailchimp as the newsletter provider (full worklist in §5).
5. Re-point the stale **ICR-18** cross-reference at the real decommission ticket, **ICR-156**.
6. **Preserve** the `RESEND_AUDIENCE_ID` legacy-fallback prose that lives _inside_ the blockquotes being deleted (see §7, Edge Case 1).
7. Fix the two adjacent false claims in the docs being edited (human decision at the design gate): the six bogus `❌ missing` markers in `forms-and-email.md`'s env table, and the "`.env.example` is incomplete" claim in `contributing.md:12`.
8. **No behavior change.** Not one line of the Resend path is modified.

## 3. Data Model Changes

**None.** `campaignId` (in `BroadcastResult`, `BroadcastLogDocument`, and existing Mongo documents) keeps its name — it now holds a **Resend broadcast id**, and only the _comment_ describing it is wrong. Renaming the field would be a Mongo data-model migration, which contradicts requirement 8.

## 4. API Changes

**None.** `POST /api/subscribe` must still resolve an audience for both `es-AR` and `en-US`, proven by its 9 existing tests passing **unchanged**.

## 5. New / Modified Files

### Code + config

| File                                      | Line(s) | Change                                                                                         |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/package.json`                   | 31, 67  | Delete both dependency entries                                                                 |
| `pnpm-lock.yaml`                          | —       | Regenerate via `pnpm install` (drops `superagent@3.8.1` + `dotenv@8.6.0`)                      |
| `apps/web/src/types/environment.d.ts`     | 23–26   | Delete the `// MailChimp` block (comment + 3 vars)                                             |
| `apps/web/.env.example`                   | 41–44   | Delete the comment line + 3 vars                                                               |
| `apps/web/src/service/broadcast/types.ts` | 13      | `/** Plain-text alternative (Mailchimp \`plain_text\`). _/`→`/\*\* Plain-text alternative. _/` |
| `.claude/config.json`                     | 200     | `Mailchimp/SendGrid/Resend are presumed LIVE` → `SendGrid/Resend are presumed LIVE`            |

### Docs

| File                                     | Line(s) | Change                                                                                                                                                                                                             |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE.md`                              | 164     | Drop the trailing "The one thing still wrong with it: it retains the **dead** `MAILCHIMP_*` vars … ICR-110 removes them." The rest of the blockquote (".env.example is **current**") stays and becomes fully true. |
| `CLAUDE.md`                              | 111     | Drop "**Mailchimp is no longer used**; the `@mailchimp/*` dep and `MAILCHIMP_*` env vars are dead code pending removal (ICR-110)."                                                                                 |
| `CLAUDE.md`                              | 185–188 | Delete the ⚠️ MAILCHIMP callout paragraph — **but keep** the `RESEND_AUDIENCE_ID` paragraph that follows inside the same blockquote                                                                                |
| `AGENTS.md`                              | 42      | Drop "_Mailchimp is gone_ — the `@mailchimp/*` dep + `MAILCHIMP_*` env vars are dead code pending removal (ICR-110)."                                                                                              |
| `AGENTS.md`                              | 101–104 | Delete the ⚠️ MAILCHIMP callout — **but keep** the following `RESEND_AUDIENCE_ID` paragraph                                                                                                                        |
| `docs/architecture/forms-and-email.md`   | 66–68   | Rewrite the ICR-44 blockquote: drop the Mailchimp env-var sentence; re-point **ICR-18 → ICR-156**. Keep the "existing subscribers were not migrated / start fresh" fact.                                           |
| `docs/architecture/forms-and-email.md`   | 127     | Drop the false "several are **missing** from `.env.example`" intro sentence                                                                                                                                        |
| `docs/architecture/forms-and-email.md`   | 137     | Delete the `MAILCHIMP_API_KEY / … ` row (the only `✅ present` — and it's the one that's leaving)                                                                                                                  |
| `docs/architecture/forms-and-email.md`   | 131–136 | Flip the six false `❌ missing` → `✅` (all six verified present in `.env.example`)                                                                                                                                |
| `docs/architecture/contributing.md`      | 12      | Drop `Mailchimp` from the credentials list **and** the stale "(which is incomplete; see below)"                                                                                                                    |
| `docs/architecture/likes-and-mongodb.md` | 34      | `// Mailchimp campaign id, set on success` → `// Resend broadcast id, set on success`                                                                                                                              |
| `docs/architecture/likes-and-mongodb.md` | 48      | "no second Mailchimp send" → "no second Resend broadcast"                                                                                                                                                          |
| `docs/architecture/agent-harness.md`     | 289     | `Mailchimp/SendGrid/Resend are presumed LIVE` → `SendGrid/Resend are presumed LIVE`                                                                                                                                |

### Explicitly NOT touched

| File                                                                     | Why                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/service/resendAudience.ts` (`RESEND_AUDIENCE_ID`)          | Deliberate legacy fallback — makes a legacy deploy behave as es-AR-only so **nobody is double-emailed**. Unrelated to Mailchimp.       |
| `.husky/pre-commit:14`                                                   | Secret-scan regex still watching for Mailchimp keys — a safety net that stays useful _because_ the account still exists until ICR-156. |
| `.vscode/settings.json:45`                                               | cSpell dictionary entry — harmless.                                                                                                    |
| `docs/product/overview.md:69`, `docs/product/scope-and-boundaries.md:38` | **ICR-154 item D4.** Deliberately seamed so the two tickets run in parallel.                                                           |
| `tasks/specs/**`, `tasks/lessons.md`, `scripts/trello-export.json`       | Historical audit trail — rewriting it destroys the record.                                                                             |

## 6. Component Hierarchy

Not applicable — no UI surface is touched.

## 7. Edge Cases

1. **Over-deletion of the `RESEND_AUDIENCE_ID` prose.** The ⚠️ callouts in `CLAUDE.md:185-188` and `AGENTS.md:101-104` are blockquotes whose _second_ paragraph explains the `RESEND_AUDIENCE_ID` legacy fallback — correct, load-bearing prose that must survive. Deleting the blockquote wholesale silently destroys it. **Mitigation:** the AC-grep harness carries **positive** assertions (§9), not just zero-hit negatives.
2. **A grep that errors prints nothing**, which is indistinguishable from a clean negative (ICR-103). **Mitigation:** every negative assertion is paired with a positive control that must match.
3. **`.claude/config.json` is in the prettier backlog** — the husky `lint-staged` hook may reformat ~140 lines around the 1-word change. **Mitigation:** prove the semantic diff structurally (parse both versions, diff the objects — expect `0 keys added, 0 removed, 1 value changed`) and put that proof in the commit/PR, per the ICR-144 lesson.
4. **`@types` package name has no slash** — `@types/mailchimp__mailchimp_marketing` (double underscore). Easy to miss with a naive `@mailchimp/` grep.
5. **Lockfile is load-bearing on Vercel** (`--frozen-lockfile`): a stale `pnpm-lock.yaml` fails the **deploy**, not just CI. It must be committed.
6. **`MAILCHIMP_FROM_NAME`** exists in local `.env.local` / Vercel but is declared in neither `environment.d.ts` nor `.env.example` — nothing to delete here; it belongs to **ICR-156**.

## 8. i18n

Not applicable — no user-facing strings change. No locale file is touched.

## 9. Testing Strategy

**No new committed tests.** The removal's correctness is proven by existing tests being _unchanged_, plus a throwaway RED→GREEN harness (human decision at the design gate).

### The throwaway AC harness (`/tmp`, never committed)

Run **before** any edit — it must **FAIL**, and the failing output _is_ the reproduction of the documentation defect. Re-run after CP3 — it must pass.

**Negative assertions** (must be zero after the fix):

- case-insensitive `mailchimp` across `apps/`, `packages/`, `docs/architecture/`, `CLAUDE.md`, `AGENTS.md` → **0 hits**
- `mailchimp` in `.claude/config.json` → **0 hits**

**Positive assertions** (must still match — these are what stop an over-delete):

- `RESEND_AUDIENCE_ID` legacy-fallback prose present in **both** `CLAUDE.md` and `AGENTS.md`
- `RESEND_AUDIENCE_ID` still declared in `environment.d.ts` **and** `.env.example`
- `ICR-156` referenced in `forms-and-email.md` (proves the ICR-18 ref was _corrected_, not just deleted)
- `.husky/pre-commit` **still** contains its Mailchimp secret-scan regex (proves we didn't over-reach)
- `docs/product/` Mailchimp mentions **still present** (proves we respected the ICR-154 seam)

**Positive control:** a `resend` grep must return ≥ 30 hits — if it returns 0, the search is broken, not the codebase clean.

### Existing suites

- `pnpm type-check` — the real proof nothing referenced the deleted type declarations.
- `pnpm test` — must be **508 passing / 49 files**, identical to baseline. A _drop_ means we deleted a test; a _rise_ means scope leaked.
- The three Resend suites pass **unchanged**: `resendAudience.test.ts` (3), `subscribe.service.test.ts` (4), `app/api/subscribe/route.test.ts` (9).
- `pnpm build` — proves no import resolves to the removed packages.

## 10. Implementation Checkpoints

### RED (before any edit)

Write the harness to `$TMPDIR`, run it, **capture the failing output verbatim** for the PR body. Expect ~15 in-scope hits and all positive assertions already passing.
_No commit._

### CP1 — Remove the packages

- **Files:** `apps/web/package.json` (L31, L67), `pnpm-lock.yaml`
- **Verify:** `grep -c mailchimp pnpm-lock.yaml` → 0; `superagent@3.8.1` + `dotenv@8.6.0` gone; `pnpm install` clean; `pnpm test` → **508 passing**
- **Commit:** `chore(ICR-110): drop the dead @mailchimp packages and regenerate the lockfile`

### CP2 — Delete the dead env surface

- **Files:** `apps/web/src/types/environment.d.ts` (23–26), `apps/web/.env.example` (41–44), `apps/web/src/service/broadcast/types.ts` (13)
- **Verify:** `pnpm type-check` green (proves nothing read the deleted declarations); `RESEND_AUDIENCE_ID` still declared in both files
- **Commit:** `chore(ICR-110): remove the dead MAILCHIMP_* env declarations`

### CP3 — Doc sweep + accuracy fixes

- **Files:** `CLAUDE.md`, `AGENTS.md`, `docs/architecture/{forms-and-email,contributing,likes-and-mongodb,agent-harness}.md`, `.claude/config.json`
- **Verify:** the AC harness goes **GREEN** (all negatives 0, all positives matching); `.claude/config.json` semantic diff = 1 value changed
- **Commit:** `chore(ICR-110): correct every engineering doc that still names Mailchimp`

### GREEN (verification, no edits)

Re-run the harness (capture the passing output for the PR body), then the full stack: `pnpm type-check && pnpm lint && pnpm test && pnpm build`. **Delete the harness script.** Confirm `git status` is clean of it before the final push.

## 11. Open Questions

**None.** All three design-gate decisions are locked:

1. `.claude/config.json:200` twin — **fix in this PR**.
2. The adjacent `❌ missing` / "incomplete" drift — **fix it** (all six vars verified present in `.env.example`).
3. AC harness — **throwaway** RED→GREEN, evidence pasted into the PR body, script not committed.

## 12. Release impact

`.releaserc.json` `releaseRules`: `feat`→minor · `fix`/`perf`/**`docs`**→patch · **`chore`→`false`**.
A squash-merge takes its type from the **PR title**, so the title **must** be `chore(ICR-110): …` → **no release is cut**. Titling this `docs(…)` — tempting, since most of the diff is prose — _would_ cut a patch release for a zero-behavior-change PR.

## 13. Deferred production action

Already ticketed as **[ICR-156](https://divinelab.atlassian.net/browse/ICR-156)** (Backlog, Low, human-only runbook, _blocked by_ ICR-110): unset `MAILCHIMP_*` (incl. `MAILCHIMP_FROM_NAME`) in the Vercel dashboard across all three tiers, and close the Mailchimp account. **No new ticket needed.**
