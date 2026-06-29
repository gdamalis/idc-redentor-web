import type { Collection } from "mongodb";

import { connect } from "../database.service";

export type ClaimResult = "claimed" | "already-sent" | "error";

type BroadcastLogStatus = "sending" | "sent" | "failed";

interface BroadcastLogDocument {
  broadcastId: string;
  status: BroadcastLogStatus;
  campaignId?: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}

const DB_NAME = "website";
const COLLECTION = "broadcast_log";

let indexEnsured: Promise<unknown> | null = null;

function ensureBroadcastIndex(col: Collection<BroadcastLogDocument>): Promise<unknown> {
  if (!indexEnsured) {
    indexEnsured = col
      .createIndex({ broadcastId: 1 }, { unique: true })
      .catch((error: unknown) => {
        indexEnsured = null; // allow a retry on the next claim
        throw error;
      });
  }
  return indexEnsured;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function logError(op: string, broadcastId: string, error: unknown): void {
  console.error(
    `[broadcast] ${op} failed for ${broadcastId}:`,
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Insert-first claim with race-safe deduplication.
 *
 * Filter semantics:
 *   - No doc for this broadcastId → no match → upsert inserts → "claimed" (first run).
 *   - Doc with status "failed" → matches → atomically flipped to "sending" → "claimed" (retry).
 *   - Doc with status "sent" or "sending" → no match → upsert attempts insert → unique-index
 *     E11000 → caught → "already-sent".  Both statuses are blocked, so a concurrent in-flight
 *     "sending" doc is indistinguishable from a completed "sent" doc: neither can be re-claimed.
 *
 * Only an explicitly FAILED prior attempt is re-claimable.
 */
export async function claimBroadcast(broadcastId: string): Promise<ClaimResult> {
  const client = await connect();
  if (!client) return "error";
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    await ensureBroadcastIndex(col);
    const now = new Date();
    await col.updateOne(
      { broadcastId, status: "failed" },
      {
        $set: { status: "sending", updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return "claimed";
  } catch (error) {
    if (isDuplicateKeyError(error)) return "already-sent";
    logError("claim", broadcastId, error);
    return "error";
  }
}

export async function markSent(broadcastId: string, campaignId: string): Promise<void> {
  const client = await connect();
  if (!client) return;
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    const now = new Date();
    await col.updateOne(
      { broadcastId },
      { $set: { status: "sent", campaignId, sentAt: now, updatedAt: now } },
    );
  } catch (error) {
    logError("markSent", broadcastId, error);
  }
}

export async function markFailed(broadcastId: string, reason: string): Promise<void> {
  const client = await connect();
  if (!client) return;
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    await col.updateOne(
      { broadcastId },
      { $set: { status: "failed", reason, updatedAt: new Date() } },
    );
  } catch (error) {
    logError("markFailed", broadcastId, error);
  }
}
