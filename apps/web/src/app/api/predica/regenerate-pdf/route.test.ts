import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { Sermon } from "@src/types/Sermon";

const getSermonById = vi.hoisted(() => vi.fn());
const markDirty = vi.hoisted(() => vi.fn());

vi.mock("@lib/contentful/getSermons", () => ({ getSermonById }));
vi.mock("@src/service/predica/pdfJobs", () => ({ markDirty }));

import { POST } from "./route";

const SECRET = "s3cret-regen-key";

// `key: null` means "omit the header entirely" (distinct from an omitted param, which
// defaults to the correct SECRET) — a default parameter only kicks in for `undefined`.
const req = (body: unknown, key: string | null = SECRET) =>
  new Request("http://x/api/predica/regenerate-pdf", {
    method: "POST",
    headers: key !== null ? { "x-predica-regen-key": key } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const sermonPayload = (entryId: string, contentTypeId = "sermon") => ({
  sys: { id: entryId, contentType: { sys: { id: contentTypeId } } },
});

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
  vi.stubEnv("PREDICA_REGEN_SECRET", SECRET);
  getSermonById.mockReset();
  markDirty.mockReset();
  markDirty.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/predica/regenerate-pdf", () => {
  it("401s on a missing key, without touching Contentful or the queue", async () => {
    const res = await POST(req(sermonPayload("e1"), null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Invalid secret" });
    expect(getSermonById).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("401s on an incorrect key, without touching Contentful or the queue", async () => {
    const res = await POST(req(sermonPayload("e1"), "wrong-key"));
    expect(res.status).toBe(401);
    expect(getSermonById).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("400s on a malformed body (null)", async () => {
    const res = await POST(req(undefined));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid payload" });
    expect(getSermonById).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("400s on a body missing sys", async () => {
    const res = await POST(req({ hello: "world" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid payload" });
    expect(getSermonById).not.toHaveBeenCalled();
  });

  it("200 ignored for a non-sermon content type, and never fetches Contentful", async () => {
    const res = await POST(req(sermonPayload("e1", "blogPostPage")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(getSermonById).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("200 not-found when both locales are unfetchable, and never marks dirty", async () => {
    getSermonById.mockResolvedValue(undefined);
    const res = await POST(req(sermonPayload("e1")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true, reason: "not-found" });
    expect(getSermonById).toHaveBeenCalledWith("e1", "es-AR", true);
    expect(getSermonById).toHaveBeenCalledWith("e1", "en-US", true);
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("202 queued when at least one locale is fetched, marking the job dirty with the content hash", async () => {
    getSermonById.mockImplementation(async (_id: string, locale: string) =>
      locale === "es-AR" ? fixtureSermon() : undefined,
    );
    const res = await POST(req(sermonPayload("e1")));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: true });
    expect(markDirty).toHaveBeenCalledTimes(1);
    const [entryId, hash] = markDirty.mock.calls[0];
    expect(entryId).toBe("e1");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("500s when the Contentful fetch throws unexpectedly, without leaking internals", async () => {
    getSermonById.mockRejectedValue(new Error("boom: secret-token-xyz"));
    const res = await POST(req(sermonPayload("e1")));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).not.toContain("secret-token-xyz");
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("500s when markDirty fails to enqueue (Mongo down / upsert error), instead of 202ing", async () => {
    getSermonById.mockImplementation(async (_id: string, locale: string) =>
      locale === "es-AR" ? fixtureSermon() : undefined,
    );
    markDirty.mockResolvedValue(false);
    const res = await POST(req(sermonPayload("e1")));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: "Failed to enqueue regen job" });
  });

  // --- ICR-136: fail closed, by intent rather than by type-coercion accident. ---
  it("401s for every x-predica-regen-key value when PREDICA_REGEN_SECRET is unset", async () => {
    vi.stubEnv("PREDICA_REGEN_SECRET", undefined);

    for (const key of ["undefined", "", "anything"]) {
      const res = await POST(req(sermonPayload("e1"), key));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ message: "Invalid secret" });
    }

    const noHeader = await POST(req(sermonPayload("e1"), null));
    expect(noHeader.status).toBe(401);

    expect(markDirty).not.toHaveBeenCalled();
    expect(getSermonById).not.toHaveBeenCalled();
  });
});
