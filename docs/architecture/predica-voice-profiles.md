# Predica voice profiles — per-preacher style learning loop

How `/predica` learns each preacher's communication style and feeds it back into the writer so sermon posts
sound like the person who preached them — and get **better every sermon**.

> **TL;DR.** A new subagent, `predica-voice-coach`, runs between Gate 1 (corrected transcript) and the
> writer. It studies how the preacher actually speaks — **from the corrected transcript only** — and
> maintains a local, human-curatable per-preacher voice profile. The writer reads that profile and
> articulates the voice. The profile accumulates across sermons, so the writing compounds in quality.

## Why this exists

The `predica-writer` has always had editorial rule #1, _"Preserve the preacher's voice."_ But before this,
it could only infer that voice from the **single transcript in front of it** — every post started from a
blank slate. There was no memory across sermons.

A real speech coach who has heard someone preach a dozen times knows their cadence, their go-to metaphors,
how they open and land, the phrases they always reach for. That accumulated, curated understanding is
exactly what was missing. The voice profile is that memory, made explicit and editable.

## The one rule that makes it work (and not collapse)

**The coach learns ONLY from the human-corrected `transcript.txt`** — the preacher's authentic spoken words.
It must **never** learn style from the generated `sermon.json` or any model-produced prose.

If the loop learned from our own output, it would reinforce _our_ style and slowly drift away from the
preacher — a feedback loop / style collapse dressed up as "learning." The transcript is the gold source; the
post is not. This is non-negotiable and is enforced in the agent's hard rules.

## The second rule: an interpreted sermon teaches NOBODY's voice

When a preacher speaks one language and an **interpreter renders it live** into another, Whisper locks onto
whoever is louder — and that is the interpreter. `transcript.txt` is then the **interpreter's** speech.

Such a transcript is a valid source for **nobody's** voice profile:

- **Not the preacher's** — the words are not theirs. Learning from it would write the interpreter's rhetoric
  into the preacher's profile, and Zone B is **append-only**, so every later sermon by that preacher would be
  written in a voice learned from the wrong person. Silent, and it compounds.
- **Not the interpreter's** — they are rendering someone else's content, not preaching their own.

So `/predica` **refuses to learn** from an interpreted run. The refusal is **code, not prose**:
`apps/web/src/utils/predica/voiceProfile.ts` (`canLearnVoiceFrom`) refuses whenever the run is interpreted —
**for any name passed to it** — and the orchestrator executes its `.mjs` twin
(`.claude/scripts/predica/check-voice-learn.mjs`) at step 2.5 before dispatching the coach. The two impls are
bound by a parity test. `predica-voice-coach`'s own refusal is only a backstop; a pure-prose agent cannot
enforce a guarantee.

The guard blocks **writes**, not **reads**: if the preacher already has a profile learned from sermons they
preached _themselves_, the writer may still read it — that profile **is** their authentic voice.

### Why it is HUMAN-DECLARED, and why you must not build a detector

Interpretation is declared by the human: `/predica --interpreted --interpreter "<Full Name>"`. It is **not**
inferred from the audio, and **must not be**.

A whisper language-ID sweep over a known interpreted sermon (2026-07-12, 21:32, English preacher + live
Spanish interpreter), in 30-second windows across the **entire** recording, reported **Spanish at p ≈ 0.999 in
43 of 43 windows** and missed the preacher's English **entirely** — because the interpreter dominates the mic.
Exactly one English fragment ever surfaced in the transcript. A detector built on this signal would report
"not interpreted" with total confidence on the very case it exists to catch, and the guard would be worse than
useless: it would be _trusted_.

A forgotten `--interpreted` on a **regenerate** cannot re-open the hole either — `resolveInterpreted()` ORs the
flag with the `interpreted` field persisted in `sermon.json`. And if the guard script is missing or crashes,
the pipeline **fails closed** and skips the coach: a skipped append is redone next run, a wrong append is
forever.

## Where profiles live (and why local-only)

```
tasks/predicas/_voices/<preacher-slug>.md      # one file per preacher
```

- **Local-only, gitignored.** The whole `tasks/predicas/` tree is gitignored (`.gitignore`), and this repo
  is **public**. A speech-coach dossier on a named, real pastor — their rhetorical tics, emotional register,
  signature phrases — should not be published to the public internet (forks, mirrors, indexing, hard to
  retract). It belongs in the same private tier as every other sermon-derived artifact (transcripts, audio,
  `sermon.json`), all of which are already kept out of git.
- **Version history without git.** Zone B (below) is an append-only, dated log — so you get a visible
  evolution trail _inside the file_, which recovers most of the benefit of git history for a private file.
- **`<preacher-slug>`** is derived from the preacher's full name with the same transliterate → lowercase →
  dash-collapse rule the writer uses for the title slug (`Jonathan Hanegan` → `jonathan-hanegan`).

## The two-zone file

Each profile has two clearly separated zones, so automation never clobbers your curation:

### Zone A — Canonical voice guide (human-owned)

The authoritative "how to write as this preacher" guidance. The coach **seeds it once**, on first creation,
from the first sermon — and **never auto-overwrites it again**. From then on, the only thing the coach may
add to Zone A is bullets under a fenced **🤖 Refinamientos sugeridos (revisar y promover)** list. You read
those suggestions and, when you agree, promote them by hand into the canonical sections. Zone A is yours.

### Zone B — Observation log (machine, append-only)

One concise, dated entry per sermon (`### YYYY-MM-DD · <slug>`) with the coach's structured findings for that
sermon, backed by brief transcript quotes. The coach only ever **appends** here; it never rewrites or
reorders past entries. This is the raw evidence and the audit trail.

The writer reads **both** zones, weighting Zone A above Zone B.

### Skeleton (illustrative — fictional preacher)

```markdown
# Perfil de voz — Ana Ejemplo

<!-- meta: preacherSlug=ana-ejemplo | preacher=Ana Ejemplo | createdFrom=2026-01-04 · la-mesa-del-padre | sermonsAnalyzed=2 | updated=2026-01-11 -->

## Zona A — Guía de voz canónica (curada por humanos)

### Vocabulario y dicción

- Registro cálido y coloquial rioplatense; usa "che" y "miren" para acercarse.

### Recursos retóricos

- Abre casi siempre con una pregunta; repite la frase clave tres veces al cerrar.

### Frases distintivas (textuales)

- «Dios no llega tarde, llega a tiempo.»

### Cómo se traslada al inglés (en-US)

- Mantener la calidez directa; "che/miren" → "look", "friends" (no traducir literal).

### 🤖 Refinamientos sugeridos (revisar y promover)

<!-- coach:suggestions -->

- Vuelve seguido a la imagen de "la mesa" como metáfora de comunión — ¿promover a Temas recurrentes?

---

## Zona B — Registro de observaciones (automático, solo se agrega)

### 2026-01-04 · la-mesa-del-padre

- **Retórica:** preguntas retóricas encadenadas; **Evidencia:** «¿Y si el Padre ya puso tu lugar?»

### 2026-01-11 · el-pan-que-no-se-acaba

- **Cadencia:** frases cortas al exhortar, largas al narrar.

<!-- coach:zona-b-end -->
```

The two HTML-comment anchors — `<!-- coach:suggestions -->` and `<!-- coach:zona-b-end -->` — are the stable
insertion points the coach relies on. Keep them in the file if you edit it by hand.

## How it runs in the pipeline

`/predica` step **2.5**, between Gate 1 and the writer (`.claude/commands/predica.md`):

```
transcribe → ★ Gate 1 (human corrects transcript) ★ → [2.5 voice-coach] → writer → … → ★ Gate 2 ★
```

- **Capture-before-write.** Running before the writer means each sermon's own authentic voice is folded in
  _before_ that sermon is written — so even a preacher's very first sermon benefits from its own analysis.
- **Idempotent.** Keyed by `sermonDate`. A transcript-reuse re-run (same recording) self-skips — no double
  entry.
- **Non-blocking.** If the coach fails or the transcript is too thin, the orchestrator prints a warning and
  continues; the writer falls back to today's transcript-only behavior. The feature is purely additive and
  can never break publishing.
- **Dry-run safe.** It runs under `--dry-run` too (local-only, no Contentful, no send).

## Curation workflow (your part)

1. After a run, the orchestrator tells you the profile path, the action (`created` / `appended` /
   `unchanged`), and how many sermons have been analyzed.
2. Open `tasks/predicas/_voices/<preacher-slug>.md` whenever you like.
3. Read the latest **Zone B** entry and the **🤖 Refinamientos sugeridos** list.
4. Promote what's right into the **Zone A** canonical sections; delete suggestions you disagree with; prune
   or tighten Zone B if it ever gets noisy. Zone A is the authoritative guide the writer trusts most — the
   more you curate it, the more the writing sounds like the preacher.

## Guardrails

- **Style, not doctrine.** The profile governs _how_ things are said — vocabulary, rhetoric, cadence, tone,
  structure, signature phrases. It never licenses adding claims, theology, or content the preacher did not
  say. The transcript stays the source of truth for content; the writer's no-fabrication rules still win.
- **Privacy.** Profiles are never committed. After any run, `git status` should show nothing new tracked
  under `_voices/`.
- **Interpreted sermons are never learned from** — not for the preacher, not for the interpreter. Enforced in
  code (`canLearnVoiceFrom`), executed by the orchestrator at step 2.5, and backstopped in the agent's prose.
  Human-declared (`--interpreted`); never detected from audio.

## Files involved

| File                                                                      | Role                                                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.claude/agents/predica-voice-coach.md`                                   | The coach agent (step 2.5).                                                                               |
| `.claude/commands/predica.md`                                             | Pre-flight derives `preacherSlug` + `voiceProfilePath`; §2.5 dispatch; writer dispatch forwards the path. |
| `.claude/agents/predica-writer.md`                                        | Reads `voiceProfilePath` (optional input + editorial rule #1).                                            |
| `.claude/config.json` → `predica.{agents.voiceCoach, voices, voiceCoach}` | Agent name, profiles dir, step config.                                                                    |
| `tasks/predicas/_voices/<preacher-slug>.md`                               | The per-preacher profile (local-only, gitignored).                                                        |
| `apps/web/src/utils/predica/voiceProfile.ts`                              | The voice-learn guard (canonical, typed, unit-tested).                                                    |
| `.claude/scripts/predica/check-voice-learn.mjs`                           | The twin the orchestrator executes at step 2.5 (exit 0 = learn, 3 = refuse).                              |
