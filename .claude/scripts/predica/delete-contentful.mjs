#!/usr/bin/env node
/**
 * delete-contentful.mjs — Delete Contentful entries/assets via the CMA. The ONLY
 * delete path in the /predica pipeline (the publisher's MCP allowlist has no
 * delete tool). Used when a sermon is regenerated in place to remove the
 * SUPERSEDED assets (old audio/PDFs/featured image) and PROVEN-ORPHAN legacy
 * bibleVerse entries, and to clean up duplicate `-N` sermon entries from earlier
 * buggy runs.
 *
 * Safety by construction:
 *   - HARD-REFUSES the `master` alias (and any `master*` env) — the same guard as
 *     create-contentful-entry.mjs / upload-contentful-asset.mjs. Writes only the
 *     `production` / `staging` ENV, never the live alias.
 *   - Deletes ONLY the explicit ids you pass (--entry-id / --asset-id, comma-sep).
 *     It never deletes by slug, title, or query — too easy to nuke the wrong thing.
 *   - Unpublish-then-delete: a published object is unpublished first (a bare DELETE
 *     on a published entry/asset returns an error), then deleted.
 *   - --guard-referenced: before deleting, refuse any id that ANYTHING OTHER than
 *     --except <id>,… still links to (links_to_entry / links_to_asset). This is
 *     what keeps SHARED bibleVerses safe — a passage cited by another sermon or by
 *     the Creed is never deleted. Guarded ids are SKIPPED (with a reason), not
 *     fatal, so the rest of the cleanup still runs.
 *
 * Auth: reads CONTENTFUL_MANAGEMENT_ACCESS_TOKEN from env, else parses .env.local
 * at the repo root. The token NAME only is referenced — never printed.
 *
 * Usage:
 *   node .claude/scripts/predica/delete-contentful.mjs --space <s> --env <e> \
 *     [--entry-id id1,id2,…] [--asset-id id1,id2,…] [--guard-referenced] [--except id1,id2,…]
 *
 * Output (stdout): a single JSON line
 *   { "ok": true|false,
 *     "deleted": { "entries": [...], "assets": [...] },
 *     "skipped": [{ "id", "type", "reason", "referrers": [...] }],
 *     "failed":  [{ "id", "type", "error" }] }
 * Exit codes: 0 success (skips are fine) · 2 usage/auth/guard error · 1 a delete failed
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CMA = "https://api.contentful.com";
const JSON_CT = "application/vnd.contentful.management.v1+json";

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// Parser that supports boolean flags (--guard-referenced) alongside --key value.
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith("--")) die(2, `unexpected arg: ${k}`);
    const key = k.slice(2);
    if (key === "guard-referenced") {
      out[key] = true;
      continue;
    }
    const v = argv[i + 1];
    if (v == null || v.startsWith("--")) die(2, `error: --${key} requires a value`);
    out[key] = v;
    i += 1;
  }
  return out;
}

const idList = (s) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

async function loadToken() {
  if (process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN)
    return process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const p = path.join(dir, ".env.local");
    if (existsSync(p)) {
      const text = await readFile(p, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*CONTENTFUL_MANAGEMENT_ACCESS_TOKEN\s*=\s*(.+)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function cma(token, method, url) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${res.statusText}\n${text}`);
  return text ? JSON.parse(text) : {};
}

/**
 * Return the ids of entries that link to the given target (excluding `except`).
 * `param` is `links_to_entry` for entries or `links_to_asset` for assets.
 */
async function referrers(token, base, param, id, except) {
  const got = await cma(token, "GET", `${base}/entries?${param}=${id}&limit=100`);
  return (got.items ?? []).map((it) => it?.sys?.id).filter((rid) => rid && !except.has(rid));
}

async function removeOne(token, base, kind, id, { guard, param, except }) {
  if (guard) {
    const refs = await referrers(token, base, param, id, except);
    if (refs.length > 0) {
      return { status: "skipped", reason: `still referenced by ${refs.length} entr${refs.length === 1 ? "y" : "ies"}`, referrers: refs };
    }
  }
  const coll = kind === "entry" ? "entries" : "assets";
  // Unpublish first if published (a bare DELETE on a published object errors).
  const current = await cma(token, "GET", `${base}/${coll}/${id}`);
  if (current?.sys?.publishedVersion != null) {
    await cma(token, "DELETE", `${base}/${coll}/${id}/published`);
  }
  await cma(token, "DELETE", `${base}/${coll}/${id}`);
  return { status: "deleted" };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const r of ["space", "env"]) if (!a[r]) die(2, `error: --${r} is required`);
  if (a.env === "master" || /^master(-|$)/.test(a.env)) {
    die(
      2,
      `error: refusing to write to protected environment '${a.env}'. Use 'production' or 'staging' (never the master alias).`,
    );
  }

  const entryIds = idList(a["entry-id"]);
  const assetIds = idList(a["asset-id"]);
  if (entryIds.length === 0 && assetIds.length === 0)
    die(2, "error: pass at least one --entry-id or --asset-id (comma-separated)");

  const guard = Boolean(a["guard-referenced"]);
  const except = new Set(idList(a.except));

  const token = await loadToken();
  if (!token) die(2, "error: CONTENTFUL_MANAGEMENT_ACCESS_TOKEN not found in env or .env.local");

  const base = `${CMA}/spaces/${a.space}/environments/${a.env}`;
  const deleted = { entries: [], assets: [] };
  const skipped = [];
  const failed = [];

  for (const [kind, ids, param, bucket] of [
    ["entry", entryIds, "links_to_entry", deleted.entries],
    ["asset", assetIds, "links_to_asset", deleted.assets],
  ]) {
    for (const id of ids) {
      try {
        const r = await removeOne(token, base, kind, id, { guard, param, except });
        if (r.status === "deleted") bucket.push(id);
        else skipped.push({ id, type: kind, reason: r.reason, referrers: r.referrers });
      } catch (e) {
        failed.push({ id, type: kind, error: e.message });
      }
    }
  }

  const ok = failed.length === 0;
  process.stdout.write(JSON.stringify({ ok, deleted, skipped, failed }) + "\n");
  process.exit(ok ? 0 : 1);
}

main();
