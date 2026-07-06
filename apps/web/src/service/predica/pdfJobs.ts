import type { Collection } from "mongodb";

import { connect } from "../database.service";

export interface PdfJob {
  entryId: string; // Contentful sermon entry id — UNIQUE key
  dirtyAt: Date; // last edit-webhook time (debounce anchor)
  contentHash: string; // hash of PDF-relevant fields at last webhook
  lastRenderedHash?: string; // contentHash at last successful render (skip no-ops)
  version: number; // monotonic; rendered into footer + asset title. Starts 0; first render → 1
  status: "idle" | "rendering";
  lockedAt?: Date; // for stale-lock recovery
  lastRenderedAt?: Date;
  lastError?: string;
}

const DB_NAME = "website";
const COLLECTION = "pdf_jobs";
const DEFAULT_QUIET_WINDOW_SECONDS = 90;

/** How long a "rendering" lock is honored before it's considered abandoned and reclaimable. */
export const STALE_LOCK_MS = 5 * 60 * 1000;

let indexEnsured: Promise<unknown> | null = null;

function ensureIndex(col: Collection<PdfJob>): Promise<unknown> {
  if (!indexEnsured) {
    indexEnsured = col.createIndex({ entryId: 1 }, { unique: true }).catch((error: unknown) => {
      indexEnsured = null; // allow a retry on the next call
      throw error;
    });
  }
  return indexEnsured;
}

function logError(op: string, entryId: string, error: unknown): void {
  console.error(
    `[predica/pdfJobs] ${op} failed for ${entryId}:`,
    error instanceof Error ? error.message : String(error),
  );
}

function isLockStale(lockedAt: Date | undefined, now: Date, staleLockMs: number): boolean {
  if (!lockedAt) return true;
  return now.getTime() - lockedAt.getTime() >= staleLockMs;
}

/**
 * Pure predicate — no Mongo. Authoritative source of truth for whether a job should be
 * (re)rendered right now. Mirrors the cron's selection semantics so tests never need a DB.
 */
export function isRenderable(
  job: PdfJob,
  now: Date,
  quietWindowMs: number,
  staleLockMs: number,
): boolean {
  if (job.contentHash === job.lastRenderedHash) return false;
  if (now.getTime() - job.dirtyAt.getTime() < quietWindowMs) return false;
  if (job.status === "idle") return true;
  // status === "rendering": only renderable if the lock has gone stale (abandoned by a crashed tick).
  return isLockStale(job.lockedAt, now, staleLockMs);
}

/** Monotonic version bump; a missing/undefined version is treated as 0. */
export function nextVersion(job: PdfJob): number {
  return (job.version ?? 0) + 1;
}

/** Reads `PDF_REGEN_QUIET_WINDOW_SECONDS` (default 90s); a non-numeric value falls back to the default. */
export function resolveQuietWindowMs(): number {
  const raw = process.env.PDF_REGEN_QUIET_WINDOW_SECONDS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUIET_WINDOW_SECONDS;
  return seconds * 1000;
}

async function getCollection(): Promise<Collection<PdfJob> | undefined> {
  const client = await connect();
  if (!client) return undefined;
  const col = client.db(DB_NAME).collection<PdfJob>(COLLECTION);
  await ensureIndex(col);
  return col;
}

/**
 * Idempotent dirty-mark: bumps `dirtyAt`/`contentHash` (upserting a fresh job on first webhook)
 * without ever touching `lastRenderedHash` — that field is only ever set by `completeJob`.
 * Returns `true` once the upsert succeeds; returns `false` when Mongo is unavailable
 * (`getCollection()` yields `undefined`) or the upsert throws — the caller (the regen webhook
 * route) uses `false` to 5xx so Contentful retries the delivery instead of silently dropping it.
 */
export async function markDirty(entryId: string, contentHash: string): Promise<boolean> {
  try {
    const col = await getCollection();
    if (!col) return false;
    const now = new Date();
    await col.updateOne(
      { entryId },
      {
        $set: { dirtyAt: now, contentHash },
        $setOnInsert: { version: 0, status: "idle" },
      },
      { upsert: true },
    );
    return true;
  } catch (error) {
    logError("markDirty", entryId, error);
    return false;
  }
}

/**
 * Fetches candidate jobs and filters via `isRenderable` (the authoritative predicate). The Mongo
 * query below is a pre-filter for efficiency only — it must stay a superset of `isRenderable`.
 */
export async function selectRenderableJobs(now: Date): Promise<PdfJob[]> {
  try {
    const col = await getCollection();
    if (!col) return [];
    const quietWindowMs = resolveQuietWindowMs();
    const cursor = col.find({
      $expr: { $ne: ["$contentHash", "$lastRenderedHash"] },
    });
    const candidates = await cursor.toArray();
    return candidates.filter((job) => isRenderable(job, now, quietWindowMs, STALE_LOCK_MS));
  } catch (error) {
    logError("selectRenderableJobs", "*", error);
    return [];
  }
}

/**
 * Atomic race-safe claim: locks the job ONLY if it is still idle-and-renderable, or its prior
 * "rendering" lock has gone stale. Returns true iff THIS call won the claim — mirrors
 * `broadcastLog.claimBroadcast`'s pattern so overlapping cron ticks can't double-render.
 */
export async function claimJob(entryId: string, now: Date): Promise<boolean> {
  try {
    const col = await getCollection();
    if (!col) return false;
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
    const result = await col.findOneAndUpdate(
      {
        entryId,
        $expr: { $ne: ["$contentHash", "$lastRenderedHash"] },
        $or: [{ status: "idle" }, { status: "rendering", lockedAt: { $lte: staleBefore } }],
      },
      { $set: { status: "rendering", lockedAt: now } },
    );
    return Boolean(result);
  } catch (error) {
    logError("claimJob", entryId, error);
    return false;
  }
}

/** Marks a successful render: advances `lastRenderedHash`/`version`, releases the lock. */
export async function completeJob(
  entryId: string,
  renderedHash: string,
  version: number,
  now: Date,
): Promise<void> {
  try {
    const col = await getCollection();
    if (!col) return;
    await col.updateOne(
      { entryId },
      {
        $set: {
          lastRenderedHash: renderedHash,
          version,
          status: "idle",
          lastRenderedAt: now,
        },
        $unset: { lockedAt: "", lastError: "" },
      },
    );
  } catch (error) {
    logError("completeJob", entryId, error);
  }
}

/**
 * Records a render failure: releases the lock back to "idle" without touching
 * `lastRenderedHash`, so the next cron tick retries. Never leaves a job wedged in "rendering".
 *
 * `now` is accepted (not just `error`) to keep this function's call shape consistent with its
 * sibling transitions (`claimJob`/`completeJob`), even though today's `$set` doesn't need it.
 */
export async function failJob(entryId: string, error: string, now: Date): Promise<void> {
  void now;
  try {
    const col = await getCollection();
    if (!col) return;
    await col.updateOne(
      { entryId },
      {
        $set: { status: "idle", lastError: error },
        $unset: { lockedAt: "" },
      },
    );
  } catch (dbError) {
    logError("failJob", entryId, dbError);
  }
}

/** Drops the job doc — used when the underlying Contentful entry disappears mid-flight. */
export async function dropJob(entryId: string): Promise<void> {
  try {
    const col = await getCollection();
    if (!col) return;
    await col.deleteOne({ entryId });
  } catch (error) {
    logError("dropJob", entryId, error);
  }
}
