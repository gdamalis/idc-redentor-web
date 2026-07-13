# ICR-109 — Correct the persisted ICR-29 broadcast spec/plan to the shipped fail-closed postal-address guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two persisted ICR-29 design docs (`tasks/specs/ICR-29-broadcast-email-service.md` and `…plan.md`) tell the truth about the shipped broadcast engine: `BROADCAST_POSTAL_ADDRESS` is validated **before** `claimBroadcast`, and a missing address **fails closed** with `{ status: "failed", reason: "postal-address-missing" }` — no claim, no send, no fallback address.

**Architecture:** Pure prose/markdown reconciliation. The code is already correct and is the source of truth; the docs are wrong. Nothing in `apps/web/**` may change. The "tests" for this ticket are mechanical `grep` assertions over the two files that encode the acceptance criteria — write them first, watch them fail, edit, watch them pass.

**Tech Stack:** Markdown. `grep`/`rg` for assertions. `pnpm format` / `pnpm format:check` (Prettier) as the only tooling gate.

## Global Constraints

- **Commit type is `docs`** (not `chore`) — `docs(ICR-109): …`. A docs-only change must not make semantic-release cut a version bump. Branch is already `docs/ICR-109-broadcast-spec-fail-closed`.
- **No code file may appear in the diff.** `git diff --name-only origin/main...HEAD` must list **only** the two `tasks/specs/ICR-29-*.md` files plus this plan. Explicitly out of scope: `apps/web/src/service/broadcast.service.ts`, `apps/web/src/service/broadcast/types.ts`, any `*.test.ts`, and `docs/architecture/forms-and-email.md` (all already correct).
- **The shipped reason union is canonical** (`apps/web/src/service/broadcast/types.ts:22-27`), in this exact order:
  `already-sent | invalid-input | dedupe-unavailable | resend-not-configured | postal-address-missing | send-failed`
- **The shipped guard order is canonical** (`broadcast.service.ts:19-46`), entry → send:
  1. zod `safeParse` → `invalid-input`
  2. `isResendBroadcastConfigured(locale)` → `resend-not-configured`
  3. `resolveAudienceId(locale)` missing → `resend-not-configured`
  4. **postal address missing → `postal-address-missing`** ← the guard this ticket is about
  5. `claimBroadcast(broadcastId)` → `already-sent` | `dedupe-unavailable`
  6. send (try/catch) → `send-failed` | `sent`
- **Scope decision (locked by the human):** fix **both eras** of `plan.md`. The file has an original Mailchimp-era `Task 1…6` layer and a `Revision 2` (`RW-1…RW-5`) Resend rewrite that supersedes it. Correct the active RW layer _and_ bring the superseded Task-1 union in line + mark the superseded Task-5 matrix as superseded, so a reader working top-to-bottom never sees a wrong union.
- **Fallback strings are banned anywhere in either file.** After this ticket, `grep -c 'Buenos Aires, Argentina'` over `plan.md` must be `0`. (Note: the same string legitimately appears as _test fixture data_ in `broadcast.template.test.ts` / `broadcast.service.test.ts` — those are code files, out of scope, do not touch.)
- Run `pnpm format` on the two touched files before committing; `pnpm format:check` must pass.

---

### Task 1: Correct `plan.md` — both eras

**Files:**

- Modify: `tasks/specs/ICR-29-broadcast-email-service.plan.md` (4 edit sites: `:110`, the `Task 5` header ~`:641`, `:1113-1121`, `:1145`)

**Interfaces:**

- Consumes: nothing (first task).
- Produces: the corrected canonical reason union + guard ordering text that Task 2 must make `spec.md` agree with. Task 2 asserts cross-file agreement.

- [ ] **Step 1: Write the failing assertions** — create `/tmp/icr109-assert.sh` (a throwaway, NOT committed):

```bash
#!/usr/bin/env bash
# ICR-109 acceptance assertions. Exit 0 = all ACs hold.
# NOTE: positive checks are PRESENCE checks (>=1), never exact counts — a
# corrected phrase legitimately appears in more than one place (e.g. the RW-4
# code block AND the RW-4 test-matrix paragraph both name the reason token).
# Only the negative checks (a banned string) are exact-zero.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
PLAN=tasks/specs/ICR-29-broadcast-email-service.plan.md
SPEC=tasks/specs/ICR-29-broadcast-email-service.md
fail=0
absent() { # absent <description> <file> <pattern> — must match ZERO times
  n=$(grep -c -- "$3" "$2" || true)
  if [ "$n" -eq 0 ]; then printf '  PASS  %s\n' "$1"
  else printf '  FAIL  %s (banned string present %sx)\n' "$1" "$n"; fail=1; fi
}
present() { # present <description> <file> <pattern> — must match AT LEAST once
  n=$(grep -c -- "$3" "$2" || true)
  if [ "$n" -ge 1 ]; then printf '  PASS  %s (%sx)\n' "$1" "$n"
  else printf '  FAIL  %s (not found)\n' "$1"; fail=1; fi
}

# AC1 — no fallback address anywhere in the plan
absent "plan: no 'Buenos Aires, Argentina' fallback"   "$PLAN" 'Buenos Aires, Argentina'
absent "plan: no '?? <default>' postal fallback"       "$PLAN" 'BROADCAST_POSTAL_ADDRESS ??'
# AC1 — the fail-closed guard is present
present "plan: postal-address-missing return"          "$PLAN" 'reason: "postal-address-missing"'
present "plan: guard reads BROADCAST_POSTAL_ADDRESS?.trim()" "$PLAN" 'BROADCAST_POSTAL_ADDRESS?.trim()'
# AC3 — reason union carries the token; the mailchimp-era union is gone
present "plan: union has postal-address-missing"       "$PLAN" 'resend-not-configured | postal-address-missing | send-failed'
absent  "plan: union drops mailchimp-not-configured"   "$PLAN" 'Non-secret token: already-sent | invalid-input | dedupe-unavailable | mailchimp-not-configured'
# AC3 — the test-case matrix names the case; the superseded matrix is flagged
present "plan: matrix names the postal case"           "$PLAN" 'without claiming or sending'
present "plan: Task 5 marked SUPERSEDED"               "$PLAN" 'SUPERSEDED by RW-4'

# AC2 — spec edge case 9 is fail-closed, not a fallback
absent  "spec: no 'falls back' guidance"               "$SPEC" 'falls back'
present "spec: edge case 9 is fail-closed"             "$SPEC" 'reason: "postal-address-missing"'
present "spec: union has postal-address-missing"       "$SPEC" 'resend-not-configured | postal-address-missing | send-failed'

# AC5 — no code file in the diff (only tasks/specs/*.md may appear)
stray="$(git diff --name-only origin/main...HEAD | grep -v '^tasks/specs/' | tr '\n' ' ')"
if [ -z "$stray" ]; then printf '  PASS  diff: no code files touched\n'
else printf '  FAIL  diff: non-spec files present: %s\n' "$stray"; fail=1; fi

exit $fail
```

`grep -c -- "$3"` treats the pattern literally enough for these fixed strings (no regex metacharacters are load-bearing here; `?` and `|` are literal in basic grep).

- [ ] **Step 2: Run it — verify it FAILS**

Run: `bash /tmp/icr109-assert.sh`
Expected: multiple `FAIL` lines, notably:

```
  FAIL  plan: no 'Buenos Aires, Argentina' fallback (banned string present 1x)
  FAIL  plan: no '?? <default>' postal fallback (banned string present 1x)
  FAIL  plan: postal-address-missing return (not found)
  FAIL  spec: no 'falls back' guidance (banned string present 1x)
```

Non-zero exit. **This failing output is the reproduction of the documentation defect** — the banned fallback is present and the fail-closed contract is absent.

- [ ] **Step 3: Fix the RW-4 orchestrator diff (the core bug), `plan.md:1112-1126`**

REPLACE this block:

```ts
  if (!isResendBroadcastConfigured()) {
    console.error(`[broadcast] resend-not-configured for ${broadcastId}`);
    return { status: "failed", reason: "resend-not-configured" };
  }
  // ... after a successful claim:
    const chrome = BROADCAST_CHROME[locale];
    const postalAddress =
      process.env.BROADCAST_POSTAL_ADDRESS ??
      "Iglesia de Cristo Redentor — Buenos Aires, Argentina";
    const wrappedHtml = renderTemplate("broadcast", {
```

WITH:

```ts
  if (!isResendBroadcastConfigured()) {
    console.error(`[broadcast] resend-not-configured for ${broadcastId}`);
    return { status: "failed", reason: "resend-not-configured" };
  }

  // CAN-SPAM requires a real postal address in every broadcast, so this guard
  // FAILS CLOSED and runs BEFORE claimBroadcast. Ordering is load-bearing:
  // validate the address -> claim -> send. Claiming first would burn the
  // broadcastId on a send that can never legally go out (the claim marks it
  // `sending`, so a retry after the address is set would be skipped), and a
  // fallback address would ship a non-compliant email. Do NOT "simplify" this
  // into a `?? "<some address>"` default — that is the exact defect ICR-109
  // removed from this plan.
  const postalAddress = process.env.BROADCAST_POSTAL_ADDRESS?.trim();
  if (!postalAddress) {
    console.error(`[broadcast] postal-address-missing for ${broadcastId}`);
    return { status: "failed", reason: "postal-address-missing" };
  }

  const claim = await claimBroadcast(broadcastId);
  if (claim === "already-sent") return { status: "skipped", reason: "already-sent" };
  if (claim === "error") return { status: "failed", reason: "dedupe-unavailable" };

  // ... only now, after a successful claim, render + send:
    const chrome = BROADCAST_CHROME[locale];
    const wrappedHtml = renderTemplate("broadcast", {
```

(The rest of the block — `lang`/`body`/`logoAlt`/`footer`/`postalAddress`/`unsubscribeLabel`, `createAndSendBroadcast`, `markSent`, the `catch` — is unchanged. `postalAddress` is now the validated const from the guard above.)

- [ ] **Step 4: Fix the RW-4 test-matrix paragraph, `plan.md:1145`**

REPLACE the trailing sentence `Keep the no-secret-leak test (assert \`SECRET_KEY_123\` absent from console output). All other cases identical.`

WITH:

```markdown
Keep the no-secret-leak test (assert `SECRET_KEY_123` absent from console output). **Add a case for the CAN-SPAM guard:** `returns postal-address-missing without claiming or sending when BROADCAST_POSTAL_ADDRESS is unset` — `vi.stubEnv("BROADCAST_POSTAL_ADDRESS", undefined)`, expect `{ status: "failed", reason: "postal-address-missing" }` and assert **both** `claimBroadcast` and `createAndSendBroadcast` were **not** called (that pair of negative assertions is the whole point — it proves fail-closed-before-claim). Set a valid `BROADCAST_POSTAL_ADDRESS` in `beforeEach` so every other case still reaches the send path. All other cases identical.
```

- [ ] **Step 5: Fix the superseded Task-1 reason union, `plan.md:110`**

REPLACE:

```ts
/** Non-secret token: already-sent | invalid-input | dedupe-unavailable | mailchimp-not-configured | send-failed */
```

WITH:

```ts
/** Non-secret token: already-sent | invalid-input | dedupe-unavailable | resend-not-configured | postal-address-missing | send-failed */
```

Then, immediately **after** the closing ``` of that code block, insert:

```markdown
> **Note (ICR-109):** the reason union above is the **final shipped** one (`apps/web/src/service/broadcast/types.ts`). This Task-1 block predates the Resend rewrite — the transport token became `resend-not-configured` in **RW-1**, and `postal-address-missing` was added by the CAN-SPAM guard in **RW-4**. Both are folded in here so no reader of this block ever sees a stale union.
```

- [ ] **Step 6: Mark the superseded Task-5 matrix, at the `### Task 5 (CP5)` header (`plan.md:641`)**

Immediately **after** the `### Task 5 (CP5): \`sendBroadcast\` orchestrator + full suite` heading line, insert:

```markdown
> **⚠️ SUPERSEDED by RW-4 (ICR-109).** This Task-5 block is the original **Mailchimp-era** orchestrator + test suite, kept as historical record. Do **not** implement it as written: it predates the Resend rewrite (`sendCampaign` → `createAndSendBroadcast`, `mailchimp-not-configured` → `resend-not-configured`) **and** it omits the CAN-SPAM `postal-address-missing` guard entirely. The **authoritative** orchestrator diff and the **complete** test-case matrix — including `returns postal-address-missing without claiming or sending` — live in **RW-4** below. The shipped guard order is: validate input → validate Resend config → **validate `BROADCAST_POSTAL_ADDRESS` (fail closed)** → `claimBroadcast` → send.
```

- [ ] **Step 7: Format, then run the assertions — the `plan` lines must now PASS**

```bash
pnpm exec prettier --write tasks/specs/ICR-29-broadcast-email-service.plan.md
bash /tmp/icr109-assert.sh
```

Expected: every `plan:` assertion PASSES. The `spec:` assertions still FAIL (that is Task 2). `diff: no non-spec files` PASSES.

- [ ] **Step 8: Confirm no code file was touched**

Run: `git status --porcelain`
Expected: exactly one modified path — `tasks/specs/ICR-29-broadcast-email-service.plan.md`. If anything under `apps/web/` appears, revert it.

- [ ] **Step 9: Commit**

```bash
git add tasks/specs/ICR-29-broadcast-email-service.plan.md
git commit -m "docs(ICR-109): correct broadcast plan to fail-closed postal-address guard"
```

---

### Task 2: Correct `spec.md` + final acceptance sweep

**Files:**

- Modify: `tasks/specs/ICR-29-broadcast-email-service.md` (4 edit sites: `:44` (new req 9), `:68`, `:98`, `:135`, `:148`)

**Interfaces:**

- Consumes: the canonical union + guard ordering established in Task 1. The wording here must **agree** with `plan.md` — AC-2 is explicitly a cross-file-agreement criterion.
- Produces: the final state of the ticket.

- [ ] **Step 1: Fix Edge Case 9 — the headline contradiction, `spec.md:135`**

REPLACE:

```markdown
9. **`BROADCAST_POSTAL_ADDRESS` unset** → template falls back to a minimal church-name string and the unit still renders; flagged as a human prerequisite before live send (real address required for CAN-SPAM). Does not block the engine/tests.
```

WITH:

```markdown
9. **`BROADCAST_POSTAL_ADDRESS` unset** → the engine **fails closed**: `{ status: "failed", reason: "postal-address-missing" }` returned **before** `claimBroadcast` — **no claim, no template render, no send**. There is **no fallback address**: a real postal address is a CAN-SPAM legal requirement, and validating before the claim means a retry still works once the address is set (a claim would have marked the id `sending` and caused the retry to be skipped). Setting the var is a human prerequisite for any live send, and the guard is asserted by a dedicated unit test (`returns postal-address-missing without claiming or sending`). This **does** block the engine — by design.
```

- [ ] **Step 2: Fix the reason union, `spec.md:68`**

REPLACE:

```ts
  reason?: string; // already-sent | invalid-input | dedupe-unavailable | resend-not-configured | send-failed
```

WITH:

```ts
  reason?: string; // already-sent | invalid-input | dedupe-unavailable | resend-not-configured | postal-address-missing | send-failed
```

- [ ] **Step 3: Add the guard as an explicit numbered requirement, after requirement 8 (`spec.md:44`)**

Requirement 8 currently ends the list (`## 3. Data Model Changes` follows). Immediately after requirement 8, insert requirement 9:

```markdown
9. **CAN-SPAM postal-address guard (fail closed):** if `BROADCAST_POSTAL_ADDRESS` is unset/blank, return `{ status: "failed", reason: "postal-address-missing" }` **before claiming and before sending** (Edge Cases #9). A real postal address is legally required in every broadcast, so there is **no fallback value** — the send does not proceed. Order is load-bearing: validate input → validate Resend config → **validate the postal address** → `claimBroadcast` → send.
```

- [ ] **Step 4: Fix the files-table reason-token note, `spec.md:98`**

REPLACE:

```markdown
| `apps/web/src/service/broadcast/types.ts` | reason-token comment: `resend-not-configured` (was `mailchimp-not-configured`). |
```

WITH:

```markdown
| `apps/web/src/service/broadcast/types.ts` | reason-token comment: `resend-not-configured` (was `mailchimp-not-configured`); **plus `postal-address-missing`** for the fail-closed CAN-SPAM guard. |
```

- [ ] **Step 5: Fix the testing-strategy bullet, `spec.md:148`**

REPLACE:

```markdown
- **`broadcast.service.test.ts`** (mock the units) — success → `sent`+id+`markSent`; dedupe `already-sent` → `skipped`, transport never called; transport throws → `markFailed`+`failed`; invalid input → `failed`/no claim/no send; not-configured → `resend-not-configured`/no claim; **no API key in `console` output**.
```

WITH:

```markdown
- **`broadcast.service.test.ts`** (mock the units) — success → `sent`+id+`markSent`; dedupe `already-sent` → `skipped`, transport never called; transport throws → `markFailed`+`failed`; invalid input → `failed`/no claim/no send; not-configured → `resend-not-configured`/no claim; **`BROADCAST_POSTAL_ADDRESS` unset → `postal-address-missing`, asserting neither `claimBroadcast` nor the transport was called** (the fail-closed CAN-SPAM guard); **no API key in `console` output**.
```

- [ ] **Step 6: Format, then run the full assertion suite — everything must PASS**

```bash
pnpm exec prettier --write tasks/specs/ICR-29-broadcast-email-service.md
bash /tmp/icr109-assert.sh
```

Expected: **every** assertion PASSES, exit 0.

- [ ] **Step 7: Prove AC-4 — the docs now agree with the code and the engineering doc**

```bash
# The shipped guard (source of truth) — read it, do not change it:
sed -n '38,44p' apps/web/src/service/broadcast.service.ts
# The already-correct engineering doc:
sed -n '178,181p' docs/architecture/forms-and-email.md
# The corrected plan + spec:
grep -n 'postal-address-missing' tasks/specs/ICR-29-broadcast-email-service.plan.md tasks/specs/ICR-29-broadcast-email-service.md
```

Expected: all four sources describe the same contract — validate address → fail closed with `postal-address-missing` → only then claim → send.

- [ ] **Step 8: Prove AC-5 — format clean, zero code files in the diff**

```bash
pnpm format:check
git diff --name-only origin/main...HEAD
```

Expected: `format:check` clean. The file list contains **only** `tasks/specs/*.md` paths — **no** `apps/web/**`, no `docs/**`.

- [ ] **Step 9: Commit**

```bash
git add tasks/specs/ICR-29-broadcast-email-service.md
git commit -m "docs(ICR-109): make ICR-29 spec edge case 9 fail-closed on postal address"
```

---

## Acceptance criteria → task map

| AC  | Requirement                                                                          | Covered by                                               |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | `plan.md` fail-closed before `claimBroadcast`; no fallback string anywhere           | Task 1 Steps 3, 7 (assertions 1–3)                       |
| 2   | `spec.md` edge case 9 agrees with plan + code                                        | Task 2 Step 1                                            |
| 3   | `plan.md` lists `postal-address-missing` in the reason union **and** the test matrix | Task 1 Steps 4, 5, 6 (assertions 4–7)                    |
| 4   | Ordering matches `broadcast.service.ts:38-44` + `forms-and-email.md:178-180`         | Task 1 Step 3; Task 2 Steps 1, 3; verified Task 2 Step 7 |
| 5   | `format:check` passes; no code file modified                                         | Task 1 Step 8; Task 2 Steps 6, 8                         |

## Open questions

None. Scope (both eras of `plan.md`) was locked by the human before planning.
