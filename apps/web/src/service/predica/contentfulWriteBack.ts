/**
 * CMA write-back service for the sermon PDF regen webhook (ICR-114, CP6).
 *
 * The first Contentful Management (CMA) write token used inside the app runtime
 * (every other CMA write in this repo lives in the local, human-run
 * `.claude/scripts/predica/*.mjs` scripts). This module mirrors those scripts'
 * safety invariants exactly, via the `contentful-management` plain client instead
 * of hand-rolled `fetch`:
 *
 *  - **Never targets `master`** (or any `master*` env) — the CMA write path always
 *    targets the concrete `production` environment (or `staging`, if ever passed
 *    explicitly via `CONTENTFUL_ENVIRONMENT`). The app's READ path
 *    (`lib/contentful/fetch.ts`) defaults to the `master` ALIAS; this write path
 *    defaults to `production` instead and refuses `master*` outright.
 *  - **Never publishes.** Every export below creates/updates/deletes DRAFT content
 *    and stops — a human reviews + Publishes in Contentful (Gate 2 of `/predica`).
 *  - **Fails closed** when the management token or space id isn't configured, and
 *    never echoes the token — even in a downstream SDK error message (`redact`).
 *
 * See `.claude/scripts/predica/{upload-contentful-asset,create-contentful-entry,
 * delete-contentful}.mjs` for the raw-fetch operations this mirrors, and
 * `docs/architecture/contentful-environments.md` for the environment topology.
 */
import { createClient } from "contentful-management";
import type { PlainClientAPI } from "contentful-management";

import type { SupportedLocale } from "@src/utils/predica/helpers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetLink {
  sys: { type: "Link"; linkType: "Asset"; id: string };
}

/** The subset of sermon entry fields this service reads/writes. */
interface SermonEntryFields extends Record<string, unknown> {
  pdfSummary?: Partial<Record<SupportedLocale, AssetLink>>;
}

export interface UploadPdfAssetParams {
  buffer: Buffer;
  fileName: string;
  /** Full asset title, e.g. "<sermon title> — PDF <locale> · v<N>" (caller builds it). */
  title: string;
  locale: SupportedLocale;
}
export type UploadPdfAssetResult = { ok: true; assetId: string } | { ok: false; reason: string };

export interface SwapPdfSummaryParams {
  entryId: string;
  locale: SupportedLocale;
  assetId: string;
}
export type SwapPdfSummaryResult =
  | { ok: true; previousAssetId?: string }
  | { ok: false; reason: string };

export interface DeleteSupersededAssetParams {
  assetId: string;
  /** The entry allowed to still reference this asset (the one that now owns it via the swap). */
  exceptEntryId?: string;
}
export type DeleteSupersededAssetResult =
  | { ok: true; deleted: boolean; skippedReason?: string }
  | { ok: false; reason: string };

// ── Client guard (master-refusal + token/space hygiene) ──────────────────────

const PROTECTED_ENVIRONMENT_PATTERN = /^master(-|$)/;
const DEFAULT_CMA_ENVIRONMENT = "production";

/** `CONTENTFUL_ENVIRONMENT`, defaulting to `production` (never `master`) for CMA writes. */
function resolveCmaEnvironment(): string {
  const raw = process.env.CONTENTFUL_ENVIRONMENT?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_CMA_ENVIRONMENT;
}

/**
 * `AssetFileProp.fields.file[locale].file` is typed `string | ArrayBuffer | Stream` — a Node
 * `Buffer` is neither, structurally, in the SDK's declared types (a known typing gap; Buffer
 * works fine at runtime). Copy into a genuine `ArrayBuffer` so this type-checks without a cast
 * and without switching to an unverified streaming code path for a single-shot PDF upload.
 */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

/** Strips any occurrence of the raw token out of an error message before it's ever returned/logged. */
function redact(message: string, token: string | undefined): string {
  if (!token) return message;
  return message.split(token).join("***");
}

function describeError(error: unknown, token: string | undefined): string {
  const message = error instanceof Error ? error.message : String(error);
  const safe = redact(message, token);
  console.error("[predica/contentfulWriteBack] CMA call failed:", safe);
  return safe;
}

interface CmaGuard {
  client: PlainClientAPI;
  token: string;
}
type CmaGuardResult = { ok: true; guard: CmaGuard } | { ok: false; reason: string };

/**
 * Builds the plain CMA client, or fails closed BEFORE any client is constructed.
 * Order matters: the master-refusal check runs first, so a protected environment
 * never reaches `createClient` regardless of token/space configuration.
 */
function buildCmaClient(): CmaGuardResult {
  const environmentId = resolveCmaEnvironment();
  if (PROTECTED_ENVIRONMENT_PATTERN.test(environmentId)) {
    return {
      ok: false,
      reason: `refusing to write to protected environment '${environmentId}'`,
    };
  }

  const accessToken = process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  if (!accessToken) {
    return { ok: false, reason: "CONTENTFUL_MANAGEMENT_ACCESS_TOKEN is not configured" };
  }

  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  if (!spaceId) {
    return { ok: false, reason: "CONTENTFUL_SPACE_ID is not configured" };
  }

  const client = createClient(
    { accessToken },
    { type: "plain", defaults: { spaceId, environmentId } },
  );
  return { ok: true, guard: { client, token: accessToken } };
}

// ── uploadPdfAsset ─────────────────────────────────────────────────────────────

/** Creates a DRAFT PDF asset and processes it for one locale. No publish call. */
export async function uploadPdfAsset(
  params: UploadPdfAssetParams,
): Promise<UploadPdfAssetResult> {
  const guardResult = buildCmaClient();
  if (!guardResult.ok) return { ok: false, reason: guardResult.reason };
  const { client, token } = guardResult.guard;

  try {
    const created = await client.asset.createFromFiles(
      {},
      {
        fields: {
          title: { [params.locale]: params.title },
          description: { [params.locale]: params.title },
          file: {
            [params.locale]: {
              contentType: "application/pdf",
              fileName: params.fileName,
              file: toArrayBuffer(params.buffer),
            },
          },
        },
      },
    );
    // processForLocale polls until fields.file[locale].url is populated (or throws
    // AssetProcessingTimeout) — no manual polling needed on our side.
    const processed = await client.asset.processForLocale({}, created, params.locale);
    return { ok: true, assetId: processed.sys.id };
  } catch (error) {
    return { ok: false, reason: describeError(error, token) };
  }
}

// ── swapPdfSummary ────────────────────────────────────────────────────────────

/**
 * Points `fields.pdfSummary[locale]` at the new asset, in place — leaving the
 * other locale's link untouched — and returns the PREVIOUS asset id (if any) so
 * the caller can delete it afterward (`deleteSupersededAsset`). No publish call.
 */
export async function swapPdfSummary(
  params: SwapPdfSummaryParams,
): Promise<SwapPdfSummaryResult> {
  const guardResult = buildCmaClient();
  if (!guardResult.ok) return { ok: false, reason: guardResult.reason };
  const { client, token } = guardResult.guard;

  try {
    const entry = await client.entry.get<SermonEntryFields>({ entryId: params.entryId });
    const previousAssetId = entry.fields.pdfSummary?.[params.locale]?.sys?.id;

    entry.fields.pdfSummary = {
      ...entry.fields.pdfSummary,
      [params.locale]: { sys: { type: "Link", linkType: "Asset", id: params.assetId } },
    };

    await client.entry.update({ entryId: params.entryId }, entry);

    return { ok: true, previousAssetId };
  } catch (error) {
    return { ok: false, reason: describeError(error, token) };
  }
}

// ── deleteSupersededAsset ─────────────────────────────────────────────────────

/**
 * Guard-referenced delete: refuses to delete an asset that any entry OTHER than
 * `exceptEntryId` still links to. For a PUBLISHED asset, skips the delete entirely
 * (draft-only cleanup) — the swap above only ever touches the DRAFT entry, so an
 * already-published sermon's LIVE version may still be serving this asset. Only
 * draft-only (never-published) assets are actually deleted. Mirrors
 * `delete-contentful.mjs --guard-referenced`.
 */
export async function deleteSupersededAsset(
  params: DeleteSupersededAssetParams,
): Promise<DeleteSupersededAssetResult> {
  const guardResult = buildCmaClient();
  if (!guardResult.ok) return { ok: false, reason: guardResult.reason };
  const { client, token } = guardResult.guard;

  try {
    const referrers = await client.entry.getMany({
      query: { links_to_asset: params.assetId, limit: 100 },
    });
    const stillReferenced = referrers.items.some((item) => item.sys.id !== params.exceptEntryId);
    if (stillReferenced) {
      return { ok: true, deleted: false, skippedReason: "still-referenced" };
    }

    const asset = await client.asset.get({ assetId: params.assetId });
    if (asset.sys.publishedVersion != null) {
      // The old asset is PUBLISHED, so the LIVE (published) version of the sermon may
      // still serve it — the draft-only swap above never touched the published entry.
      // Deleting/unpublishing it here would break the PDF on the live page until a human
      // re-publishes. Leave it; a later regen (once it's no longer published) or a human
      // (delete-contentful.mjs) cleans it up. (Codex PR #81 P1.)
      return { ok: true, deleted: false, skippedReason: "published-asset" };
    }
    await client.asset.delete({ assetId: params.assetId });
    return { ok: true, deleted: true };
  } catch (error) {
    return { ok: false, reason: describeError(error, token) };
  }
}
