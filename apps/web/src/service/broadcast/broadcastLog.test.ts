import { beforeEach, describe, expect, it, vi } from "vitest";

const updateOne = vi.fn();
const createIndex = vi.fn();
const collection = vi.fn(() => ({ updateOne, createIndex }));
const db = vi.fn(() => ({ collection }));

vi.mock("../database.service", () => ({ connect: vi.fn() }));

import { connect } from "../database.service";
import { claimBroadcast, markFailed, markSent } from "./broadcastLog";

const mockedConnect = vi.mocked(connect);

beforeEach(() => {
  vi.clearAllMocks();
  mockedConnect.mockResolvedValue({ db } as unknown as Awaited<ReturnType<typeof connect>>);
  updateOne.mockResolvedValue({ acknowledged: true });
  createIndex.mockResolvedValue("broadcastId_1");
});

describe("claimBroadcast", () => {
  it("returns 'claimed' for a fresh broadcastId", async () => {
    updateOne.mockResolvedValue({ acknowledged: true, upsertedCount: 1 });
    expect(await claimBroadcast("b1")).toBe("claimed");
    expect(updateOne).toHaveBeenCalledOnce();
  });
  it("returns 'already-sent' on duplicate-key (E11000)", async () => {
    updateOne.mockRejectedValueOnce({ code: 11000 });
    expect(await claimBroadcast("b1")).toBe("already-sent");
  });
  it("returns 'error' when the DB is unavailable", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    expect(await claimBroadcast("b1")).toBe("error");
  });
  it("returns 'error' on a non-duplicate DB error", async () => {
    updateOne.mockRejectedValueOnce(new Error("boom"));
    expect(await claimBroadcast("b1")).toBe("error");
  });

  // Regression guard: the filter must target only "failed" docs so in-flight
  // "sending" broadcasts are NOT re-claimable.
  it("uses { broadcastId, status: 'failed' } filter — in-flight docs cannot be re-claimed", async () => {
    updateOne.mockResolvedValue({ acknowledged: true, upsertedCount: 1 });
    await claimBroadcast("b-regression");
    const [filter, update] = updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> },
    ];
    expect(filter).toEqual({ broadcastId: "b-regression", status: "failed" });
    expect(update.$set.status).toBe("sending");
    // broadcastId must NOT appear in $setOnInsert — the filter equality seeds it on insert
    expect(update.$setOnInsert).not.toHaveProperty("broadcastId");
  });

  // If a "sending" doc (in-flight) or "sent" doc is present for the same broadcastId,
  // the filter { status: "failed" } misses it; the upsert attempts an insert which
  // hits the unique index → E11000 → "already-sent" (no double send).
  it("blocks an in-flight (sending) broadcast — duplicate-key → already-sent", async () => {
    updateOne.mockRejectedValueOnce({ code: 11000 });
    expect(await claimBroadcast("b-inflight")).toBe("already-sent");
  });
});

describe("markSent / markFailed", () => {
  it("markSent sets status sent + campaignId", async () => {
    await markSent("b1", "camp_1");
    expect(updateOne).toHaveBeenCalledWith(
      { broadcastId: "b1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "sent", campaignId: "camp_1" }) }),
    );
  });
  it("markFailed sets status failed + reason", async () => {
    await markFailed("b1", "send-failed");
    expect(updateOne).toHaveBeenCalledWith(
      { broadcastId: "b1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "failed", reason: "send-failed" }) }),
    );
  });
});
