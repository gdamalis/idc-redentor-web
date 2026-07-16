import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { PdfJob } from "@src/service/predica/pdfJobs";
import type { Sermon } from "@src/types/Sermon";

const getSermonById = vi.hoisted(() => vi.fn());
const selectRenderableJobs = vi.hoisted(() => vi.fn());
const claimJob = vi.hoisted(() => vi.fn());
const completeJob = vi.hoisted(() => vi.fn());
const failJob = vi.hoisted(() => vi.fn());
const dropJob = vi.hoisted(() => vi.fn());
const nextVersion = vi.hoisted(() => vi.fn());
const computeSermonContentHash = vi.hoisted(() => vi.fn());
const renderSermonPdfs = vi.hoisted(() => vi.fn());
const uploadPdfAsset = vi.hoisted(() => vi.fn());
const swapPdfSummary = vi.hoisted(() => vi.fn());
const deleteSupersededAsset = vi.hoisted(() => vi.fn());

vi.mock("@lib/contentful/getSermons", () => ({ getSermonById }));
vi.mock("@src/service/predica/pdfJobs", () => ({
  selectRenderableJobs,
  claimJob,
  completeJob,
  failJob,
  dropJob,
  nextVersion,
}));
vi.mock("@src/utils/predica/regenContent", () => ({ computeSermonContentHash }));
vi.mock("@src/service/predica/renderSermonPdf", () => ({ renderSermonPdfs }));
vi.mock("@src/service/predica/contentfulWriteBack", () => ({
  uploadPdfAsset,
  swapPdfSummary,
  deleteSupersededAsset,
}));

import { GET } from "./route";

const SECRET = "s3cret-cron-value";

const req = (authorization: string | null) =>
  new Request("http://x/api/predica/regenerate-pdf/cron", {
    headers: authorization !== null ? { authorization } : {},
  });

function fixtureJob(overrides: Partial<PdfJob> = {}): PdfJob {
  return {
    entryId: "e1",
    dirtyAt: new Date("2026-01-01T00:00:00.000Z"),
    contentHash: "hash-dirty",
    lastRenderedHash: "hash-old",
    version: 2,
    status: "idle",
    ...overrides,
  };
}

function fixtureSermon(overrides: Partial<Sermon> = {}): Sermon {
  return {
    title: "Test Sermon",
    slug: "test-sermon",
    sermonDate: "2026-01-01",
    preacher: { name: "Pastor Test", email: "pastor@example.com" },
    additionalPreachers: [],
    audioLanguages: ["es-AR"],
    scriptureReferences: [],
    thesis: "",
    mainPoints: [],
    excerpt: "",
    content: {
      json: { nodeType: "document", data: {}, content: [] },
      links: { assets: { block: [] } },
    },
    seoTitle: "",
    seoDescription: "",
    keywords: [],
    sys: { id: "e1", publishedAt: "2026-01-01" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  getSermonById.mockReset();
  selectRenderableJobs.mockReset();
  claimJob.mockReset();
  completeJob.mockReset().mockResolvedValue(undefined);
  failJob.mockReset().mockResolvedValue(undefined);
  dropJob.mockReset().mockResolvedValue(undefined);
  nextVersion.mockReset();
  computeSermonContentHash.mockReset();
  renderSermonPdfs.mockReset();
  uploadPdfAsset.mockReset();
  swapPdfSummary.mockReset();
  deleteSupersededAsset.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/predica/regenerate-pdf/cron", () => {
  it("401s when the Authorization header is missing, without querying jobs", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
    expect(selectRenderableJobs).not.toHaveBeenCalled();
  });

  it("401s when the Authorization header doesn't match Bearer CRON_SECRET", async () => {
    const res = await GET(req("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
    expect(selectRenderableJobs).not.toHaveBeenCalled();
  });

  it("proceeds when the Authorization header matches Bearer CRON_SECRET", async () => {
    selectRenderableJobs.mockResolvedValue([]);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(selectRenderableJobs).toHaveBeenCalledTimes(1);
  });

  it("200s with an empty summary when there is nothing renderable", async () => {
    selectRenderableJobs.mockResolvedValue([]);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      processed: 0,
      rendered: [],
      skipped: [],
      failed: [],
      deferred: 0,
    });
    expect(claimJob).not.toHaveBeenCalled();
  });

  it("renders, uploads, swaps, then deletes the superseded asset per locale, then completes", async () => {
    const job = fixtureJob({ entryId: "e1", version: 2 });
    selectRenderableJobs.mockResolvedValue([job]);
    claimJob.mockResolvedValue(true);
    getSermonById.mockImplementation(async (_id: string, locale: string) =>
      locale === "es-AR"
        ? fixtureSermon({ title: "Titulo ES" })
        : fixtureSermon({ title: "Title EN" }),
    );
    computeSermonContentHash.mockReturnValue("hash-new");
    nextVersion.mockReturnValue(3);
    renderSermonPdfs.mockResolvedValue({
      "es-AR": Buffer.from("es-pdf"),
      "en-US": Buffer.from("en-pdf"),
    });

    const callOrder: string[] = [];
    uploadPdfAsset.mockImplementation(async ({ locale }: { locale: string }) => {
      callOrder.push(`upload:${locale}`);
      return { ok: true, assetId: `asset-${locale}` };
    });
    swapPdfSummary.mockImplementation(async ({ locale }: { locale: string }) => {
      callOrder.push(`swap:${locale}`);
      return { ok: true, previousAssetId: `old-${locale}` };
    });
    deleteSupersededAsset.mockImplementation(
      async ({ assetId, exceptEntryId }: { assetId: string; exceptEntryId?: string }) => {
        callOrder.push(`delete:${assetId}`);
        expect(exceptEntryId).toBe("e1");
        return { ok: true, deleted: true };
      },
    );

    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      processed: 1,
      rendered: ["e1"],
      skipped: [],
      failed: [],
      deferred: 0,
    });

    expect(claimJob).toHaveBeenCalledWith("e1", expect.any(Date));
    expect(getSermonById).toHaveBeenCalledWith("e1", "es-AR", true);
    expect(getSermonById).toHaveBeenCalledWith("e1", "en-US", true);
    expect(renderSermonPdfs).toHaveBeenCalledWith(expect.anything(), expect.anything(), 3);

    expect(uploadPdfAsset).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "es-AR", title: expect.stringContaining("PDF es-AR") }),
    );
    expect(uploadPdfAsset).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en-US", title: expect.stringContaining("PDF en-US") }),
    );
    expect(swapPdfSummary).toHaveBeenCalledWith({
      entryId: "e1",
      locale: "es-AR",
      assetId: "asset-es-AR",
    });
    expect(swapPdfSummary).toHaveBeenCalledWith({
      entryId: "e1",
      locale: "en-US",
      assetId: "asset-en-US",
    });
    expect(deleteSupersededAsset).toHaveBeenCalledWith({
      assetId: "old-es-AR",
      exceptEntryId: "e1",
    });
    expect(deleteSupersededAsset).toHaveBeenCalledWith({
      assetId: "old-en-US",
      exceptEntryId: "e1",
    });

    // swap-before-delete, per locale
    expect(callOrder.indexOf("upload:es-AR")).toBeLessThan(callOrder.indexOf("swap:es-AR"));
    expect(callOrder.indexOf("swap:es-AR")).toBeLessThan(callOrder.indexOf("delete:old-es-AR"));
    expect(callOrder.indexOf("upload:en-US")).toBeLessThan(callOrder.indexOf("swap:en-US"));
    expect(callOrder.indexOf("swap:en-US")).toBeLessThan(callOrder.indexOf("delete:old-en-US"));

    expect(completeJob).toHaveBeenCalledWith("e1", "hash-new", 3, expect.any(Date));
  });

  it("skips deleteSupersededAsset when swapPdfSummary reports no previous asset (first regen)", async () => {
    const job = fixtureJob({ entryId: "e1" });
    selectRenderableJobs.mockResolvedValue([job]);
    claimJob.mockResolvedValue(true);
    getSermonById.mockResolvedValue(fixtureSermon());
    computeSermonContentHash.mockReturnValue("hash-new");
    nextVersion.mockReturnValue(1);
    renderSermonPdfs.mockResolvedValue({
      "es-AR": Buffer.from("es-pdf"),
      "en-US": Buffer.from("en-pdf"),
    });
    uploadPdfAsset.mockResolvedValue({ ok: true, assetId: "asset-1" });
    swapPdfSummary.mockResolvedValue({ ok: true });

    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(deleteSupersededAsset).not.toHaveBeenCalled();
    expect(completeJob).toHaveBeenCalledWith("e1", "hash-new", 1, expect.any(Date));
    expect((await res.json()).rendered).toEqual(["e1"]);
  });

  it("drops the job when the entry has vanished from both locales, without rendering", async () => {
    const job = fixtureJob({ entryId: "e-gone" });
    selectRenderableJobs.mockResolvedValue([job]);
    claimJob.mockResolvedValue(true);
    getSermonById.mockResolvedValue(undefined);

    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(dropJob).toHaveBeenCalledWith("e-gone");
    expect(renderSermonPdfs).not.toHaveBeenCalled();
    expect(uploadPdfAsset).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.failed).toEqual([]);
  });

  it("fails a job whose upload throws, and still processes the next job (200)", async () => {
    const jobFail = fixtureJob({ entryId: "e-fail" });
    const jobOk = fixtureJob({ entryId: "e-ok" });
    selectRenderableJobs.mockResolvedValue([jobFail, jobOk]);
    claimJob.mockResolvedValue(true);
    getSermonById.mockImplementation(async (id: string) =>
      id === "e-fail"
        ? fixtureSermon({ slug: "fail-slug", title: "Fail Sermon" })
        : fixtureSermon({ slug: "ok-slug", title: "OK Sermon" }),
    );
    computeSermonContentHash.mockReturnValue("hash-new");
    nextVersion.mockImplementation((job: PdfJob) => (job.version ?? 0) + 1);
    renderSermonPdfs.mockResolvedValue({
      "es-AR": Buffer.from("es-pdf"),
      "en-US": Buffer.from("en-pdf"),
    });
    uploadPdfAsset.mockImplementation(async ({ title }: { title: string }) => {
      if (title.includes("Fail Sermon")) {
        return { ok: false, reason: "upload exploded" };
      }
      return { ok: true, assetId: "asset-ok" };
    });
    swapPdfSummary.mockResolvedValue({ ok: true });

    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(failJob).toHaveBeenCalledWith("e-fail", expect.any(String), expect.any(Date));
    expect(completeJob).toHaveBeenCalledWith("e-ok", "hash-new", expect.any(Number), expect.any(Date));
    const body = await res.json();
    expect(body.failed).toEqual(["e-fail"]);
    expect(body.rendered).toEqual(["e-ok"]);
  });

  it("skips a job whose claim is lost to another tick, without fetching or rendering", async () => {
    const job = fixtureJob({ entryId: "e1" });
    selectRenderableJobs.mockResolvedValue([job]);
    claimJob.mockResolvedValue(false);

    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(getSermonById).not.toHaveBeenCalled();
    expect(renderSermonPdfs).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.skipped).toEqual(["e1"]);
    expect(body.failed).toEqual([]);
  });

  it("caps processing at MAX_PER_TICK (3) and reports the rest as deferred", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => fixtureJob({ entryId: `e${i}` }));
    selectRenderableJobs.mockResolvedValue(jobs);
    claimJob.mockResolvedValue(true);
    getSermonById.mockResolvedValue(fixtureSermon());
    computeSermonContentHash.mockReturnValue("hash-new");
    nextVersion.mockReturnValue(1);
    renderSermonPdfs.mockResolvedValue({
      "es-AR": Buffer.from("es-pdf"),
      "en-US": Buffer.from("en-pdf"),
    });
    uploadPdfAsset.mockResolvedValue({ ok: true, assetId: "asset-1" });
    swapPdfSummary.mockResolvedValue({ ok: true });

    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(claimJob).toHaveBeenCalledTimes(3);
    expect(claimJob).toHaveBeenNthCalledWith(1, "e0", expect.any(Date));
    expect(claimJob).toHaveBeenNthCalledWith(2, "e1", expect.any(Date));
    expect(claimJob).toHaveBeenNthCalledWith(3, "e2", expect.any(Date));
    const body = await res.json();
    expect(body.processed).toBe(3);
    expect(body.deferred).toBe(2);
  });

  // --- ICR-136: the guard must fail CLOSED when CRON_SECRET is unset. ---
  it("401s on 'Bearer undefined' when CRON_SECRET is unset, without querying jobs", async () => {
    vi.stubEnv("CRON_SECRET", undefined);

    const res = await GET(req("Bearer undefined"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
    expect(selectRenderableJobs).not.toHaveBeenCalled();
    expect(claimJob).not.toHaveBeenCalled();
  });

  it("401s on a missing Authorization header when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", undefined);

    const res = await GET(req(null));

    expect(res.status).toBe(401);
    expect(selectRenderableJobs).not.toHaveBeenCalled();
    expect(claimJob).not.toHaveBeenCalled();
  });

  it("401s on 'Bearer ' + the empty string when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", undefined);

    const res = await GET(req("Bearer "));

    expect(res.status).toBe(401);
    expect(selectRenderableJobs).not.toHaveBeenCalled();
  });
});
