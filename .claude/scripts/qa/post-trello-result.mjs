#!/usr/bin/env node
// post-trello-result.mjs — post a /qa acceptance result to a Trello card as a Markdown
// comment, then attach each screenshot to the card. Replaces Foodista's post-jira-result.mjs.
//
// Trello card comments are Markdown (not ADF), and the REST API attaches images as separate
// card attachments (you can't inline media inside a comment body the way Jira ADF can). So:
//   1) For each screenshot, POST multipart to /1/cards/{id}/attachments   (FIRST)
//   2) POST the Markdown comment to /1/cards/{id}/actions/comments        (SECOND)
// We attach first so the comment's "Evidence" list can reference each screenshot by filename;
// the attachments appear in the card's attachment strip.
//
// Usage:   node .claude/scripts/qa/post-trello-result.mjs <payload.json>
//
// Payload (written by /qa, /work, or /merge to a 0600 temp file):
//   { cardId, cardShortLink, ticketKey:"ICR-45", qaEnvPath, configPath, dryRun,
//     meta:{title,testedAt,envName,host,targetUrl,previewUrl,testType,buildUnderTest,mode,runId,postedBy},
//     result:{...agent block 1...}, evidence:[{path,caption,ac}] }
//   meta.envName is REQUIRED ("preview" | "staging") — no silent default; the run exits 2 if absent.
//   meta.postedBy ("/qa" | "/work" | "/merge") sets the footer provenance; defaults to "/qa".
//   meta.targetUrl is the env's base URL (preview OR staging); previewUrl is kept as a back-compat alias.
//
// Trello creds come from qa-env.json (path = payload.qaEnvPath):
//   { "trello": { "apiKey": "...", "token": "..." } }
//   qa-env.json MUST be gitignored (it is). This site has no auth/login, so qa-env.json carries
//   NO JWT/session/bearer token of any kind — only the Trello apiKey+token and an optional test
//   mongodbUri. Auth to Trello is the REST convention ?key=&token= query string, sent over HTTPS
//   and never logged.
//
// Exit codes:
//   0  posted (or dry-run printed)
//   2  bad usage / unreadable payload / missing cardId
//   3  Trello credentials absent  → orchestrator falls back to mcp__trello__add_comment + attach_image_to_card
//   1  a Trello REST call failed   → orchestrator falls back / surfaces the error
//
// Secret hygiene: key+token read from qa-env.json by path, sent only as query params over HTTPS,
// never printed. All rendered text is scrubbed (Mongo URIs / JWTs / KEY=secret / Contentful /
// SendGrid / Resend / Mailchimp keys).

import { readFile } from "node:fs/promises";

const PLACEHOLDER = /^<.*>$/s; // an un-filled "<…>" template value counts as absent

function present(v) {
  return typeof v === "string" && v.trim() !== "" && !PLACEHOLDER.test(v.trim());
}

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// ── secret scrub (mirrors the pr-author safety net; extended for ICR providers) ─
const SCRUBBERS = [
  [/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[redacted-mongo-uri]"],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]"],
  // ICR email / CMS provider keys
  [/SG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}/g, "[redacted-sendgrid]"],
  [/re_[A-Za-z0-9]{20,}/g, "[redacted-resend]"],
  [/\b[0-9a-f]{32}-us[0-9]{1,2}\b/g, "[redacted-mailchimp]"],
  [/CFPAT-[A-Za-z0-9_\-]{20,}/g, "[redacted-contentful]"],
  // KEY=secret / SECRET: value style assignments (uppercase env-ish keys only)
  [/\b([A-Z][A-Z0-9_]{2,}(?:SECRET|TOKEN|KEY|PASSWORD|PASS|URI))\s*[=:]\s*[^\s"'<>]+/g, "$1=[redacted]"],
];
function scrub(s) {
  if (typeof s !== "string") return s;
  let out = s;
  for (const [re, rep] of SCRUBBERS) out = out.replace(re, rep);
  return out;
}

function mimeFor(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return "image/png";
}

// ── Markdown renderer (replaces Foodista's ADF builder) ───────────────────────
const STATUS_EMOJI = { PASS: "✅ PASS", PARTIAL: "⚠️ PARTIAL", FAIL: "❌ FAIL", BLOCKED: "🚫 BLOCKED" };
const RESULT_EMOJI = { pass: "✅ Pass", fail: "❌ Fail", partial: "⚠️ Partial", blocked: "🚫 Blocked" };
const TYPE_EMOJI = { ui: "🖥️ UI", api: "🔌 API", both: "🖥️+🔌 Both" };

// Escape a value for use inside a Markdown table cell: pipes break the column layout, and
// newlines break the row, so collapse both. Everything is scrubbed first.
function cell(v) {
  return scrub(String(v ?? ""))
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

// Render the full QA-result comment as a single scrubbed Markdown string.
// `attached` = [{ name, ac, caption }] for screenshots already uploaded to the card.
function renderMarkdown({ ticketKey, meta, result, attached }) {
  const m = meta ?? {};
  const r = result ?? {};
  const sum = r.summary ?? {};
  const lines = [];

  // Provenance: which command posted this. Valid: "/qa" | "/work" | "/merge"; default "/qa".
  const postedBy = present(m.postedBy) ? m.postedBy : "/qa";
  // Env-aware URL label: "Staging:" for staging, else "Preview:". Read the active env name.
  const envName = String(m.envName ?? "");
  const urlLabel = envName === "staging" ? "Staging" : "Preview";
  // The target URL is the active env's base URL; previewUrl is the back-compat alias.
  const targetUrl = m.targetUrl ?? m.previewUrl ?? r.previewUrl;

  lines.push(`🔎 **QA Report — ${cell(ticketKey)}: ${cell(m.title ?? r.summaryTitle ?? "")}**`);
  lines.push("");
  lines.push(`**Status:** ${STATUS_EMOJI[r.status] ?? scrub(String(r.status ?? "—"))}`);
  lines.push(
    `**Tested:** ${scrub(String(m.testedAt ?? ""))} · env: ${scrub(String(m.envName ?? ""))} (${scrub(
      String(m.host ?? ""),
    )}) · type: ${scrub(String(m.testType ?? r.testType ?? ""))}`,
  );
  if (present(targetUrl)) {
    lines.push(`**${urlLabel}:** ${scrub(String(targetUrl))}`);
  }
  lines.push(`**Build under test:** ${scrub(String(m.buildUnderTest ?? r.buildUnderTest ?? ""))}`);
  lines.push(`**Mode:** ${scrub(String(m.mode ?? ""))} · **Run:** ${scrub(String(m.runId ?? ""))}`);
  lines.push("");

  // Acceptance criteria table
  lines.push("**Acceptance criteria**");
  lines.push("");
  const perAC = Array.isArray(r.perAC) ? r.perAC : [];
  if (perAC.length) {
    lines.push("| # | Criterion | Type | Result | Notes |");
    lines.push("|---|-----------|------|--------|-------|");
    for (const ac of perAC) {
      lines.push(
        `| ${cell(ac.n)} | ${cell(ac.text)} | ${TYPE_EMOJI[ac.type] ?? cell(ac.type)} | ${
          RESULT_EMOJI[ac.result] ?? cell(ac.result)
        } | ${cell(ac.notes)} |`,
      );
    }
  } else {
    lines.push("_No per-AC breakdown returned._");
  }
  lines.push("");

  lines.push(
    `**Summary:** ${sum.passed ?? 0} passed · ${sum.failed ?? 0} failed · ${sum.partial ?? 0} partial · ${
      sum.blocked ?? 0
    } blocked`,
  );
  lines.push("");

  // BLOCKED detail
  const blockers = Array.isArray(r.blockers) ? r.blockers.filter(Boolean) : [];
  if (blockers.length) {
    lines.push("**Test data / config required:**");
    for (const b of blockers) lines.push(`- ${scrub(String(b))}`);
    lines.push("");
  }

  // Remediation summary (Phase 2/3) — passed through verbatim if the orchestrator set it
  if (present(m.remediation)) {
    lines.push(`**🔧 Remediation:** ${scrub(String(m.remediation))}`);
    lines.push("");
  }

  // Evidence — screenshots are attached separately; reference them by filename here.
  lines.push("**Evidence** (screenshots attached to this card)");
  const ev = Array.isArray(attached) ? attached : [];
  if (ev.length) {
    for (const a of ev) {
      const label = a.ac != null ? `AC${a.ac}` : "Screenshot";
      lines.push(`- ${label} — ${scrub(String(a.caption ?? a.name ?? ""))}  (${scrub(String(a.name ?? ""))})`);
    }
  } else {
    lines.push("- none");
  }
  lines.push("");

  // Out-of-scope observations
  const obs = Array.isArray(r.observations) ? r.observations.filter(Boolean) : [];
  if (obs.length) {
    lines.push("**Out-of-scope observations:**");
    for (const o of obs) lines.push(`- ${scrub(String(o))}`);
  } else {
    lines.push("**Out-of-scope observations:** none (logged to backlog)");
  }
  lines.push("");

  lines.push(`_Posted by ${scrub(postedBy)} · do not edit — re-run ${scrub(postedBy)} to refresh._`);

  return scrub(lines.join("\n"));
}

// ── Trello REST ───────────────────────────────────────────────────────────────
const TRELLO_BASE = "https://api.trello.com/1";

// Attach one screenshot to the card as a multipart file upload. Returns the attachment name
// (so the comment can reference it). key/token go on the query string per Trello convention.
async function attachImage({ cardId, key, token, path, name }) {
  const buf = await readFile(path);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: mimeFor(name) }), name);
  form.append("name", name);
  const url = `${TRELLO_BASE}/cards/${encodeURIComponent(cardId)}/attachments?key=${encodeURIComponent(
    key,
  )}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`attach failed (${res.status}) for ${name}: ${scrub(body).slice(0, 300)}`);
  }
  const json = await res.json().catch(() => ({}));
  return { id: json.id, name: json.name ?? name };
}

// Post the Markdown comment to the card. `text` is sent as a query param (Trello's comment API);
// it is the already-scrubbed renderMarkdown output.
async function postComment({ cardId, key, token, text }) {
  const url =
    `${TRELLO_BASE}/cards/${encodeURIComponent(cardId)}/actions/comments` +
    `?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`comment failed (${res.status}): ${scrub(body).slice(0, 300)}`);
  }
  return res.json();
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) die(2, "usage: post-trello-result.mjs <payload.json>");

  let payload;
  try {
    payload = JSON.parse(await readFile(payloadPath, "utf8"));
  } catch (e) {
    die(2, `cannot read payload: ${e.message}`);
  }

  const { cardId, ticketKey, qaEnvPath, dryRun } = payload;
  if (!present(ticketKey)) die(2, "payload.ticketKey is required");
  if (!present(payload.meta?.envName))
    die(2, "payload.meta.envName is required (preview|staging) — no silent default");

  // Normalize evidence: a bare string is a path; otherwise {path,caption,ac}. Keep present paths.
  const evidence = (payload.evidence ?? payload.result?.evidence ?? [])
    .map((e) => (typeof e === "string" ? { path: e } : e))
    .filter((e) => e && present(e.path))
    .map((e) => ({ ...e, name: e.path.split("/").pop() }));

  // Dry-run makes no network calls, so it never needs credentials.
  if (dryRun) {
    process.stdout.write(
      `[dry-run] would attach ${evidence.length} screenshot(s) to ${ticketKey} and post 1 comment:\n`,
    );
    for (const e of evidence) {
      process.stdout.write(`  - ${e.path}  (AC${e.ac ?? "?"}: ${scrub(e.caption ?? "")})\n`);
    }
    const preview = renderMarkdown({
      ticketKey,
      meta: payload.meta,
      result: payload.result,
      attached: evidence.map((e) => ({ name: e.name, ac: e.ac, caption: e.caption })),
    });
    process.stdout.write(
      `[dry-run] Markdown comment preview (${preview.length} chars); no Trello writes performed.\n`,
    );
    if (process.env.QA_DEBUG_MD) process.stdout.write(preview + "\n");
    process.exit(0);
  }

  // cardId is required for any real Trello write (it is the Trello card id, not "ICR-N").
  if (!present(cardId)) die(2, "payload.cardId is required (resolve idShort ICR-N → Trello card id)");

  // Resolve Trello creds from qa-env.json.
  let key, token;
  try {
    const qaEnv = JSON.parse(await readFile(qaEnvPath, "utf8"));
    key = qaEnv?.trello?.apiKey;
    token = qaEnv?.trello?.token;
  } catch (e) {
    die(3, `CREDS_ABSENT: cannot read trello creds from qa-env.json (${e.message})`);
  }
  if (!present(key) || !present(token)) {
    die(
      3,
      "CREDS_ABSENT: fill qa-env.json → trello.{apiKey,token} to post via REST (falling back to mcp__trello__add_comment).",
    );
  }

  // 1) attach screenshots first, so the comment can reference each by filename.
  const attached = [];
  for (const e of evidence) {
    const up = await attachImage({ cardId, key, token, path: e.path, name: e.name });
    attached.push({ name: up.name, ac: e.ac, caption: e.caption });
  }

  // 2) post the Markdown comment referencing the attachments.
  const text = renderMarkdown({ ticketKey, meta: payload.meta, result: payload.result, attached });
  const comment = await postComment({ cardId, key, token, text });

  process.stdout.write(
    `posted comment ${comment.id} on ${ticketKey} with ${attached.length} attached screenshot(s)` +
      (attached.length ? ` [${attached.map((a) => a.name).join(", ")}]` : "") +
      "\n",
  );
  process.exit(0);
}

main().catch((e) => die(1, `ERROR: ${scrub(String(e?.message ?? e))}`));
