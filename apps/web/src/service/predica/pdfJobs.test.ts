import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRenderable,
  nextVersion,
  resolveQuietWindowMs,
  STALE_LOCK_MS,
  type PdfJob,
} from "./pdfJobs";

function makeJob(overrides: Partial<PdfJob> = {}): PdfJob {
  return {
    entryId: "entry-1",
    dirtyAt: new Date("2026-07-05T00:00:00.000Z"),
    contentHash: "hash-a",
    lastRenderedHash: "hash-a",
    version: 0,
    status: "idle",
    ...overrides,
  };
}

const QUIET_WINDOW_MS = 90_000;

describe("isRenderable", () => {
  it("returns false when contentHash is unchanged since the last render", () => {
    const now = new Date("2026-07-05T00:10:00.000Z");
    const job = makeJob({ contentHash: "hash-a", lastRenderedHash: "hash-a" });
    expect(isRenderable(job, now, QUIET_WINDOW_MS, STALE_LOCK_MS)).toBe(false);
  });

  it("returns false while still inside the quiet window, even with a changed hash", () => {
    const dirtyAt = new Date("2026-07-05T00:00:00.000Z");
    const now = new Date(dirtyAt.getTime() + QUIET_WINDOW_MS - 1000); // 1s short of window
    const job = makeJob({ dirtyAt, contentHash: "hash-b", lastRenderedHash: "hash-a" });
    expect(isRenderable(job, now, QUIET_WINDOW_MS, STALE_LOCK_MS)).toBe(false);
  });

  it("returns true once past the quiet window, idle, and hash changed", () => {
    const dirtyAt = new Date("2026-07-05T00:00:00.000Z");
    const now = new Date(dirtyAt.getTime() + QUIET_WINDOW_MS + 1000);
    const job = makeJob({
      dirtyAt,
      contentHash: "hash-b",
      lastRenderedHash: "hash-a",
      status: "idle",
    });
    expect(isRenderable(job, now, QUIET_WINDOW_MS, STALE_LOCK_MS)).toBe(true);
  });

  it("returns false when status is 'rendering' with a fresh (non-stale) lock", () => {
    const dirtyAt = new Date("2026-07-05T00:00:00.000Z");
    const now = new Date(dirtyAt.getTime() + QUIET_WINDOW_MS + 1000);
    const job = makeJob({
      dirtyAt,
      contentHash: "hash-b",
      lastRenderedHash: "hash-a",
      status: "rendering",
      lockedAt: new Date(now.getTime() - 1000), // locked 1s ago — fresh
    });
    expect(isRenderable(job, now, QUIET_WINDOW_MS, STALE_LOCK_MS)).toBe(false);
  });

  it("returns true when status is 'rendering' but the lock is stale (reclaimable)", () => {
    const dirtyAt = new Date("2026-07-05T00:00:00.000Z");
    const now = new Date(dirtyAt.getTime() + QUIET_WINDOW_MS + 1000);
    const job = makeJob({
      dirtyAt,
      contentHash: "hash-b",
      lastRenderedHash: "hash-a",
      status: "rendering",
      lockedAt: new Date(now.getTime() - STALE_LOCK_MS - 1000), // older than stale threshold
    });
    expect(isRenderable(job, now, QUIET_WINDOW_MS, STALE_LOCK_MS)).toBe(true);
  });
});

describe("nextVersion", () => {
  it("bumps 0 to 1", () => {
    expect(nextVersion(makeJob({ version: 0 }))).toBe(1);
  });

  it("treats an undefined version as 0, bumping to 1", () => {
    const job = makeJob();
    // @ts-expect-error — exercising the undefined-version runtime fallback
    delete job.version;
    expect(nextVersion(job)).toBe(1);
  });

  it("bumps 3 to 4", () => {
    expect(nextVersion(makeJob({ version: 3 }))).toBe(4);
  });
});

describe("resolveQuietWindowMs", () => {
  const ORIGINAL_ENV = process.env.PDF_REGEN_QUIET_WINDOW_SECONDS;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.PDF_REGEN_QUIET_WINDOW_SECONDS;
    } else {
      process.env.PDF_REGEN_QUIET_WINDOW_SECONDS = ORIGINAL_ENV;
    }
  });

  beforeEach(() => {
    delete process.env.PDF_REGEN_QUIET_WINDOW_SECONDS;
  });

  it("defaults to 90000ms when unset", () => {
    expect(resolveQuietWindowMs()).toBe(90_000);
  });

  it("honors a numeric env override", () => {
    process.env.PDF_REGEN_QUIET_WINDOW_SECONDS = "60";
    expect(resolveQuietWindowMs()).toBe(60_000);
  });

  it("falls back to the default when the env value is non-numeric", () => {
    process.env.PDF_REGEN_QUIET_WINDOW_SECONDS = "not-a-number";
    expect(resolveQuietWindowMs()).toBe(90_000);
  });
});

const updateOne = vi.fn();
const findOneAndUpdate = vi.fn();
const deleteOne = vi.fn();
const find = vi.fn();
const createIndex = vi.fn();
const collection = vi.fn(() => ({
  updateOne,
  findOneAndUpdate,
  deleteOne,
  find,
  createIndex,
}));
const db = vi.fn(() => ({ collection }));

vi.mock("../database.service", () => ({ connect: vi.fn() }));

describe("Mongo-backed pdf_jobs functions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { connect } = await import("../database.service");
    vi.mocked(connect).mockResolvedValue({ db } as unknown as Awaited<ReturnType<typeof connect>>);
    updateOne.mockResolvedValue({ acknowledged: true });
    findOneAndUpdate.mockResolvedValue(null);
    deleteOne.mockResolvedValue({ acknowledged: true });
    createIndex.mockResolvedValue("entryId_1");
    find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
  });

  it("markDirty upserts dirtyAt/contentHash without touching lastRenderedHash, and returns true", async () => {
    const { markDirty } = await import("./pdfJobs");
    const result = await markDirty("entry-1", "hash-x");
    expect(result).toBe(true);
    expect(updateOne).toHaveBeenCalledOnce();
    const [filter, update, options] = updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ entryId: "entry-1" });
    expect(update.$set.contentHash).toBe("hash-x");
    expect(update.$set).not.toHaveProperty("lastRenderedHash");
    expect(options).toEqual({ upsert: true });
  });

  it("markDirty returns false when connect() yields no client (Mongo unavailable)", async () => {
    const { connect } = await import("../database.service");
    vi.mocked(connect).mockResolvedValueOnce(undefined);
    const { markDirty } = await import("./pdfJobs");
    expect(await markDirty("entry-1", "hash-x")).toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("markDirty returns false when the upsert rejects", async () => {
    updateOne.mockRejectedValueOnce(new Error("upsert boom"));
    const { markDirty } = await import("./pdfJobs");
    expect(await markDirty("entry-1", "hash-x")).toBe(false);
  });

  it("claimJob returns false when connect() fails (ICR-111 guard)", async () => {
    const { connect } = await import("../database.service");
    vi.mocked(connect).mockResolvedValueOnce(undefined);
    const { claimJob } = await import("./pdfJobs");
    expect(await claimJob("entry-1", new Date())).toBe(false);
  });

  it("claimJob returns true when it wins the atomic claim", async () => {
    findOneAndUpdate.mockResolvedValueOnce({ entryId: "entry-1" });
    const { claimJob } = await import("./pdfJobs");
    expect(await claimJob("entry-1", new Date())).toBe(true);
  });

  it("claimJob returns false when no doc matches (already claimed/not renderable)", async () => {
    findOneAndUpdate.mockResolvedValueOnce(null);
    const { claimJob } = await import("./pdfJobs");
    expect(await claimJob("entry-1", new Date())).toBe(false);
  });

  it("completeJob sets lastRenderedHash/version/status and clears lock+error", async () => {
    const { completeJob } = await import("./pdfJobs");
    const now = new Date();
    await completeJob("entry-1", "hash-y", 2, now);
    const [filter, update] = updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $unset: Record<string, unknown> },
    ];
    expect(filter).toEqual({ entryId: "entry-1" });
    expect(update.$set).toMatchObject({
      lastRenderedHash: "hash-y",
      version: 2,
      status: "idle",
      lastRenderedAt: now,
    });
    expect(update.$unset).toMatchObject({ lockedAt: "", lastError: "" });
  });

  it("failJob resets status to idle, records lastError, leaves lastRenderedHash alone", async () => {
    const { failJob } = await import("./pdfJobs");
    const now = new Date();
    await failJob("entry-1", "boom", now);
    const [filter, update] = updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $unset: Record<string, unknown> },
    ];
    expect(filter).toEqual({ entryId: "entry-1" });
    expect(update.$set).toMatchObject({ status: "idle", lastError: "boom" });
    expect(update.$set).not.toHaveProperty("lastRenderedHash");
    expect(update.$unset).toMatchObject({ lockedAt: "" });
  });

  it("dropJob deletes the job doc by entryId", async () => {
    const { dropJob } = await import("./pdfJobs");
    await dropJob("entry-1");
    expect(deleteOne).toHaveBeenCalledWith({ entryId: "entry-1" });
  });
});
