#!/usr/bin/env node
/**
 * sync-entries.mjs — Copy entries + assets between two Contentful environments
 * via the CMA. The free-tier replacement for Contentful Launch (paid) and the
 * complement to the Merge app (which moves the content MODEL only, never entries).
 *
 * Mental model (docs/contentful-environments.md): content lives in production;
 * models are forged in staging. Content flows DOWN (production -> staging) to
 * refresh; entries are promoted UP (staging -> production) only at a model
 * cutover. Default direction is the refresh: production -> staging.
 *
 * SAFETY:
 *   - Dry-run is the DEFAULT. Writes require --apply.
 *   - Refuses the `master` alias by name (sync env ids, never the alias).
 *   - `--to production` requires --apply AND a typed confirmation
 *     (or CONTENTFUL_SYNC_ASSUME_YES=1 for non-interactive promotion).
 *   - Model-compatibility gate aborts if a copied type is missing or shaped
 *     differently in the target (unless --skip-model-check).
 *   - Conflict guard: never overwrites a target item edited more recently than
 *     the source without --force.
 *
 * Publish policy:
 *   - production -> staging (refresh): MIRROR the source publish state.
 *   - staging -> production (promote): create as DRAFT; publish only with --publish.
 *
 * Usage:
 *   node scripts/contentful/sync-entries.mjs                 # dry-run prod->staging
 *   node scripts/contentful/sync-entries.mjs --apply         # apply prod->staging refresh
 *   node scripts/contentful/sync-entries.mjs --from staging --to production --ids a,b --apply
 *
 * Env: CONTENTFUL_SPACE_ID, CONTENTFUL_MANAGEMENT_ACCESS_TOKEN,
 *      (optional) NEXT_PUBLIC_BASE_URL + CONTENTFUL_REVALIDATE_SECRET for revalidate.
 */
import { createClient } from "contentful-management";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";

// ============================ pure helpers (unit-tested) ============================

export function parseArgs(argv) {
  const opts = {
    from: "production",
    to: "staging",
    apply: false,
    contentTypes: [],
    ids: null,
    publish: false,
    allowDeletes: false,
    force: false,
    assets: true,
    modelCheck: true,
    revalidate: null, // null => auto: on when target === production
  };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (!tok.startsWith("--")) throw new Error(`unexpected argument: ${tok}`);
    const key = tok.slice(2);
    if (key === "from") opts.from = argv[(i += 1)];
    else if (key === "to") opts.to = argv[(i += 1)];
    else if (key === "content-type") opts.contentTypes.push(argv[(i += 1)]);
    else if (key === "ids")
      opts.ids = argv[(i += 1)]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (key === "apply") opts.apply = true;
    else if (key === "publish") opts.publish = true;
    else if (key === "allow-deletes") opts.allowDeletes = true;
    else if (key === "force") opts.force = true;
    else if (key === "no-assets") opts.assets = false;
    else if (key === "skip-model-check") opts.modelCheck = false;
    else if (key === "revalidate") opts.revalidate = true;
    else if (key === "no-revalidate") opts.revalidate = false;
    else throw new Error(`unknown flag: --${key}`);
  }
  if (opts.revalidate === null) opts.revalidate = opts.to === "production";
  return opts;
}

const ALIAS_RE = /^master(-|$)/;

export function assertGuards(opts) {
  if (opts.from === opts.to)
    throw new Error(`--from and --to must differ (both '${opts.from}')`);
  for (const [flag, env] of [
    ["--from", opts.from],
    ["--to", opts.to],
  ]) {
    if (ALIAS_RE.test(env)) {
      throw new Error(
        `refusing to sync the '${env}' alias via ${flag}; pass an environment id (production|staging), never the master alias`,
      );
    }
  }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function diffById(sourceItems, targetItems) {
  const target = new Map(targetItems.map((t) => [t.id, t]));
  const created = [];
  const changed = [];
  const unchanged = [];
  const seen = new Set();
  for (const s of sourceItems) {
    seen.add(s.id);
    const t = target.get(s.id);
    if (!t) {
      created.push(s);
      continue;
    }
    const differs =
      canonical(s.fields) !== canonical(t.fields) ||
      !!s.published !== !!t.published;
    (differs ? changed : unchanged).push({ source: s, target: t });
  }
  const deleted = targetItems.filter((t) => !seen.has(t.id));
  return { created, changed, unchanged, deleted };
}

export function compareContentTypes(sourceTypes, targetTypes, typeIds) {
  const sMap = new Map(sourceTypes.map((t) => [t.id, t]));
  const tMap = new Map(targetTypes.map((t) => [t.id, t]));
  const problems = [];
  const ids =
    typeIds && typeIds.length ? typeIds : sourceTypes.map((t) => t.id);
  const sig = (f) =>
    `${f.type}/${f.linkType ?? "-"}/${f.items?.type ?? "-"}/${f.items?.linkType ?? "-"}`;
  for (const id of ids) {
    const s = sMap.get(id);
    if (!s) continue; // source has no such type — nothing to copy for it
    const t = tMap.get(id);
    if (!t) {
      problems.push(`content type '${id}' is missing in target`);
      continue;
    }
    const tf = new Map(t.fields.map((f) => [f.id, f]));
    for (const sf of s.fields) {
      const mf = tf.get(sf.id);
      if (!mf) {
        problems.push(`type '${id}': field '${sf.id}' missing in target`);
        continue;
      }
      if (sig(sf) !== sig(mf)) {
        problems.push(
          `type '${id}': field '${sf.id}' shape differs (source ${sig(sf)} vs target ${sig(mf)})`,
        );
      }
    }
  }
  return { compatible: problems.length === 0, problems };
}

export function resolvePublishAction({
  direction,
  sourcePublished,
  publishFlag,
}) {
  if (direction === "promote") return publishFlag ? "publish" : "draft";
  return sourcePublished ? "publish" : "leave"; // refresh: mirror source
}

export function directionOf(opts) {
  return opts.to === "production" ? "promote" : "refresh";
}

// ============================ CMA I/O (integration; smoke-tested) ============================

const ctOf = (entry) => entry?.sys?.contentType?.sys?.id;
const isPublished = (sys) => Boolean(sys?.publishedVersion);
const toEntryItem = (e) => ({
  id: e.sys.id,
  fields: e.fields,
  published: isPublished(e.sys),
  updatedAt: e.sys.updatedAt,
  contentType: ctOf(e),
  raw: e,
});
const toAssetItem = (a) => ({
  id: a.sys.id,
  fields: a.fields,
  published: isPublished(a.sys),
  updatedAt: a.sys.updatedAt,
  raw: a,
});

async function getAll(fn, args) {
  const out = [];
  let skip = 0;
  for (;;) {
    const r = await fn({
      ...args,
      query: { ...(args.query ?? {}), limit: 100, skip },
    });
    out.push(...r.items);
    if (skip + 100 >= r.total) break;
    skip += 100;
  }
  return out;
}

async function fetchEntries(client, base, opts) {
  const query = {};
  if (opts.contentTypes.length === 1) query.content_type = opts.contentTypes[0];
  if (opts.ids) query["sys.id[in]"] = opts.ids.join(",");
  let items = await getAll((a) => client.entry.getMany(a), { ...base, query });
  if (opts.contentTypes.length > 1) {
    const set = new Set(opts.contentTypes);
    items = items.filter((e) => set.has(ctOf(e)));
  }
  return items;
}

async function fetchAssets(client, base, opts) {
  const query = {};
  if (opts.ids) query["sys.id[in]"] = opts.ids.join(",");
  return getAll((a) => client.asset.getMany(a), { ...base, query });
}

async function fetchContentTypes(client, base) {
  return getAll((a) => client.contentType.getMany(a), base);
}

async function upsertAsset(client, base, source, action) {
  const fields = JSON.parse(JSON.stringify(source.fields));
  for (const f of Object.values(fields.file ?? {})) {
    if (f?.url) {
      f.upload = f.url.startsWith("//") ? `https:${f.url}` : f.url;
      delete f.url;
      delete f.details;
    }
  }
  let target = null;
  try {
    target = await client.asset.get({ ...base, assetId: source.sys.id });
  } catch {
    target = null;
  }
  let saved;
  if (!target) {
    saved = await client.asset.createWithId(
      { ...base, assetId: source.sys.id },
      { fields },
    );
  } else {
    target.fields = fields;
    saved = await client.asset.update(
      { ...base, assetId: source.sys.id },
      target,
    );
  }
  saved = await client.asset.processForAllLocales(base, saved);
  if (action === "publish") {
    let fresh = await client.asset.get({ ...base, assetId: saved.sys.id });
    const fileLocales = Object.keys(fresh.fields.file ?? {});
    const isProcessed = (a) =>
      fileLocales.length === 0 ||
      Object.values(a.fields.file ?? {}).every((f) => f?.url);
    for (let i = 0; i < 30 && !isProcessed(fresh); i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      fresh = await client.asset.get({ ...base, assetId: saved.sys.id });
    }
    if (!isProcessed(fresh)) {
      throw new Error(
        `asset ${saved.sys.id} did not finish processing in time (30s timeout)`,
      );
    }
    await client.asset.publish({ ...base, assetId: saved.sys.id }, fresh);
  }
  return saved;
}

async function upsertEntry(client, base, source, action) {
  const contentTypeId = ctOf(source);
  let target = null;
  try {
    target = await client.entry.get({ ...base, entryId: source.sys.id });
  } catch {
    target = null;
  }
  let saved;
  if (!target) {
    saved = await client.entry.createWithId(
      { ...base, entryId: source.sys.id, contentTypeId },
      { fields: source.fields },
    );
  } else {
    target.fields = source.fields;
    saved = await client.entry.update(
      { ...base, entryId: source.sys.id },
      target,
    );
  }
  if (action === "publish") {
    await client.entry.publish({ ...base, entryId: saved.sys.id }, saved);
  }
  return saved;
}

async function confirmProd(opts) {
  if (opts.to !== "production") return true;
  if (process.env.CONTENTFUL_SYNC_ASSUME_YES === "1") return true;
  if (!process.stdin.isTTY) {
    throw new Error(
      "--to production requires a TTY confirmation or CONTENTFUL_SYNC_ASSUME_YES=1",
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) =>
    rl.question(
      `Apply changes to PRODUCTION (${opts.from} -> production)? type 'yes': `,
      res,
    ),
  );
  rl.close();
  return answer.trim() === "yes";
}

async function revalidate() {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  const secret = process.env.CONTENTFUL_REVALIDATE_SECRET;
  if (!base || !secret) {
    console.warn(
      "revalidate skipped: NEXT_PUBLIC_BASE_URL or CONTENTFUL_REVALIDATE_SECRET unset",
    );
    return;
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "x-vercel-reval-key": secret },
    });
    console.log(`revalidate -> ${res.status} ${res.statusText}`);
  } catch (e) {
    console.warn(`revalidate failed (non-fatal): ${e.message}`);
  }
}

function report(label, diff) {
  console.log(
    `\n${label}: ${diff.created.length} new, ${diff.changed.length} changed, ${diff.unchanged.length} unchanged, ${diff.deleted.length} only-in-target`,
  );
  for (const i of diff.created)
    console.log(
      `  [new]     ${i.id}${i.contentType ? ` (${i.contentType})` : ""}`,
    );
  for (const c of diff.changed)
    console.log(
      `  [changed] ${c.source.id}${c.source.contentType ? ` (${c.source.contentType})` : ""}`,
    );
  for (const i of diff.deleted)
    console.log(`  [target]  ${i.id} (absent in source)`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertGuards(opts);

  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const token = process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  if (!spaceId || !token) {
    console.error(
      "error: CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_ACCESS_TOKEN are required",
    );
    process.exit(2);
  }
  const client = createClient({ accessToken: token }, { type: "plain" });
  const src = { spaceId, environmentId: opts.from };
  const dst = { spaceId, environmentId: opts.to };
  const direction = directionOf(opts);
  console.log(
    `sync-entries: ${opts.from} -> ${opts.to} (${direction})${opts.apply ? " [APPLY]" : " [dry-run]"}`,
  );

  // 1. Model-compatibility gate.
  if (opts.modelCheck) {
    const [sCT, tCT] = await Promise.all([
      fetchContentTypes(client, src),
      fetchContentTypes(client, dst),
    ]);
    const norm = (list) =>
      list.map((t) => ({
        id: t.sys.id,
        fields: (t.fields ?? []).map((f) => ({
          id: f.id,
          type: f.type,
          linkType: f.linkType,
          required: f.required,
          items: f.items,
        })),
      }));
    const typeIds = opts.contentTypes.length ? opts.contentTypes : null;
    const { compatible, problems } = compareContentTypes(
      norm(sCT),
      norm(tCT),
      typeIds,
    );
    if (!compatible) {
      console.error(
        "\nMODEL MISMATCH — aborting (use --skip-model-check to override):",
      );
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(3);
    }
    console.log("model-compatibility: OK");
  }

  // 2. Fetch + diff.
  const [srcEntries, tgtEntries] = await Promise.all([
    fetchEntries(client, src, opts),
    fetchEntries(client, dst, opts),
  ]);
  const entryDiff = diffById(
    srcEntries.map(toEntryItem),
    tgtEntries.map(toEntryItem),
  );
  report("entries", entryDiff);

  let assetDiff = { created: [], changed: [], unchanged: [], deleted: [] };
  if (opts.assets) {
    const [srcAssets, tgtAssets] = await Promise.all([
      fetchAssets(client, src, opts),
      fetchAssets(client, dst, opts),
    ]);
    assetDiff = diffById(
      srcAssets.map(toAssetItem),
      tgtAssets.map(toAssetItem),
    );
    report("assets", assetDiff);
  }

  if (!opts.apply) {
    console.log(
      "\ndry-run — nothing written. Re-run with --apply to perform the sync.",
    );
    return;
  }
  if (!(await confirmProd(opts))) {
    console.log("aborted by user.");
    process.exit(1);
  }

  // 3. Conflict filter for changed items (target newer than source unless --force).
  const newer = (c) =>
    Date.parse(c.target.updatedAt) > Date.parse(c.source.updatedAt);
  const pickChanged = (diff) => {
    const apply = [];
    for (const c of diff.changed) {
      if (newer(c) && !opts.force) {
        console.warn(
          `  [skip] ${c.source.id}: target newer than source (use --force to overwrite)`,
        );
      } else {
        apply.push(c.source);
      }
    }
    return apply;
  };

  // 4. Apply — assets first (entries link to them), then entries.
  let counts = { created: 0, updated: 0, published: 0, deleted: 0, errors: 0 };
  if (opts.assets) {
    for (const a of [...assetDiff.created, ...pickChanged(assetDiff)]) {
      const action = resolvePublishAction({
        direction,
        sourcePublished: a.published,
        publishFlag: opts.publish,
      });
      try {
        await upsertAsset(client, dst, a.raw, action);
        counts[assetDiff.created.includes(a) ? "created" : "updated"] += 1;
        if (action === "publish") counts.published += 1;
        console.log(`  [asset ${action}] ${a.id}`);
      } catch (e) {
        counts.errors += 1;
        console.error(`  [asset ERR] ${a.id}: ${e.message}`);
      }
    }
  }
  for (const en of [...entryDiff.created, ...pickChanged(entryDiff)]) {
    const action = resolvePublishAction({
      direction,
      sourcePublished: en.published,
      publishFlag: opts.publish,
    });
    try {
      await upsertEntry(client, dst, en.raw, action);
      counts[entryDiff.created.includes(en) ? "created" : "updated"] += 1;
      if (action === "publish") counts.published += 1;
      console.log(`  [entry ${action}] ${en.id} (${en.contentType})`);
    } catch (e) {
      counts.errors += 1;
      console.error(`  [entry ERR] ${en.id}: ${e.message}`);
    }
  }

  // 5. Deletions (opt-in).
  if (opts.assets) {
    if (opts.allowDeletes) {
      for (const a of assetDiff.deleted) {
        try {
          if (a.published)
            await client.asset.unpublish({ ...dst, assetId: a.id });
          await client.asset.delete({ ...dst, assetId: a.id });
          counts.deleted += 1;
          console.log(`  [asset delete] ${a.id}`);
        } catch (e) {
          counts.errors += 1;
          console.error(`  [asset del ERR] ${a.id}: ${e.message}`);
        }
      }
    } else if (assetDiff.deleted.length) {
      console.log(
        `\n${assetDiff.deleted.length} assets exist only in target; pass --allow-deletes to remove them.`,
      );
    }
  }
  if (opts.allowDeletes) {
    for (const en of entryDiff.deleted) {
      try {
        if (en.published)
          await client.entry.unpublish({ ...dst, entryId: en.id });
        await client.entry.delete({ ...dst, entryId: en.id });
        counts.deleted += 1;
        console.log(`  [entry delete] ${en.id}`);
      } catch (e) {
        counts.errors += 1;
        console.error(`  [entry del ERR] ${en.id}: ${e.message}`);
      }
    }
  } else if (entryDiff.deleted.length) {
    console.log(
      `\n${entryDiff.deleted.length} entries exist only in target; pass --allow-deletes to remove them.`,
    );
  }

  // 6. Revalidate after a production apply.
  if (opts.revalidate) await revalidate();

  console.log(
    `\nDONE: ${counts.created} created, ${counts.updated} updated, ${counts.published} published, ${counts.deleted} deleted, ${counts.errors} errors`,
  );
  if (counts.errors) process.exit(1);
}

const invokedAsScript =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(1);
  });
}
