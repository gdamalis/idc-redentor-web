# ICR-108 — Lock the `/api/subscribe` error-response contract with regression tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Jira:** [ICR-108](https://divinelab.atlassian.net/browse/ICR-108) · Task · Priority Low ·
labels `api-contract`, `tech-debt` · QA depth **light** · commit type **`test`**

**Goal:** Add regression cover so the `/api/subscribe` 400 error-response body
(`{ messageKey: "SubscribeBanner.error-unexpected" }`) cannot regress silently.

**Architecture:** Test-only. `apps/web/src/app/api/subscribe/route.ts` is **already correct** on `main`
(ICR-44 / PR #72 replaced the old `!email` guard with a Zod `bodySchema.safeParse`). This plan changes
exactly one file — `route.test.ts` — adding two missing rejected-input cases (empty body, malformed
JSON) and strengthening the existing invalid-email case to assert the **response body**, not just the
status code.

**Tech Stack:** Vitest 4 (jsdom), Next.js 16 route handler, Zod, `vi.hoisted()` + `vi.mock`.

## Global Constraints

- **No production code change.** `route.ts` MUST be byte-identical at the end of this plan. The final
  diff must touch **only** `apps/web/src/app/api/subscribe/route.test.ts`. (AC5)
- **No new locale keys.** `SubscribeBanner.error-unexpected` already exists in both locale files.
- **Assert the literal wire value**, hardcoded — do NOT import `SUBSCRIBE_BANNER_KEYS`. Rationale: this
  is a golden wire-contract test, `route.ts` itself hardcodes the literal, and the file's existing 409
  test already hardcodes `"SubscribeBanner.error-already-subscribed"`. Follow the file's convention.
- **`addSubscriber` must be asserted un-called on every rejected-input path.** (AC4)
- Verification stack (light depth): `pnpm type-check && pnpm lint && pnpm test`. (AC6)

## Context an implementer needs

`route.ts` (read-only, for reference — **do not edit**):

```ts
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { messageKey: "SubscribeBanner.error-unexpected" },
      { status: 400 },
    );
  }
  // ...200 / 409 / 400 invalid-input / 500 branches
}
```

An absent body, `body: ""`, and `body: "{not json"` all make `request.json()` throw `SyntaxError` →
`.catch(() => null)` → `bodySchema.safeParse(null)` fails → the 400 / `error-unexpected` branch.
(Verified empirically by the explorer against the Node `Request` the vitest runtime uses.)

The existing `req()` helper always `JSON.stringify`s its argument, so it **cannot** express an empty or
malformed body. A second helper is needed. The sibling pattern lives in
`apps/web/src/app/api/predica/regenerate-pdf/route.test.ts:78-79` and `revalidate/route.test.ts:12-17`.

## File Structure

| File                                           | Change                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/api/subscribe/route.test.ts` | **Modify** — add `rawReq()` helper; add 2 tests; strengthen 1 test                                                               |
| `apps/web/src/app/api/subscribe/route.ts`      | **Read-only.** Touched ONLY transiently in Step 3 (mutation check) and reverted in Step 5. Must be unmodified in the final diff. |

---

### Task 1: Lock the 400 error-body contract

**Files:**

- Modify: `apps/web/src/app/api/subscribe/route.test.ts`
- Read-only: `apps/web/src/app/api/subscribe/route.ts`

**Interfaces:**

- Consumes: `POST` from `./route`; the hoisted `addSubscriber` mock already in the file.
- Produces: nothing consumed downstream (terminal task).

**Note on TDD ordering.** The production code is already correct, so these tests go **GREEN on the
first run**. A test that has never been observed to fail is worthless as regression cover. Step 3
therefore _deliberately breaks_ `route.ts` to prove all three tests catch the exact regression they
exist to prevent, and Step 5 reverts it. Do not skip Step 3 — it is the only thing that proves this
ticket delivered value.

- [ ] **Step 1: Add the `rawReq` helper and the two new tests; strengthen the invalid-email test**

Add the helper directly below the existing `req()` helper (do not modify `req()` — the 200/409 tests
still use it):

```ts
const rawReq = (body?: BodyInit) =>
  new Request("http://x/api/subscribe", {
    method: "POST",
    body,
  });
```

Replace the existing `400 on invalid email (zod) without calling the service` test with this
body-asserting version, and add the two new cases after it:

```ts
it("400 on invalid email (zod) without calling the service", async () => {
  const res = await POST(req({ email: "nope" }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    messageKey: "SubscribeBanner.error-unexpected",
  });
  expect(addSubscriber).not.toHaveBeenCalled();
});
it("400 on an empty body without calling the service", async () => {
  const res = await POST(rawReq());
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    messageKey: "SubscribeBanner.error-unexpected",
  });
  expect(addSubscriber).not.toHaveBeenCalled();
});
it("400 on malformed JSON without calling the service", async () => {
  const res = await POST(rawReq("{not json"));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    messageKey: "SubscribeBanner.error-unexpected",
  });
  expect(addSubscriber).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the suite — expect GREEN (6 tests in this file)**

Run: `pnpm --filter @idcr/web test -- src/app/api/subscribe/route.test.ts`

Expected: **6 passed, 0 failed** — 200, locale-default, 409, invalid-email, empty-body, malformed-JSON.
(4 pre-existing + 2 new; the invalid-email test is strengthened in place, not added.) Green here only
proves the tests agree with today's code — it does NOT yet prove they can fail. That is Step 3.

- [ ] **Step 3: Mutation check — prove the tests catch the regression**

Temporarily edit `apps/web/src/app/api/subscribe/route.ts` line 15, reverting the 400 body to the
**old, wrong** shape this ticket exists to prevent:

```ts
return NextResponse.json({ error: "Email is required" }, { status: 400 });
```

Run: `pnpm --filter @idcr/web test -- src/app/api/subscribe/route.test.ts`

Expected: **3 failed, 3 passed.** The three failures MUST be exactly `400 on invalid email (zod)…`,
`400 on an empty body…`, and `400 on malformed JSON…`, each failing on the `toEqual` body assertion
(status `400` still matches — that is precisely the blind spot the old test had). If fewer than 3 fail,
the new tests are not actually locking the contract — stop and fix them before proceeding.

- [ ] **Step 4: Record the mutation-check output**

Copy the failing-test output into the PR body later. This is the evidence that the regression cover is
real.

- [ ] **Step 5: Revert `route.ts` — MANDATORY**

```bash
git checkout -- apps/web/src/app/api/subscribe/route.ts
git status --short   # must show ONLY: M apps/web/src/app/api/subscribe/route.test.ts
git diff --stat      # must list exactly one file
```

Expected: `route.ts` no longer appears in `git status`. If it does, the mutation was not fully
reverted — AC5 fails. Do not commit until this is clean.

- [ ] **Step 6: Full verification stack (light depth)**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: type-check clean, lint clean, **460 tests passed** across 45 files (458 baseline + 2 added
cases; the invalid-email test is strengthened in place, not added). Confirm the subscribe route file
reports **6** tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/subscribe/route.test.ts
git commit -m "test(ICR-108): lock the /api/subscribe 400 error-body contract"
```

Commit type is `test` (not `chore`): the change is test-only, and `test` does not trigger a
semantic-release version bump — correct for a change with no runtime surface.

---

## Edge cases covered

1. **Empty body** (`new Request(url, {method:"POST"})`, no `body`) → `.json()` throws → 400 +
   `error-unexpected`.
2. **Malformed JSON** (`"{not json"`) → `.json()` throws → 400 + `error-unexpected`.
3. **Invalid email** (`{email:"nope"}`, valid JSON) → `safeParse` fails on the `z.string().email()`
   rule → 400 + `error-unexpected`. Distinct from 1 and 2: the JSON parses, Zod rejects it.
4. In all three, `addSubscriber` must never be invoked — no PII reaches the mail provider on a rejected
   input.

## Known gaps NOT in scope (stray observations)

- `route.ts`'s `invalid-input` outcome branch (400) and the 500 fallback branch are exercised by no
  test at all. Both return the same `error-unexpected` body but are reached via an `addSubscriber`
  _outcome_, not a rejected input — a different contract. Log as a stray observation for a future
  ticket; do NOT scope in here.
- `route.ts` hardcodes the `messageKey` literal rather than importing `SUBSCRIBE_BANNER_KEYS`
  (`subscribeBannerMessageKeys.ts`), so nothing statically links the route's wire value to the client's
  key map. Not a defect today (the client falls back to `ERROR_UNEXPECTED` on an unknown key). Stray
  observation.

## Self-review

- **AC coverage:** AC1 → Step 1 (empty-body test) · AC2 → Step 1 (malformed-JSON test) · AC3 → Step 1
  (strengthened invalid-email test) · AC4 → `not.toHaveBeenCalled()` in all three · AC5 → Step 5 revert
  - `git status` gate · AC6 → Step 6.
- **No placeholders:** every step carries real code or a real command with expected output.
- **Naming consistency:** `rawReq` used identically in Steps 1 and 3; `req` untouched.
