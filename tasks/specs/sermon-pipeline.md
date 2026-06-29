# Sermon Pipeline — Design Spec (V1)

> **v2 update (ICR-83, 2026-06-25):** `agent-sandbox` is retired. `/predica` now creates the sermon as a **DRAFT in `production`**; a human reviews both locales and **Publishes** (Gate 2). The "merge agent-sandbox → master" step below is historical. See `docs/contentful-environments.md`.

> **PDF-mirrors-post update (2026-06-29):** The PDF is no longer a separately-authored summary. The localized **`content[]` is the single body** — the writer produces it as a **medium (~800–1200 word) summary in the preacher's voice**, and the PDF renders that same body (cover → `content[]` → scripture references → footer). The old PDF-only fields (`lead`, `keyQuotes`, `scriptureHeadline`, `scriptureRefs`, `closing`) are **removed**; `thesis`/`mainPoints`/SEO are now metadata, not PDF drivers. Where this spec below says those fields "drive the PDF," read it as historical. See **`docs/predica-pdf-mirrors-post.md`** (authoritative) and the webhook regeneration spec **`tasks/specs/predica-pdf-regen-webhook.md`**.

> **Status:** Draft for review · 2026-06-23
> **Author:** Claude (brainstorming → spec)
> **Feature:** Record a Sunday sermon → transcribe → generate a bilingual Contentful **draft** post (audio player + downloadable PDF summary, both languages) → produce a WhatsApp share message. Runs locally in the Claude Code harness (V1). Cloud automation is a documented V2 (appendix).
>
> **Verification:** This spec was adversarially reviewed against the live Contentful space + codebase by three critics, and corrected. Resolved facts and corrections are noted inline; see the **Verification log** at the end.

---

## 0. Locked decisions

| #   | Decision              | Choice                                                                                                                                        |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Content type          | **New dedicated `sermon` Contentful type**, reusing the **existing** `author` + `bibleVerse` types                                            |
| 2   | Site placement        | **Dedicated `/predicas` section** (list + detail), mirroring the blog                                                                         |
| 3   | Transcription (V1)    | **Local `whisper.cpp` `large-v3-turbo`** (free, private, already installed)                                                                   |
| 4   | Automation scope (V1) | **Local, on-demand** via a `/predica` harness command; steps written as portable modules so V2 is a hosting swap                              |
| 5   | Likes                 | **Yes** — reuse the blog like service; **like-key** namespaced (`predicas/<slug>`); **share/URL slug decoupled** from the like-key (see §5.5) |
| 6   | PDF                   | **Two PDFs per sermon (es-AR + en-US)**, HTML→headless-Chrome, branded; **required at launch**                                                |
| 7   | Multilingual          | **Full bilingual content** (both locales authored), exactly like blog posts                                                                   |
| 8   | SEO                   | **Blog parity + sermon-specific improvements** (AudioObject, og:audio, Person, per-locale, sitemap)                                           |
| 9   | Publish/send          | **Never automated.** Contentful draft only; WhatsApp compose-only. Two human gates.                                                           |

---

## 1. Goals & non-goals

**Goals**

- One command turns a sermon recording into a review-ready, bilingual website post with an embedded audio player and a downloadable branded PDF summary in each language, plus a ready-to-paste WhatsApp message.
- Preserve the preacher's voice; surface scripture; structure the teaching into clear sections.
- Human-in-the-loop: nothing is published or sent automatically.
- Editor-friendly: the recurring artifact (the post) lives in Contentful like everything else; editors attach media in the UI they already use.

**Non-goals (V1)**

- No cloud automation, no phone-upload trigger (V2 appendix).
- No new auth surface on the site (it stays auth-free by design).
- No podcast RSS feed (flagged as a future SEO/distribution win, not built).
- No video (audio only). The model leaves room for a future `videoUrl` but it is out of scope.

---

## 2. V1 architecture

```
  you run:  /predica "…/20260607 - Prédica - Jonathan.m4a"
     │
     ▼
[1] TRANSCRIBE   ffmpeg → 16k mono WAV → whisper.cpp large-v3-turbo (es)
                 ALSO transcode source → web .mp3 (keep .m4a as archive); capture durationSec
                 → tasks/predicas/<slug>/transcript.{txt,srt,json} + audio.mp3
     │
     ▼  ★ GATE 1 — you correct names / scripture refs / theology in transcript.txt
     │
[2] WRITE        Claude → structured sermon, BOTH locales:
                 { title, excerpt, thesis, mainPoints[], bodyRichText,
                   scriptureRefs[], seoTitle, seoDescription, keywords[],
                   keyQuotes[], slug, durationSec, whatsappText }  (es-AR + en-US)
                 → tasks/predicas/<slug>/sermon.json
     │
     ▼
[3] PDF          HTML (branded, per locale) → headless Chrome (Playwright)
                 → predica.es-AR.pdf  +  predica.en-US.pdf
     │
     ▼
[4] PUBLISH-DRAFT  Contentful MCP (agent-sandbox, NO publish_*):
                 - upload assets: audio.mp3 (1, non-localized), featuredImage (1),
                   pdf es-AR + pdf en-US (linked into the localized pdfSummary field)
                 - upsert scriptureReferences as bibleVerse entries with BOTH-locale values,
                   reused across sermons via a derived, version-scoped `internalName`
                   ("Joel 2:13 (NVI)") — see docs/predica-bibleverse-reuse.md
                 - create `sermon` entry as DRAFT, both locales, link assets + preacher (author)
                 → returns Contentful entry id + edit URL
     │
     ▼
[5] WHATSAPP     compose es-AR share message using the DETERMINISTIC canonical URL
                 ${NEXT_PUBLIC_BASE_URL}/es-AR/predicas/<slug> (resolves only after publish)
                 — TEXT ONLY, via the existing wa.me/?text= pattern
     │
     ▼  ★ GATE 2 — you review in Contentful, merge agent-sandbox→master, Publish.
                    Publish webhook → POST /api/revalidate → revalidateTag("site-content") → live.
                    You paste the WhatsApp message yourself (link is live post-publish).
```

**Draft-only is enforced on three layers** (verified against the live harness):

1. The `predica-publisher` agent's tool allowlist **omits** `publish_entry` / `publish_asset` (they are discrete MCP tools, so omission is a structural block).
2. Writes default to the **`agent-sandbox`** environment, never live `master` (`get_initial_context` → `Environment ID: agent-sandbox`).
3. The MCP server runs with **`PROTECTED_ENVIRONMENTS=master`** — server-side block on any write to `master` (`docs/contentful-mcp.md:42-49`).

> **Verified:** the live app reads **`master` only** — `lib/contentful/fetch.ts:4-5` POSTs to the GraphQL endpoint with no environment segment, so Contentful defaults to `master`. There is no `CONTENTFUL_ENVIRONMENT` knob today. This is why the human reviews the draft in Contentful's UI, merges `agent-sandbox→master`, then previews/publishes (see O3).

---

## 3. Decomposition, build order & Trello mapping

Four sub-projects. Build **A first**, then **B + C** (parallel), then **D**. Each becomes a Trello card under the existing `/work` flow (`feat/ICR-N-<slug>`); this master spec is sliced into the per-card specs.

| Card | Sub-project                     | Scope                                                                                                                          | Depends on      |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| A    | **`sermon` content type**       | Create the Contentful type + relax `author.avatar` (paired with the B-side AuthorInfo fix)                                     | —               |
| B    | **`/predicas` site section**    | Getter, types, routes, components, audio player, likes (+ Share decoupling), AuthorInfo fallback, CSP, i18n, SEO, sitemap, nav | A               |
| C    | **Branded PDF generator**       | HTML template + Playwright render script, both locales                                                                         | A (field shape) |
| D    | **`/predica` harness pipeline** | Command + subagents + config + transcription/transcode                                                                         | A, B (URLs), C  |

> A is a Contentful change (no app code) done via MCP in `agent-sandbox`, then a human merges to `master`. **Caveat:** A's `author.avatar` relaxation must not ship to `master` until B's AuthorInfo fallback is merged (see §5.x / Blocker-1), else a future avatar-less author would crash blog rendering. B, C, D are code PRs. The website (B) can ship and be tested with a hand-made sermon entry before D automates entry creation.

---

## 4. Sub-project A — the `sermon` content type

**Type id:** `sermon` · **Name:** "Sermon / Prédica" · **displayField:** `internalName`. No `sermon` type exists yet (verified: clean create in both `master` and `agent-sandbox`).

Localization mirrors `blogPostPage`, plus `pdfSummary` is localized (different PDF per language — Contentful localized link fields are verified-supported and resolve per the getter's `locale:` arg).

| field id              | type                       | required | localized | validations / notes                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------- | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internalName`        | Symbol                     | no       | no        | editor handle (space convention)                                                                                                                                                                                                                                                                                                        |
| `title`               | Symbol                     | **yes**  | **yes**   | sermon title                                                                                                                                                                                                                                                                                                                            |
| `slug`                | Symbol                     | **yes**  | no        | unique; regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` (this mirrors the `page` type's slug validation; `blogPostPage.slug` is unique-only with no regex — the regex is a deliberate improvement). Route `/predicas/<slug>`                                                                                                                         |
| `sermonDate`          | Date                       | **yes**  | no        | `dateonly`; the Sunday it was **preached**                                                                                                                                                                                                                                                                                              |
| `preacher`            | Link→`author`              | **yes**  | no        | who **preached** (not the publisher). Reuses the **existing** `author` type.                                                                                                                                                                                                                                                            |
| `scriptureReferences` | Array\<Link→`bibleVerse`\> | no       | no        | the main passage(s); reuses the **existing** `bibleVerse` type (currently used by `contactForm`). Its `book`/`verseContent`/`bibleVersion` are **localized** → per-locale citations come for free (see §5.1).                                                                                                                           |
| `thesis`              | Text                       | **yes**  | **yes**   | one-sentence central idea → drives the PDF                                                                                                                                                                                                                                                                                              |
| `mainPoints`          | Array\<Symbol\>            | **yes**  | **yes**   | 2–5 bullet outline → drives the PDF                                                                                                                                                                                                                                                                                                     |
| `excerpt`             | Text                       | **yes**  | **yes**   | teaser for list tiles + meta fallback                                                                                                                                                                                                                                                                                                   |
| `content`             | RichText                   | no       | **yes**   | full body. Validation set: **match what the shared renderer actually handles** (see §5.3) — marks bold/italic; nodes heading-2/3, blockquote, ul/ol/list-item, paragraph. (Do **not** enable nodes the renderer doesn't render — h1/h4-6, table, embeds — unless §5.3 extends the renderer.) Optional so an audio-only sermon is valid. |
| `featuredImage`       | Link→Asset                 | **yes**  | no        | `linkMimetypeGroup: image`; top + tile image                                                                                                                                                                                                                                                                                            |
| `audio`               | Link→Asset                 | no       | no        | `linkMimetypeGroup: audio`; the recording (web `.mp3`) → player. **New asset kind in this space.**                                                                                                                                                                                                                                      |
| `pdfSummary`          | Link→Asset                 | no       | **yes**   | `linkMimetypeGroup: pdfdocument` (verified the correct token; no `application/pdf` group exists). **es-AR link → Spanish PDF, en-US link → English PDF.** **New asset kind.**                                                                                                                                                           |
| `seoTitle`            | Symbol                     | **yes**  | **yes**   | unique, ≤60 chars                                                                                                                                                                                                                                                                                                                       |
| `seoDescription`      | Text                       | **yes**  | **yes**   | meta description                                                                                                                                                                                                                                                                                                                        |
| `keywords`            | Array\<Symbol\>            | **yes**  | **yes**   | tag editor                                                                                                                                                                                                                                                                                                                              |
| `relatedSermons`      | Array\<Link→`sermon`\>     | no       | no        | max 3; mirrors `relatedBlogPosts`                                                                                                                                                                                                                                                                                                       |

**Author avatar relaxation — paired with a code fix (Blocker-1).** `author.avatar` is currently **required** (verified). A guest preacher may have no photo, so A relaxes it to optional. **But there is no avatar-fallback in the code today:** `AuthorInfo.tsx:8-17,31-33` types `avatar` as non-optional and unconditionally renders `<Image src={avatar.url}>` — a null avatar **crashes the RSC render** for any blog post or sermon. Therefore:

- **B must** make `AuthorInfo`'s `avatar` prop optional and render a fallback (a **bundled local default image** in `public/assets/img/` or generated initials) when absent.
- **Do not** hardcode the asset id `5FtKzy1OMwsIKn1c8KH7Oy` as a "default user image" — verification showed it is actually **Jonathan Hanegan's real avatar**, not a generic placeholder.
- **Sequencing:** A's `author.avatar` relaxation must not reach `master` before B's `AuthorInfo` fallback is live (it's a shared component; the existing two authors both have avatars today, so there's no immediate break, but the guard must land before any avatar-less author entry).

**Creation steps (via Contentful MCP, `agent-sandbox`):**

1. `create_content_type` (`sermon`) with the fields above (validations + `linkMimetypeGroup` + localized flags).
2. `update_editor_interface` (slug tracks `title`, date picker, asset link editors, tag editor).
3. `publish_content_type` (the schema must be published for entries to use it — still in `agent-sandbox`).
4. `update_content_type` to set `author.avatar` `required:false`.
5. **Human merges `agent-sandbox` → `master`** in the Contentful web app (after B's AuthorInfo fix is merged).

---

## 5. Sub-project B — the `/predicas` site section

Mirror the blog end-to-end. **All new files copy an existing blog counterpart.**

### 5.1 Data layer

**New** `lib/contentful/getSermons.ts` — copy `getBlogPostPages.ts` recipe:

- Module-level `GRAPHQL_FIELDS` adding the sermon fields. Asset + ref sub-selections:
  ```graphql
  audio { url title contentType fileName size }
  pdfSummary { url title contentType fileName size }
  preacher { ... on Author { name avatar { url title } email } }
  scriptureReferencesCollection { items { ... on BibleVerse {
    book chapter fromVerse toVerse verseContent bibleVersion } } }
  ```
  **Scripture localization (resolved MAJOR):** because the getter fetches **once per locale** with `locale:`, the **same** `scriptureReferences` links resolve `book`/`verseContent`/`bibleVersion` in the queried locale automatically (e.g. _Mateo_/NVI on es-AR vs _Matthew_/NIV on en-US) — **provided the en-US values are populated** on each `bibleVerse` entry. So there are **two distinct scripture surfaces**: (a) **structured** `scriptureReferences` → Contentful localizes; the `predica-publisher` must fill **both** locales when it creates/links `bibleVerse` entries; (b) **inline** body blockquotes + PDF cover/scripture lines → **writer-supplied** per-locale strings. O2 (English Bible version) applies to both.
- `getLatestSermons(locale, { slug?, isDraftMode? })` — for "related/latest" tiles.
- **`getAllSermons(locale, { isDraftMode? })`** — the full list page. **Use `limit: 100`** (mirroring `getAllBlogPostSlugs`, which uses `limit:100` — there is no truly "unbounded" getter in the codebase; Contentful GraphQL caps collections at 1000/request). Add cursor pagination only if sermon volume approaches 100. (We still avoid the blog **index**'s `limit:3` cap — sermons get the full list, not latest-3.)
- `getSermon(slug, locale, isDraftMode)` — single.
- `getAllSermonSlugs(locale)` — for the sitemap (`limit:100`, `preview:false`, like `getAllBlogPostSlugs`).
- Keep the double `preview:` pass + `fetchGraphQL(query, isDraftMode)` + the inherited `site-content` cache tag.

**New** `src/types/Sermon.ts`. Note `src/types/BlogPost.ts` is a `type` alias with `content.json: any`, an inline `links` shape, `publishedDate`, and **optional** `sys.publishedAt` — it is not a clean template. So define the sermon types explicitly (project convention prefers `interface`; these are **new** types, not a mirror):

```ts
import type { Document } from "@contentful/rich-text-types";

export interface RichTextLinks {
  /* mirror BlogPost.ts's inline links shape: assets.block[], entries.* */
}

export interface SermonAudio {
  url: string;
  title: string;
  contentType: string;
  fileName: string;
  size: number;
}
export interface ScriptureRef {
  book: string;
  chapter: string;
  fromVerse: string;
  toVerse?: string;
  verseContent: string;
  bibleVersion: string; // already locale-resolved by the getter
}
export interface Sermon {
  title: string;
  slug: string;
  sermonDate: string; // ISO date-only
  preacher: {
    name: string;
    avatar?: { url: string; title: string };
    email: string;
  }; // avatar optional
  scriptureReferences?: ScriptureRef[];
  thesis: string;
  mainPoints: string[];
  excerpt: string;
  content?: { json: Document; links: RichTextLinks };
  featuredImage: { url: string; title: string };
  audio?: SermonAudio;
  pdfSummary?: { url: string; title: string };
  durationSec?: number; // for player total-time + JSON-LD ISO-8601
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  relatedSermons?: Sermon[];
  sys: { id: string; publishedAt?: string }; // optional, matching BlogPost
}
```

> If `Document`/`RichTextLinks` add friction, fall back to mirroring `BlogPost.ts`'s actual `content.json: any` + inline links shape. Either way, `sys.publishedAt` is optional.

### 5.2 Routes

- `src/app/[locale]/predicas/page.tsx` — list. `generateMetadata` → `buildPageMetadata({ machineName: "seo-predicas", locale, path: "predicas" })`. Body: `<Header titlePath="Sermons.header-title" variant="gradient" subtitle={t("header-subtitle")} />` + `<SermonSection sermons={await getAllSermons(locale, ...)} />`. Empty-state via `Sermons.no-sermons`.
- `src/app/[locale]/predicas/[slug]/page.tsx` — detail. Mirrors `blog/[slug]/page.tsx:69-73`: `shouldUseDraftMode()` → `getSermon(...)`; missing → not-found. Fetch `getLatestSermons` (related), visitor cookie `_visitor_id`, and `getLikes("predicas/" + slug, visitorId)` (namespaced like-key — see §5.5). Inject `buildSermonJsonLd(sermon, locale)`. Render `<SermonDetails ... />` + the contact CTA.

> Both routes resolve under `/es-AR/predicas/...` and `/en-US/predicas/...` automatically (prefix-always router, verified). Use `Link`/`redirect` from `@src/i18n/routing`.

### 5.3 Components

`src/components/features/sermon-section/` — `SermonSection.tsx` (server; sort by `sermonDate` desc, grid) + `SermonCard.tsx` (client; copy `BlogPostCard`, link `/predicas/<slug>`, show date + preacher + a ▶ "audio" indicator).

`src/components/features/sermon-details/`:

- `SermonDetails.tsx` — layout shell (`max-w-2xl`), order: header → **audio player** → content → scripture refs (optional) → `PostActions` (Like + Share) → related.
- `SermonHeader.tsx` — date overline + title + thesis + `AuthorInfo`(preacher) labeled via `Sermons.preached-by`.
- `SermonAudioPlayer.tsx` — see 5.4.
- `SermonContent.tsx` — rich-text renderer. **Resolved (MAJOR):** `lib/contentful/rich-text-options.tsx` **already exists** (it exports `sectionDescriptionOptions` + `cardDescriptionOptions`). The blog's full options are **inline** in `BlogPostContent.tsx:10-52`. So: **add an `articleRichTextOptions` export to the existing file** (moving the inline options out of `BlogPostContent.tsx` and importing them back — behavior-preserving), then reuse for sermons. The blog options currently render **only** BOLD/ITALIC marks and PARAGRAPH/H2/H3/QUOTE/UL/OL/LIST_ITEM — so either (a) **narrow** the sermon `content` validation set in §4 to match, or (b) **extend** the shared options to cover underline/code/h1/h4-6/hr/table/hyperlink/embeds. Recommend (a) for V1. **Rich-text rendering is on the security-reviewer's XSS watch list** (`security-reviewer.md:32`) — flag the refactor for security review.
- `PdfDownloadButton.tsx` — anchor to `pdfSummary.url` with `download`, labeled `Sermons.summary-pdf`. Plain link → **no CSP change** for the PDF. (Note the en-US fallback in §5.6.)
- `RelatedSermons.tsx` — copy `RelatedArticles`.
- Reuse `PostActions` — **with prop changes** (see §5.5).

### 5.4 Audio player (net-new, dependency-free)

`SermonAudioPlayer.tsx` — `"use client"`. Custom controls over a hidden `<audio preload="metadata" className="hidden">`. **No library, no native `controls`, no download affordance.**

```ts
interface SermonAudioPlayerProps {
  readonly src: string;
  readonly title: string;
  readonly durationSec?: number;
}
```

- State: `isPlaying`, `currentTime`, `duration` (seed from `durationSec` prop; refine on `loadedmetadata`), `isReady`, `isBuffering`, `playbackRate` (`[1,1.25,1.5,2]`), `audioRef`.
- Controls: play/pause (`Button size="icon"`, Heroicons `PlayIcon`/`PauseIcon`, Framer `AnimatePresence` + `whileTap`), scrubber (`<input type="range">`, `accent-primary`), `mm:ss / mm:ss` time (`tabular-nums text-muted-foreground`), speed cycle button.
- Events (`useEffect`): `loadedmetadata`→duration+ready, `timeupdate`→currentTime, `play`/`pause`, `ended`→reset, `waiting`/`playing`→buffering. Clean up on unmount.
- a11y: real buttons/inputs, localized `aria-label`s (`Sermons.play` / `pause` / `seek` / `speed`), `aria-live="polite"` buffering status, arrow-key seek (native), honor `prefers-reduced-motion`.
- On `/en-US/`: render a small note `Sermons.audio-in-spanish` near the player (the audio is Spanish even though the page text is English).
- Optional analytics: `trackEvent("sermon_play", { slug })` on first play (matches `LikeButton`/`ShareButton`, which already use `@src/lib/analytics`).

### 5.5 Likes + Share (collision-safe; Share decoupling — Blocker-2)

The like **read/write path is fully opaque** (verified): `/api/likes` validates only `typeof slug === "string"` (no regex, no `/` rejection); `like.service.ts` uses `slug` as a plain Mongo key. So a **namespaced like-key** `"predicas/<slug>"` produces a distinct `likes` doc with **no schema change, no migration, no blog impact**.

**But `PostActions` is NOT reusable unchanged (Blocker-2).** `ShareButton.tsx:118` **hardcodes** the share URL as `${baseUrl}/${locale}/blog/${slug}`. If we passed `"predicas/<slug>"` to `PostActions`, every share/copy/native-share link would become `…/blog/predicas/<slug>` — **wrong section + leaked prefix → 404**. Fix (a shared-component change → **blog regression check required**):

- Decouple the **like-key** from the **URL slug**. Give `PostActions` separate props: e.g. `likeKey` (the namespaced `"predicas/<slug>"`, passed to `LikeButton`) and a `shareHref`/`basePath` + bare `slug` (passed to `ShareButton`).
- Make `ShareButton` build its URL from a `basePath` (`"blog"` | `"predicas"`) or accept a full `path`, instead of hardcoding `/blog/`.
- Blog usage updated to pass `basePath="blog"` + bare slug + `likeKey=slug` (unchanged behavior). Sermon usage passes `basePath="predicas"` + bare slug + `likeKey="predicas/"+slug`.

> The existing WhatsApp/native-share patterns in `ShareButton` (`https://wa.me/?text=…`) are reused; only the URL construction changes.

### 5.6 CSP / media (hardening — corrected rationale)

**Resolved (MAJOR — rationale was inverted):** the current CSP (`config/headers.js:16`) has **no `default-src`**, so media is **currently unrestricted** (a missing directive with no `default-src` falls back to allow-anything). Audio would actually play today without any change. Adding `media-src` is a **hardening/tightening** step, not an enabler — and a **too-narrow** host list would _break_ playback.

- **Verify the real asset host first.** Upload one sermon `.mp3` to Contentful and read the published asset `.url`. Contentful non-image assets serve from `assets.ctfassets.net` (delivery) and `downloads.ctfassets.net` (forced-download), with EU/region variants. Include exactly the hosts the real asset uses; default to listing both delivery + download hosts:
  ```
  ; media-src 'self' https://assets.ctfassets.net https://assets.eu.ctfassets.net https://downloads.ctfassets.net
  ```
- **Append format:** the entire CSP is **one** backtick template literal at `config/headers.js:16`, directives joined by `; ` with **no trailing semicolon**. Append the directive **into that same string** with a **leading `; `**. Do not add a separate array entry.
- PDF download is a plain anchor → **not governed by `media-src`** → no CSP change for the PDF.
- `next.config.ts` `images.remotePatterns` → **no change** (audio/PDF don't go through `next/image`).
- **Security-sensitive** (flagged in CLAUDE.md): the PR must call out this CSP delta and route through `security-reviewer`.

### 5.7 i18n strings

Add a `Sermons` namespace to **both** `public/locales/es-AR.json` and `en-US.json` (keys identical — verified both files exist with identical top-level key sets; es-AR is source). Also add `common.sermons` (nav/footer label). With **full bilingual** content authored, next-intl's per-field fallback simply never triggers (no conflict).

| key                                         | es-AR                                     | en-US                              |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| `Sermons.header-title`                      | Prédicas                                  | Sermons                            |
| `Sermons.header-subtitle`                   | Mensajes de nuestros cultos dominicales   | Messages from our Sunday services  |
| `Sermons.preached-by`                       | Predicado por                             | Preached by                        |
| `Sermons.audio-in-spanish`                  | El audio de esta prédica está en español. | This sermon's audio is in Spanish. |
| `Sermons.play` / `pause` / `seek` / `speed` | Reproducir / Pausar / Buscar / Velocidad  | Play / Pause / Seek / Speed        |
| `Sermons.scripture`                         | Pasaje bíblico                            | Scripture                          |
| `Sermons.summary-pdf`                       | Descargar resumen (PDF)                   | Download summary (PDF)             |
| `Sermons.more-sermons`                      | Más prédicas                              | More sermons                       |
| `Sermons.no-sermons`                        | Aún no hay prédicas publicadas.           | No sermons published yet.          |
| `Sermons.view-all`                          | Ver todas las prédicas                    | View all sermons                   |
| `common.sermons`                            | Prédicas                                  | Sermons                            |

### 5.8 SEO (blog parity + sermon-specific improvements)

Mirror the blog's `buildArticleMetadata` (`lib/metadata.ts:81-123`) as **`buildSermonMetadata`** (path `predicas/<slug>`, `authors:[preacher.name]`, `publishedTime: sermonDate`, **`modifiedTime: sermon.sys.publishedAt ?? sermon.sermonDate`** — do **not** copy the blog's unguarded `sys.publishedAt`, which can be undefined for a draft). OG `type:"article"`, Twitter `summary_large_image`, canonical + `buildLocaleAlternates`. Add **`og:audio`** = `audio.url` (+ `og:audio:type`) and `og:locale:alternate`.

**`buildSermonJsonLd(sermon, locale)`** — extend the blog's `Article` JSON-LD with audio + person + language:

```jsonc
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "<seoTitle>",
  "description": "<seoDescription>",
  "image": "<featuredImage.url>",
  "datePublished": "<sermonDate>",
  "dateModified": "<sys.publishedAt ?? sermonDate>",
  "author": { "@type": "Person", "name": "<preacher.name>" },
  "publisher": {
    "@type": "Organization",
    "name": "Iglesia de Cristo Redentor",
    "logo": {
      "@type": "ImageObject",
      "url": "<baseUrl>/assets/img/redentor_logo.png",
    },
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "<baseUrl>/<locale>/predicas/<slug>",
  },
  "inLanguage": "<locale>",
  "keywords": "<keywords joined>",
  "audio": {
    "@type": "AudioObject",
    "contentUrl": "<audio.url>",
    "encodingFormat": "<audio.contentType>",
    "duration": "PT…M…S" /* from durationSec */,
  },
  "associatedMedia": [{ "@type": "AudioObject", "contentUrl": "<audio.url>" }],
  "citation": [
    /* each scriptureRef as "Efesios 2:11-22 (NVI)" — locale-resolved */
  ],
}
```

> **Do NOT inherit the blog's broken logo path.** Verification confirmed `lib/metadata.ts:22,145` and `layout.tsx:60` reference `og-default.jpeg` (hyphen) but the file on disk is `og_default.jpeg` (underscore) — a real 404. The sermon JSON-LD uses `redentor_logo.png` (exists) + the real `featuredImage.url`. Optionally fix the filename mismatch (rename file or fix the 3 refs) as a small bundled cleanup; otherwise out of scope.

**Sitemap** (`src/app/sitemap.ts`): add `"predicas"` to `staticPages`; append per-sermon entries from `getAllSermonSlugs(i18n.defaultLocale)` (`limit:100`) → `/${locale}/predicas/${slug}` for both locales, `lastModified` from `sermonDate`/`sys.publishedAt`, with `buildLocaleAlternates("predicas/<slug>")`.

**Nav/footer:** primary nav is Contentful-managed (`getNavigationMenu`) → a human adds the `/predicas` item. Footer is a **code** change — append `{ href:"/predicas", label:t("common.sermons") }` to the `quickLinks` array in `Footer.tsx:29-34` (uses the next-intl `Link`).

**SEO content entry:** create a `seo` entry `machineName: "seo-predicas"` (both locales) for the list page (mirrors `seo-blog`).

---

## 6. Sub-project C — branded PDF generator (both locales)

**Tech:** HTML + CSS → headless Chrome print-to-PDF (the church's house style; fork `reporte-iglesia.html`). **Not** `@react-pdf/renderer` (confirmed **not** a dependency here; it's a dead dep in a sibling repo). Playwright is a devDep (`@playwright/test ^1.61.0`) with the Chromium binary installed → headless print works locally.

**Where it runs (V1):** a Node script `.claude/scripts/predica/build-predica-pdf.mjs` that renders the HTML and drives Playwright to print A4 PDF. Exit-code protocol like `post-trello-result.mjs` (0 ok / 2 bad usage / 1 render failure), `600`-temp-file + secret-scrub conventions reused. **Portable to a `puppeteer-core` + `@sparticuz/chromium` route for V2 unchanged.**

**Branding (website brand):** Playfair Display (headings) + Outfit (body) via Google Fonts `<link>`; primary `#0070B3`, warm sand `#EBE2D6`, slate `#0F1729`, background `#F8FAFB`, muted `#647488`, border `#E2E8F0`; logo `public/assets/img/redentor_logo.png` (dark) on the light cover; `@page { size: A4; margin: 18mm 17mm }`, `print-color-adjust: exact`, `break-inside: avoid` on quotes/callouts.

**Layout (per locale):** cover (logo · date/service eyebrow · H1 title · key verse · "Predicó/Preached: <preacher>" · rule) → lead → **Tesis/Thesis** (callout) → **Puntos principales/Main points** (bullets) → **Citas clave/Key quotes** (1–2 blockquotes) → **Referencias bíblicas/Scripture** (chips/list) → closing + signature footer.

**Data contract** (one object per locale, from step [2]):

```ts
interface SermonPdfData {
  locale: "es-AR" | "en-US";
  title: string;
  preacher: string;
  date: string;
  serviceLabel: string;
  scriptureHeadline?: string;
  lead: string;
  thesis: string;
  mainPoints: string[];
  keyQuotes: string[]; // 1–2, verbatim
  scriptureRefs: string[]; // per-locale, e.g. "Efesios 2:11-22 (NVI)" / "Ephesians 2:11-22 (NIV)"
  closing?: string;
}
```

Output: `predica.es-AR.pdf` + `predica.en-US.pdf` in `tasks/predicas/<slug>/`.

---

## 7. Sub-project D — the `/predica` harness pipeline

**New command** `.claude/commands/predica.md` (format verified: `--- description / argument-hint ---`; orchestrator modeled on `/qa`'s fan-out + `/work`'s gate discipline). **New config block** in `.claude/config.json` (flat top-level object; a `predica` sibling block fits the convention):

```jsonc
"predica": {
  "audioInbox": "/Users/.../Predicas",
  "artifactsDir": "tasks/predicas",
  "contentType": "sermon",
  "contentfulEnv": "agent-sandbox",
  "whisper": { "bin": "/Users/gabriel/repos/whisper.cpp/build/bin/whisper-cli",
               "model": "models/ggml-large-v3-turbo.bin", "lang": "es",
               "prompt": "Prédica en español. Iglesia de Cristo Redentor. Jesús, evangelio, Espíritu Santo." },
  "locales": ["es-AR", "en-US"],
  "whatsappLocale": "es-AR"
}
```

**Subagents** (`.claude/agents/predica-*.md`; format verified `--- name/description/tools/model ---`; tool allowlist is the safety boundary):

| agent                 | tools                                                                                                                                                                    | role                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `predica-transcriber` | `Bash, Read, Write`                                                                                                                                                      | (1) `ffmpeg` → 16k mono WAV → whisper.cpp → `transcript.{txt,srt,json}`; (2) **transcode source → web `audio.mp3`** (keep original `.m4a` as archive); (3) **capture `durationSec`** (ffprobe). Emits the transcript + mp3 + duration.                                                                                                                                                      |
| `predica-voice-coach` | `Read, Write, Edit`                                                                                                                                                      | **corrected transcript → per-preacher voice profile** (`tasks/predicas/_voices/<preacher-slug>.md`). Speech/rhetoric coach: learns style from the **corrected transcript only** (never `sermon.json` — avoids a feedback loop); two-zone file (A human-curated canonical guide, B append-only dated log); idempotent by `sermonDate`, non-blocking, style-only. The writer reads it (§7.2). |
| `predica-writer`      | `Read, Write, Edit, Skill`                                                                                                                                               | transcript (+ the step-2.5 voice profile) → `sermon.json` (both locales, all fields incl. `slug`, `durationSec`, `keyQuotes`, per-locale `scriptureRefs` strings, `whatsappText`). Loads `docs/product/` editorial rules; may invoke `humanizer`.                                                                                                                                           |
| `predica-publisher`   | `Read, Bash` + `mcp__contentful__{get_initial_context, list_content_types, search_entries, create_entry, update_entry, upload_asset, update_asset}` **(NO `publish_*`)** | upload `audio.mp3` + `featuredImage` + 2 PDFs; upsert `bibleVerse` entries with **both-locale** values; create DRAFT `sermon` entry (both locales, link assets + preacher) in `agent-sandbox`; return entry id + edit URL                                                                                                                                                                   |
| `predica-whatsapp`    | `Read, Write`                                                                                                                                                            | compose es-AR WhatsApp text → `whatsapp.txt` using the deterministic canonical URL (see step 6); compose-only, never sends                                                                                                                                                                                                                                                                  |

PDF generation = the helper **script** (not an agent): `node .claude/scripts/predica/build-predica-pdf.mjs tasks/predicas/<slug>/sermon.json`.

**Orchestrator steps** (`predica.md`): 0. Resolve audio path from `$1` (or newest in `audioInbox`). **Derive a provisional `<slug>`** for the artifacts dir via the normalization in §7.1; create `tasks/predicas/<sermonDate>_<slug>/` (date-prefixed dir — see §7.1).

1. Dispatch `predica-transcriber` (transcript + `audio.mp3` + `durationSec`).
2. **★ GATE 1** — print the transcript path; wait for the human to confirm/correct `transcript.txt`.
   2.5. Dispatch `predica-voice-coach` (between Gate 1 and the writer) → updates the per-preacher voice profile from the **corrected transcript**; the writer reads it at step 3. Idempotent (by `sermonDate`), **non-blocking** (a failure warns and continues), dry-run-safe. See §7.2.
3. Dispatch `predica-writer` (passing `voiceProfilePath` when it exists) → `sermon.json` (the **writer's `slug` is canonical**; orchestrator validates it against the slug regex and reconciles the artifacts dir). Show title/thesis/points/quotes for a sanity glance.
4. Run `build-predica-pdf.mjs` → two PDFs.
5. Dispatch `predica-publisher` → Contentful draft + assets + bibleVerse refs.
6. Dispatch `predica-whatsapp` → `whatsapp.txt` (link = `${NEXT_PUBLIC_BASE_URL}/es-AR/predicas/<slug>`, deterministic; resolves after publish).
7. **★ GATE 2** — summary report: transcript path, `sermon.json`, both PDFs, Contentful **draft** edit URL, WhatsApp text. Human reviews → merges sandbox→master → Publishes → pastes WhatsApp. **No agent publishes or sends.**

### 7.1 Slug derivation (resolved MINOR)

Source filenames have spaces, accents, caps, and a leading date (e.g. `20260607 - Prédica - Jonathan.m4a`) — none satisfy the slug regex. The **writer** produces the canonical slug from the **title** (not the filename): transliterate accents (`Prédica→predica`), lowercase, replace non-alphanumerics with `-`, collapse repeats, trim leading/trailing `-`. **Date is not part of the slug** (it lives in `sermonDate`). On an existing slug there is **no `-2` bump** — a new **★ Gate 0 ★** (below) detects it and, on approval, updates that entry in place. The orchestrator's step-0 provisional dir (from the filename) is only temporary and is reconciled at step 3.

**Artifacts-folder naming (decoupled from the slug).** The on-disk per-sermon dir is named **`<sermonDate>_<slug>`** (e.g. `2026-06-07_el-deseo-mas-profundo-de-dios`) so `tasks/predicas/` self-sorts chronologically by name. This date prefix is **local-only**: the slug regex applies only to the `slug` field, and `sermon.json.slug` stays **bare** (no date) — that bare slug alone is the Contentful `fields.slug` and the public URL `/predicas/<slug>`. At step 3 the orchestrator reconciles `basename(slugDir)` to `<sermonDate>_<canonicalSlug>` (renaming the temp dir if needed). Re-run detection (below) matches by `sourceSha256`, **not** by folder name, so the date prefix never affects idempotency.

**Idempotency / re-run (IMPLEMENTED — no Mongo audit collection needed).** Re-running `/predica` is safe and intentional (see `docs/predica-rerun-idempotency.md`): (1) pre-flight matches the recording's `sourceSha256` against `tasks/predicas/*/` to **reuse the corrected transcript** and skip transcription + Gate 1; (2) a new **★ Gate 0 ★** (after the writer, when the canonical slug exists) looks the sermon up in Contentful by slug (+ `sermonDate`) and, on human approval, **updates the existing entry in place** (`create-contentful-entry.mjs --id`) instead of creating a `<slug>-2` duplicate, then cleans up superseded assets + orphaned legacy verses via `delete-contentful.mjs` (`--guard-referenced` never touches a shared verse). Bible verses dedup site-wide by a derived version-scoped `internalName` key (`docs/predica-bibleverse-reuse.md`). The `sermons` Mongo audit collection idea is **not used** — slug + audio-hash detection covers it without new infra.

**Conventions reused:** secret-scrub regex set, `600`-perm temp files, exit-code protocol, config-driven (no hardcoded ids/paths). **Add `tasks/predicas/` to `.gitignore`** (verified: `tasks/` is not ignored wholesale — only specific files at lines 54-56 — so this line is genuinely needed) since audio/transcripts are large and not source.

### 7.2 Per-preacher voice profiles (the voice-coach learning loop)

Full doc: `docs/predica-voice-profiles.md`. A new subagent, **`predica-voice-coach`** (step 2.5, between Gate 1 and the writer), turns the pipeline's per-sermon voice handling into an **accumulating, curatable, per-preacher** model so the writing compounds in quality across sermons.

- **Source of learning = the corrected `transcript.txt` ONLY.** Never the generated `sermon.json` or any model prose — learning from our own output would reinforce model-isms and drift from the preacher (style collapse). This is the make-or-break rule, enforced in the agent's hard rules.
- **Storage = local-only, gitignored:** `tasks/predicas/_voices/<preacher-slug>.md`, one file per preacher (`<preacher-slug>` derived from the full name with the §7.1 normalization). The repo is **public** and all sermon-derived content already stays out of git, so a speech-coach dossier on a named pastor stays in that same private tier; an append-only dated log gives an in-file history trail in lieu of git history.
- **Two-zone, curation-respecting file:** **Zone A** = human-owned canonical voice guide (the coach **seeds it once** on first creation, then never auto-overwrites it; it may only append bullets to a fenced "🤖 Refinamientos sugeridos" list the human promotes by hand); **Zone B** = machine append-only dated log, one concise entry per sermon keyed by `sermonDate` (a transcript-reuse re-run self-skips — never double-appends). The writer reads both, weighting Zone A.
- **Style only, never doctrine.** The profile governs _how_ the preacher communicates (vocabulary, rhetoric, cadence, tone, structure, signature phrases), never _what_ is asserted. The transcript stays the source of truth for content; the writer's no-fabrication rules (§8.1, §8.7) still win.
- **Non-blocking + additive.** If the coach fails (or the transcript is too thin), the orchestrator warns and continues; the writer falls back to today's transcript-only inference. It runs under `--dry-run` too. It can never break publishing.
- **Wiring:** `config.predica.{agents.voiceCoach, voices, voiceCoach}`; pre-flight derives `preacherSlug` + `voiceProfilePath` (+ `mkdir -p _voices`); §2.5 dispatch; the step-3 writer dispatch forwards `voiceProfilePath` when the file exists.

---

## 8. Editorial & content ground rules for sermons

(Codified here + injected into the `predica-writer` prompt. Grounded in the de-facto template "El Perdón de Jesús" + `docs/product/editorial-and-content-rules.md`.)

1. **Preserve the preacher's voice.** First person, their phrasing and emphasis. Restructure for readability; do **not** rewrite into generic prose or add doctrine the preacher didn't say.
2. **Sections** via `heading-2` (major movements), `heading-3` (numbered sub-points), following the sermon's own structure.
3. **Scripture** as `blockquote` with reference + version inline (es: **NVI**; en: **NIV**). Plus structured `scriptureReferences` (`bibleVerse` entries) for the main passage(s), populated in **both** locales.
4. **1–2 exact pull-quotes** — verbatim "sticky" lines the preacher actually said, as blockquotes. **No more than two.** Must appear in the transcript word-for-word.
5. **Thesis + 2–5 main points** captured explicitly (they drive the PDF and the SEO description).
6. **Both locales authored.** English is a faithful, natural translation (meaning-preserving; the audio stays Spanish). Every localized field filled in both — **including** the en-US `bibleVerse` values (NIV) and the en-US PDF.
7. **No fabrication.** If the transcript is unclear (names, citations), flag it for Gate-1 correction rather than guessing.
8. **Length/format** consistent with the blog's reading experience (`max-w-2xl`, scannable sections).

---

## 9. Transcription & audio prep (V1)

- Transcribe WAV: `ffmpeg -i "<audio>" -ar 16000 -ac 1 -c:a pcm_s16le <wav>` (throwaway, for whisper only).
- Run: `whisper-cli -m models/ggml-large-v3-turbo.bin -f <wav> -l es -otxt -osrt -oj -of <out> -t 8 -sns --prompt "<church vocab>"` (verified: binary, turbo + large-v3 models, ffmpeg/ffprobe all present on the M3 Pro; ~3–5 min for a 60-min sermon).
- **Web audio asset (resolved MINOR, O5):** transcode the source to a browser-universal **`.mp3`** (`ffmpeg -i "<audio>" -c:a libmp3lame -b:a 96k <slug>.mp3`) and upload **that** as the Contentful `audio` asset; keep the original `.m4a` as the archive. (AAC `.m4a` also plays in modern browsers, but `.mp3` is the safest universal default.)
- **Duration:** capture `durationSec` via `ffprobe` → into `sermon.json` → JSON-LD ISO-8601 `duration` + the player total-time label.
- Swappable boundary `transcribe(audioPath) → { text, durationSec }` so V2 drops in a cloud provider (Gemini key already in `dataforge-ai`, or OpenAI `gpt-4o-transcribe`) without touching downstream steps.

---

## 10. Testing strategy

**Unit (Vitest):** `getSermons` shape-mappers; `buildSermonMetadata`/`buildSermonJsonLd` (AudioObject, per-locale `inLanguage`, `modifiedTime ?? sermonDate`, canonical/alternates); `formatTime(sec)→mm:ss`; slug-normalizer; `sermonLikeKey(slug)==="predicas/"+slug`.
**Component:** `SermonAudioPlayer` (play/pause state, scrubber seeks, time format, no native `controls`, localized aria-labels); `AuthorInfo` renders a fallback when `avatar` is absent (Blocker-1); `ShareButton` builds `/predicas/<slug>` from `basePath` (Blocker-2).
**E2E (Playwright, Vercel preview, authored by `qa-runner`):** `/predicas` lists + card links; detail renders header/player/content/PDF/like+share; player play starts audio + scrubber seeks; `/en-US/predicas/<slug>` shows English body + "audio in Spanish" note + correct share URL (`/predicas/`, not `/blog/`); PDF link resolves per locale.
**Manual smoke (Gate-2 checklist):** both-locale pages render; audio streams + seeks; both PDFs open + branded; JSON-LD validates (Rich Results); likes increment (distinct from blog); share URL correct; WhatsApp text correct.
**Pipeline:** a `--dry-run` for `/predica` that stops after step [3] (no Contentful writes).

---

## 11. Edge cases

1. **Audio > Contentful free-tier 50 MB** (paid tier 1000 MB) — `.mp3` at 96 kbps for ~60 min ≈ ~40 MB, fine on a paid plan; flag if the space is free-tier.
2. **No `content` body** (audio-only) — page renders header + player + PDF; `content` optional.
3. **Missing preacher avatar** — requires the `AuthorInfo` fallback (Blocker-1); without it, the page crashes.
4. **Slug collision with a blog post** — like-keys are namespaced (`predicas/<slug>`), share URLs use `basePath`, and routes are separate; no collision.
5. **Re-running `/predica`** — pre-flight reuses the corrected transcript (audio-hash match) and **Gate 0** detects the existing Contentful sermon and, on approval, updates it in place + cleans up (see `docs/predica-rerun-idempotency.md`).
6. **English version drift** — writer fills both locales atomically (incl. en `bibleVerse` values in NIV + en PDF); Gate-2 checks both.
7. **whisper proper-noun errors** — Gate-1 correction + the church-vocab `--prompt`.
8. **PDF page breaks** mid-quote — `break-inside: avoid`.
9. **CSP** — `media-src` is hardening (media is unrestricted today); a too-narrow host list breaks playback → verify the real asset host first (§5.6); security-reviewer diff check.
10. **`pdfSummary` en-US fallback** — en-US localized fields fall back to es-AR, so a **missing** en-US PDF link **silently serves the Spanish PDF** (the field is never null after fallback). Both PDFs are mandatory at launch → low risk, but `PdfDownloadButton`'s "render only when present" won't yield "no PDF on en-US", and any test asserting that must account for the fallback.
11. **Preview before publish** — see O3.

---

## 12. Open questions (resolve at spec review)

All open questions are resolved — the spec is build-ready.

- **O1 — RESOLVED.** PDF asset uses `linkMimetypeGroup: pdfdocument` (verified the valid token; no `application/pdf` group exists).
- **O2 — RESOLVED.** Spanish Bible version = **NVI**, English = **NIV** (updated from the original RVR1960
  decision; see PR #57). Applies to both PDFs, both-locale `bibleVerse.bibleVersion`, and inline citations.
- **O3 — RESOLVED.** Preview = **option (a)**: review the draft in Contentful's UI → merge `agent-sandbox→master` → use the site's existing draft mode to preview → Publish. **No `fetch.ts` / data-layer change in V1.** (Option (b), wiring on-site preview to `agent-sandbox`, is explicitly deferred.)
- **O4 — RESOLVED.** Likes use the **namespaced like-key** (`predicas/<slug>`) — zero migration. (The §5.5 Share decoupling is required regardless.)
- **O5 — RESOLVED.** Upload a transcoded **`.mp3`** web asset; keep the `.m4a` as archive (§9).

---

## 13. V2 appendix — cloud automation (deferred)

**Target:** record on phone → upload → everything happens automatically → a review-ready draft + WhatsApp text, no manual run.

```
iOS Shortcut → Google Drive /Sermones/_inbox  (church account; you have the Drive MCP)
   → Vercel Cron poll (~15 min)  → /api/sermon/ingest (thin, dedupe, secret-header pattern from /api/revalidate)
   → Trigger.dev worker (durable, no Vercel 800s limit):
        download → (ffmpeg chunk if >25MB) → cloud transcribe (OpenAI gpt-4o-transcribe / Gemini)
        → Claude content-gen → render 2 PDFs (puppeteer-core+@sparticuz/chromium)
        → Contentful DRAFT entry + assets (never publish)
        → WhatsApp-ready text (email via existing SendGrid/Resend adapter, or Telegram)
   → human reviews in Contentful → Publish → existing /api/revalidate webhook → live
```

**Cost:** under **$10/month** at one sermon/week.

**Portable-now modules (write them this way in V1 so V2 is a hosting swap):**

1. `transcribe(audioPath) → { text, durationSec }`
2. `generateSermonPost(transcript) → SermonJson` (Claude API; default to the latest Claude model — confirm id via the `claude-api` skill at build time)
3. `buildSermonPdf(SermonPdfData) → Buffer` (Playwright now, Puppeteer-on-worker later)
4. `publishSermonDraft(SermonJson, assets) → entryId` (Contentful CMA)
5. `composeWhatsapp(SermonJson) → string`

**Genuinely hard / deliberately deferred (why V1 stays local):** an always-on worker (Vercel can't run multi-minute transcription); the site's **first auth/secret surface** (ingest webhook/upload) on a deliberately auth-free, CSP-locked site (security-review item); whisper.cpp can't run on Vercel (cloud forces a paid transcription API + >25 MB chunking); trigger reliability (Drive channel expiry, dedupe, mid-run resume); WhatsApp Cloud API onboarding (disproportionate for a weekly message).

**Cheap V2 piece worth pulling into V1 now (optional):** the **iOS Shortcut → Google Drive `_inbox`** archive habit. Establishes the upload habit + archive; V1 harness runs against that folder; V2 = swap the manual run for Cron+worker. **Your call.**

---

## 14. Rollout sequence

1. **A** — create `sermon` type in `agent-sandbox`; relax `author.avatar` (**after** B's AuthorInfo fallback is merged, per Blocker-1 sequencing); human merges to `master`.
2. **B** + **C** in parallel — site section (AuthorInfo fallback, Share decoupling, getter, components, audio player, CSP, i18n, likes, SEO, sitemap, nav) + PDF generator (NIV for the en PDF). Ship B with a hand-made sermon entry to validate rendering before D exists.
3. **D** — the `/predica` command + subagents + transcription/transcode, wiring A/B/C together.
4. **Verify** (`/verify`) + **QA** (`/qa` against the Vercel preview).
5. First real sermon dry-run end-to-end; iterate on the writer prompt + PDF template.
6. Document in `docs/` (`docs/sermons-pipeline.md`) and update `docs/agent-harness.md` with `/predica`.

---

## Verification log (what the adversarial review changed)

Reviewed by 3 critics against the live Contentful space + codebase; key corrections folded in:

- **Resolved contradiction:** `bibleVerse` **is** an existing structured content type (verified `get_content_type` in `master`: book[L]/chapter/fromVerse/toVerse[opt]/verseContent[L]/bibleVersion[L]), used by `contactForm`. Structured-link design kept; "currently unused" wording removed.
- **Blocker-1 (avatar):** no avatar fallback exists in `AuthorInfo.tsx`; relaxing `author.avatar` to optional needs a B-side fallback + sequencing guard; the "default user image" asset id was actually a real author's photo.
- **Blocker-2 (Share):** `ShareButton` hardcodes `/blog/${slug}`; namespaced like-keys would break sharing → decouple like-key from share/URL slug via `PostActions`/`ShareButton` prop changes (shared component → blog regression check).
- **Major:** `lib/contentful/rich-text-options.tsx` already exists (add export, don't create); blog renderer covers a narrower node/mark set than the proposed validation → narrow the set (or extend renderer); flag for XSS review.
- **Major:** WhatsApp link can't be live at compose time → use the deterministic canonical URL (resolves post-publish).
- **Major:** CSP rationale was inverted — media is unrestricted today (no `default-src`); `media-src` is hardening; verify the real asset host before locking it; exact append format specified.
- **Major:** scripture has two surfaces — structured `bibleVerse` (Contentful-localized; populate both locales) vs writer-supplied inline/PDF strings.
- **Minors/nits:** `getAll*` use `limit:100` (not unbounded); `pdfSummary` en-US fallback silently serves the Spanish PDF; `Sermon` types are new (not a `BlogPost` mirror), `sys.publishedAt` optional; explicit transcode-to-mp3 + `durationSec` pipeline step; slug normalization + single-owner reconciliation; `modifiedTime ?? sermonDate`; slug regex mirrors `page` (not `blogPostPage`); don't hardcode the default-avatar asset id; `og-default.jpeg` filename bug confirmed (don't inherit); confirm `tasks/predicas/` `.gitignore` line.

_End of spec._
