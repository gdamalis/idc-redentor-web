# ICR-137 — Privacy Policy Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs/product/privacy-policy.md` — the canonical bilingual privacy copy that truthfully
describes what the site does — so a human can paste it into Contentful and stop the live policy lying.

**Architecture:** Documentation-only. Two files under `docs/product/`. No source file under the `apps/web`
tree is touched — if you find yourself editing app code, stop: the plan is wrong. The full legal copy is
already locked and approved in the spec's **Appendix A (es-AR)** and **Appendix B (en-US)**; your job is to
transcribe it faithfully into the doc, not to rewrite it.

**Tech Stack:** Markdown. Prettier (via husky/lint-staged on commit). No runtime surface.

## Global Constraints

Copied verbatim from the approved spec — these bind **every** task below.

- **Spec is the source of copy.** `tasks/specs/ICR-137-fix-published-privacy-policy.md` Appendix A/B is the
  approved legal text. **Transcribe it exactly.** Do not "improve" the wording, soften §5/§6, or add
  sections. This copy was human-approved at a design gate; changing it silently re-opens that gate.
- **Accents are correctness, not style.** `Política`, `Español`, `Perón`, `información`, `electrónico`,
  `Escríbanos`, `analítica` — transcribe every diacritic exactly. (Prior lesson ICR-49: implementers
  mis-transcribe accented Spanish; that is a defect, not a nit.)
- **The only email anywhere is `info@idcredentor.org`.** `idcredentor@gmail.com` must appear **nowhere**.
- **No `[...]` placeholder tokens** in the copy, in either locale.
- **Effective date:** `14 de julio de 2026` (es-AR) / `July 14, 2026` (en-US). Editor-controlled — never
  derived from `sys.publishedAt`.
- **Named processors — in EACH locale, independently:** Resend, MongoDB Atlas, Vercel, Google, Sentry,
  Contentful. **SendGrid and Mailchimp must NOT be named _in the published policy copy_** — SendGrid has no
  API key in any environment (dead config); Mailchimp is dead code. Naming either there would disclose a
  data flow that does not occur. They **must** be named in the doc's rationale/maintenance sections, which
  are not part of the published copy — see the Scoping note under Task 1 Step 1c.
- **No compliance claims** — no Ley 25.326, no AAIP, no GDPR citations.
- **Rich-text ceiling:** the copy may only use structures the Contentful renderer styles
  (`apps/web/lib/contentful/rich-text-options.tsx:27-69`): `HEADING_2`, `PARAGRAPH`, `UL_LIST`,
  `LIST_ITEM`, `BOLD`, `ITALIC`. **No hyperlinks** (the renderer does not style them — emails stay plain
  text). **No `HEADING_1`** inside the body (the page's h1 renders the Contentful `name` field).
- **Commit type is `fix`** (Jira issue type = Bug). Header ≤ 100 chars, Conventional Commits.
  ⚠️ Release impact, stated only with the rules in hand (`.releaserc.json`): `feat`→minor ·
  `fix`/`perf`/`docs`→**patch** · `chore`→**false** · `refactor`/`test`/`ci` unlisted→no release. So
  `fix(ICR-137)` **will** cut a patch release on merge. That is correct and intended — do not pick a
  different type to dodge it.
- **Do NOT run repo-wide `pnpm format`.** `format:check` is pre-existing-dirty (~163 files). Only ever
  check the two files you touch (lesson ICR-109).

---

### Task 1: Author the canonical privacy-policy doc

**Files:**

- Create: `docs/product/privacy-policy.md`
- Modify: `docs/product/README.md` (reading order list, and the `Last reviewed` footer date)
- Test: none — see "Why there is no unit test" below.

**Interfaces:**

- Consumes: the approved copy from `tasks/specs/ICR-137-fix-published-privacy-policy.md` Appendix A + B.
- Produces: `docs/product/privacy-policy.md` — the file the human publisher copy-pastes from, and the file
  the follow-up Contentful-publish ticket references.

**Why there is no unit test:** the deliverable is prose with no runtime surface. A Vitest test that
grepped our own markdown would assert the file says what we just wrote it to say — a tautology and a green
rubber stamp (lesson ICR-148). The honest gate is the content-assertion script in Step 3, which encodes
the ticket's acceptance criteria as binary checks and is **run and watched fail first** (Step 2).

- [ ] **Step 1: Write the doc**

Create `docs/product/privacy-policy.md`. Follow `docs/product/README.md` house style: H1 title, a bolded
lede blockquote, then content, then a `**Last reviewed:** YYYY-MM-DD` footer.

Structure the file exactly as:

```markdown
# Privacy Policy — canonical copy

> **This file is the source of truth for the privacy policy published at `/es-AR/privacidad` and
> `/en-US/privacy`.** The live page is a Contentful entry (`churchInfoTopic`, id `2nFd6sF9w0BbrhWrYklPVD`),
> which only a **human** can edit — so this doc is where the policy gets reviewed, diffed, and versioned.
> When the policy changes, change it _here_ first, then publish (see § Publishing runbook).
> The copy below is deliberately, verifiably true about what the site does — see § Why this copy says what
> it says.

## Publishing runbook (human-only)

[...steps 1-6, see Step 1b below...]

## Why this copy says what it says

[...the factual basis table, see Step 1c below...]

## Maintenance triggers

[...see Step 1d below...]

---

# es-AR

[VERBATIM Appendix A of the spec: the h1 note, the effective-date line, intro, and §1–§10]

---

# en-US

[VERBATIM Appendix B of the spec: the h1 note, the effective-date line, intro, and §1–§10]

---

**Last reviewed:** 2026-07-14
```

**Step 1b — the Publishing runbook section.** Write it as a numbered, human-executable list. It must say:

1. Open Contentful → space `vg9le24yw8hb` → environment **`production`** → entry `2nFd6sF9w0BbrhWrYklPVD`.
2. **es-AR `name`:** change `Politica de Privacidad` → `Política de Privacidad` (add the accent).
3. **es-AR `body`:** replace the whole field with the **es-AR** copy below. Delete the old opening
   `Política de Privacidad (Español)` heading — the page already renders the title from `name`.
4. **en-US `body`:** replace the whole field with the **en-US** copy below. Delete its duplicate
   `Privacy Policy` heading too.
5. **Set the effective date** in both locales to the date you actually publish, if it is not
   `14 de julio de 2026` / `July 14, 2026`.
6. **Publish** — verify `fieldStatus` shows _both_ locales published, then load `/es-AR/privacidad` and
   `/en-US/privacy` and confirm the section headings render as **headings** (not literal `##`), and that
   the footer links still resolve.

Add a warning line: _paste as rich text — Contentful converts `##` to H2 and `**` to bold on paste; do not
leave literal markdown characters in the field._

**Step 1c — the "Why this copy says what it says" section.** A compact table of the factual basis, each row
citing the source file, lifted from spec §2. Cover: what each form collects and where it is stored; that
newsletter emails live at **Resend, not in our DB**; the six named processors; the `_visitor_id` cookie
(httpOnly, 1 year); what Decline actually does (stops GA **cookies**; does NOT stop GTM cookieless pings,
Vercel Analytics/Speed Insights, or Sentry); and that **nothing is ever auto-deleted** (no TTL, no purge
path). Name **SendGrid** and **Mailchimp** explicitly here and say why each is excluded from the policy
(SendGrid: `SENDGRID_API_KEY` set in no Vercel environment → dead config, cannot send. Mailchimp: legacy,
no code path reads it, pending removal in ICR-110).

> **Scoping note (this is a real trap — lesson ICR-144).** The "must be absent" assertions in Step 2 apply
> to the **published legal copy only** (the `# es-AR` → EOF span), **not** the whole file. The rationale and
> maintenance sections above the copy _must_ be free to name SendGrid/Mailchimp and to quote the old
> `(Español)` heading — that is exactly the context a future maintainer needs. A whole-file grep would force
> those sections into euphemism ("the adapter with no live API key"), which is strictly worse for the reader
> and would be a guaranteed false failure against correct prose.

**Step 1d — the "Maintenance triggers" section.** A short list: _this copy becomes wrong if_ — the mail
provider changes away from Resend; a TTL/purge path is added to `website.contact`/`website.likes`; Vercel
Analytics/Sentry get consent-gated; a new third-party script is added; Sentry's `sendDefaultPii` is
flipped on.

Then transcribe **Appendix A** and **Appendix B** verbatim under the `# es-AR` / `# en-US` headers.

- [ ] **Step 2: Write the content-assertion script and WATCH IT FAIL**

The doc does not exist yet, so this must fail. Running it _first_ is what makes it a real gate rather than
a rubber stamp.

```bash
cat > /tmp/icr137-check.sh <<'SH'
#!/usr/bin/env bash
# ICR-137 acceptance criteria as binary checks.
# SCOPING (lesson ICR-144): "must be absent" checks apply to the PUBLISHED LEGAL COPY only —
# the rationale sections legitimately name SendGrid/Mailchimp to explain why they're excluded.
# PER-LOCALE (mutation-proven): each processor is asserted present in the es-AR span AND the
# en-US span SEPARATELY. A total-count>=2 heuristic passes vacuously when one locale is dropped.
DOC="${1:-docs/product/privacy-policy.md}"
fail=0
pass() { echo "  ✓ $1"; }
bad()  { echo "  ✗ $1"; fail=1; }

[ -f "$DOC" ] || { echo "BLOCKED: $DOC does not exist"; exit 1; }
[ -s "$DOC" ] || { echo "BLOCKED: $DOC is empty"; exit 1; }

ES=$(awk '/^# es-AR$/,/^# en-US$/' "$DOC")
EN=$(awk '/^# en-US$/,0'          "$DOC")
COPY=$(awk '/^# es-AR$/,0'        "$DOC")

# Positive controls: without these, every negative below could pass on an empty string.
[ -n "$ES" ] && echo "$ES" | grep -q 'Fecha de vigencia' \
  || { echo "BLOCKED: es-AR span not extracted (marker missing) — check is broken"; exit 1; }
[ -n "$EN" ] && echo "$EN" | grep -q 'Effective date' \
  || { echo "BLOCKED: en-US span not extracted (marker missing) — check is broken"; exit 1; }
echo "spans: es-AR $(echo "$ES" | wc -l | tr -d ' ') lines / en-US $(echo "$EN" | wc -l | tr -d ' ') lines ✓"

echo "== negative — PUBLISHED COPY must not contain =="
echo "$COPY" | grep -qE '\[(Fecha|Date|email de contacto|contact email)\]' && bad "placeholder token" || pass "no [...] placeholders"
echo "$COPY" | grep -qi 'sendgrid'  && bad "SendGrid named in the policy"  || pass "SendGrid not named in the policy"
echo "$COPY" | grep -qi 'mailchimp' && bad "Mailchimp named in the policy" || pass "Mailchimp not named in the policy"
echo "$COPY" | grep -q  '(Español)' && bad "(Español) tag in the policy"   || pass "no (Español) tag in the policy"
echo "$COPY" | grep -qiE 'Ley 25\.?326|AAIP|GDPR' && bad "compliance claim" || pass "no compliance claims"
echo "$COPY" | grep -qi 'No compartimos su información personal con terceros' && bad "false sharing claim (es)" || pass "false sharing claim (es) gone"
echo "$COPY" | grep -qi 'We do not share your personal information with third parties'  && bad "false sharing claim (en)" || pass "false sharing claim (en) gone"
grep -q 'idcredentor@gmail.com' "$DOC" && bad "old gmail address present ANYWHERE" || pass "no idcredentor@gmail.com anywhere in the file"

echo "== positive — EACH LOCALE independently =="
check_both() { # $1=needle-es $2=needle-en $3=label
  echo "$ES" | grep -qi "$1" || bad "$3 missing from es-AR"
  echo "$EN" | grep -qi "$2" || bad "$3 missing from en-US"
  { echo "$ES" | grep -qi "$1" && echo "$EN" | grep -qi "$2"; } && pass "$3 in BOTH locales"
}
check_both 'info@idcredentor.org' 'info@idcredentor.org' "canonical email"
check_both '_visitor_id'          '_visitor_id'          "_visitor_id cookie"
check_both '14 de julio de 2026'  'July 14, 2026'        "effective date"
for p in Resend "MongoDB Atlas" Vercel Google Sentry Contentful; do check_both "$p" "$p" "processor: $p"; done
echo "$ES" | grep -q 'Política de Privacidad' && pass "Política (accent) in es-AR h1 note" || bad "accented título missing"

[ $fail -eq 0 ] && echo "ALL CHECKS PASS" || echo "FAILURES PRESENT"
exit $fail
SH
chmod +x /tmp/icr137-check.sh
/tmp/icr137-check.sh
```

Expected on first run (before the doc exists): `BLOCKED: docs/product/privacy-policy.md does not exist`,
exit 1.

**STOP CONDITION:** if this somehow _passes_ before you have written the doc, the script is broken — a
grep that errors prints nothing and reads exactly like a clean negative (lesson ICR-103). Fix the script,
do not proceed.

- [ ] **Step 3: Run the checks against the written doc — expect ALL CHECKS PASS**

Run: `/tmp/icr137-check.sh` from the worktree root.
Expected: every line `✓`, final line `ALL CHECKS PASS`, exit 0.

The `>=2` processor counts are the both-locales gate: each processor must be named in the es-AR **and** the
en-US copy. If one shows exactly 1, you transcribed only one locale — fix it.

- [ ] **Step 4: Update the `docs/product/README.md` reading order**

Add the policy as item 6 in the numbered "Reading order" list, in the same voice as its neighbours:

```markdown
6. **[privacy-policy.md](./privacy-policy.md)** — the canonical bilingual copy of the privacy policy published at `/es-AR/privacidad` and `/en-US/privacy`, the factual basis for every claim it makes, and the human-only runbook for publishing it to Contentful. _Change the policy here first._
```

Bump the file's footer to `**Last reviewed:** 2026-07-14`.

- [ ] **Step 5: Verify formatting on the touched files ONLY**

Run: `pnpm exec prettier --check docs/product/privacy-policy.md docs/product/README.md`
Expected: `All matched files use Prettier code style!`

If it reports issues: `pnpm exec prettier --write docs/product/privacy-policy.md docs/product/README.md`
and re-check. **Do not run repo-wide `pnpm format`** — `format:check` is dirty on ~163 pre-existing files
and "fixing" them would bury this diff.

- [ ] **Step 6: Commit**

```bash
git add docs/product/privacy-policy.md docs/product/README.md
git commit -m "fix(ICR-137): rewrite the privacy policy to describe real data handling"
```

Note: husky `lint-staged` runs Prettier on commit. If it reformats the files, that is expected — re-check
`git status` is clean afterwards and the content assertions still pass.

---

### Task 2: Full verification

**Files:** none (verification only).

**Interfaces:**

- Consumes: the committed doc from Task 1.
- Produces: evidence that a docs-only change broke nothing — required before the PR is marked ready.

- [ ] **Step 1: Run the full stack**

Run, from the worktree root:

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green. **Record the test count.**

- [ ] **Step 2: Prove the test count did not move**

The change touches no code, so the suite must be **identical** to base. A moved count means something was
touched that should not have been.

Run: `git diff --name-only origin/main...HEAD`
Expected: **only** `docs/product/privacy-policy.md`, `docs/product/README.md`, and the two
`tasks/specs/ICR-137-*` files. **Zero** `apps/web/**` paths.

(Use the three-dot form — a two-dot diff against a `main` that has advanced attributes other people's
commits to you, lesson ICR-111.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: green.

If it fails with `ERR_INVALID_URL` / `input: 'undefined'`, that is the known environmental failure, not a
code defect: the worktree needs `apps/web/.env.local` (already copied in by the orchestrator — confirm with
`ls apps/web/.env.local`). Do **not** "fix" code for this.

- [ ] **Step 4: Re-run the content assertions on the committed state**

Run: `/tmp/icr137-check.sh`
Expected: `ALL CHECKS PASS`.

- [ ] **Step 5: No commit**

Task 2 is verification only. Nothing to commit.

---

## Self-Review

**Spec coverage:** R1 → Task 1 Step 1. R2/R3 → Step 2/3 negative checks. R4 → effective-date positive
checks + runbook Step 5. R5 → the runbook explicitly deletes the duplicate heading; `(Español)` negative
check. R6 → runbook step 2 (`name` accent) — human-only, correctly not a code change. R7 → processor
positive checks + the false-claim negative checks. R8 → `_visitor_id` check + the §4/§5/§6 copy. R9 →
enforced by the Global Constraints rich-text ceiling and the no-hyperlink rule. R10 → compliance-claim
negative check. Spec §12 (the deferred Contentful-publish Jira ticket) is **the orchestrator's job**, not
an implementer task — it is not in this plan by design.

**Placeholder scan:** none — every step carries its literal command or its literal content, and the copy
itself is fully written in the spec.

**Type consistency:** n/a (no code). File paths are consistent across both tasks.
