import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock so these are available inside the factory closure.
const {
  createFromFiles,
  processForLocale,
  assetGet,
  assetPublish,
  assetUnpublish,
  assetDelete,
  entryGet,
  entryUpdate,
  entryPublish,
  entryGetMany,
  createClientMock,
} = vi.hoisted(() => ({
  createFromFiles: vi.fn(),
  processForLocale: vi.fn(),
  assetGet: vi.fn(),
  assetPublish: vi.fn(),
  assetUnpublish: vi.fn(),
  assetDelete: vi.fn(),
  entryGet: vi.fn(),
  entryUpdate: vi.fn(),
  entryPublish: vi.fn(),
  entryGetMany: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("contentful-management", () => ({
  createClient: createClientMock,
}));

import {
  deleteSupersededAsset,
  swapPdfSummary,
  uploadPdfAsset,
} from "./contentfulWriteBack";

const FAKE_TOKEN = "CFPAT-fake-token-value";
const FAKE_SPACE = "space123";

function stubValidEnv() {
  vi.stubEnv("CONTENTFUL_MANAGEMENT_ACCESS_TOKEN", FAKE_TOKEN);
  vi.stubEnv("CONTENTFUL_SPACE_ID", FAKE_SPACE);
  vi.stubEnv("CONTENTFUL_ENVIRONMENT", "production");
}

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockReturnValue({
    asset: {
      createFromFiles,
      processForLocale,
      get: assetGet,
      publish: assetPublish,
      unpublish: assetUnpublish,
      delete: assetDelete,
    },
    entry: {
      get: entryGet,
      update: entryUpdate,
      publish: entryPublish,
      getMany: entryGetMany,
    },
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("master-environment refusal", () => {
  it.each(["master", "master-x"])(
    "uploadPdfAsset refuses env '%s' without calling the client",
    async (env) => {
      vi.stubEnv("CONTENTFUL_MANAGEMENT_ACCESS_TOKEN", FAKE_TOKEN);
      vi.stubEnv("CONTENTFUL_SPACE_ID", FAKE_SPACE);
      vi.stubEnv("CONTENTFUL_ENVIRONMENT", env);

      const result = await uploadPdfAsset({
        buffer: Buffer.from("pdf"),
        fileName: "sermon.pdf",
        title: "Sermon — PDF es-AR · v1",
        locale: "es-AR",
      });

      expect(result.ok).toBe(false);
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );

  it.each(["master", "master-x"])(
    "swapPdfSummary refuses env '%s' without calling the client",
    async (env) => {
      vi.stubEnv("CONTENTFUL_MANAGEMENT_ACCESS_TOKEN", FAKE_TOKEN);
      vi.stubEnv("CONTENTFUL_SPACE_ID", FAKE_SPACE);
      vi.stubEnv("CONTENTFUL_ENVIRONMENT", env);

      const result = await swapPdfSummary({
        entryId: "entry1",
        locale: "es-AR",
        assetId: "asset1",
      });

      expect(result.ok).toBe(false);
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );

  it.each(["master", "master-x"])(
    "deleteSupersededAsset refuses env '%s' without calling the client",
    async (env) => {
      vi.stubEnv("CONTENTFUL_MANAGEMENT_ACCESS_TOKEN", FAKE_TOKEN);
      vi.stubEnv("CONTENTFUL_SPACE_ID", FAKE_SPACE);
      vi.stubEnv("CONTENTFUL_ENVIRONMENT", env);

      const result = await deleteSupersededAsset({ assetId: "asset1" });

      expect(result.ok).toBe(false);
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );
});

describe("missing management token", () => {
  it("fails closed with no client call and never echoes a token", async () => {
    vi.stubEnv("CONTENTFUL_MANAGEMENT_ACCESS_TOKEN", "");
    vi.stubEnv("CONTENTFUL_SPACE_ID", FAKE_SPACE);
    vi.stubEnv("CONTENTFUL_ENVIRONMENT", "production");

    const result = await uploadPdfAsset({
      buffer: Buffer.from("pdf"),
      fileName: "sermon.pdf",
      title: "Sermon — PDF es-AR · v1",
      locale: "es-AR",
    });

    expect(result).toEqual({ ok: false, reason: expect.any(String) });
    expect(createClientMock).not.toHaveBeenCalled();
    if (!result.ok) {
      expect(result.reason).not.toContain(FAKE_TOKEN);
    }
  });

  it("redacts the token from a downstream SDK error message", async () => {
    stubValidEnv();
    entryGet.mockRejectedValueOnce(
      new Error(`request failed: Authorization: Bearer ${FAKE_TOKEN}`),
    );

    const result = await swapPdfSummary({
      entryId: "entry1",
      locale: "es-AR",
      assetId: "asset1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain(FAKE_TOKEN);
      expect(result.reason).toContain("***");
    }
  });
});

describe("no-publish guarantee", () => {
  it("never calls any publish method across upload/swap/delete", async () => {
    stubValidEnv();

    createFromFiles.mockResolvedValue({
      sys: { id: "asset1", version: 1 },
      fields: { file: { "es-AR": { fileName: "sermon.pdf" } } },
    });
    processForLocale.mockResolvedValue({
      sys: { id: "asset1", version: 2 },
      fields: { file: { "es-AR": { url: "//assets.ctfassets.net/sermon.pdf" } } },
    });
    await uploadPdfAsset({
      buffer: Buffer.from("pdf"),
      fileName: "sermon.pdf",
      title: "Sermon — PDF es-AR · v1",
      locale: "es-AR",
    });

    entryGet.mockResolvedValue({
      sys: { id: "entry1", version: 5 },
      fields: { pdfSummary: {} },
    });
    entryUpdate.mockResolvedValue({ sys: { id: "entry1", version: 6 }, fields: {} });
    await swapPdfSummary({ entryId: "entry1", locale: "es-AR", assetId: "asset1" });

    entryGetMany.mockResolvedValue({ items: [] });
    assetGet.mockResolvedValue({ sys: { id: "asset1", version: 2, publishedVersion: 3 } });
    await deleteSupersededAsset({ assetId: "asset1" });

    expect(assetPublish).not.toHaveBeenCalled();
    expect(entryPublish).not.toHaveBeenCalled();
  });
});

describe("uploadPdfAsset", () => {
  it("creates a draft asset, processes it for the locale, and never publishes", async () => {
    stubValidEnv();
    createFromFiles.mockResolvedValue({
      sys: { id: "asset42", version: 1 },
      fields: { file: { "es-AR": { fileName: "sermon.pdf" } } },
    });
    processForLocale.mockResolvedValue({
      sys: { id: "asset42", version: 2 },
      fields: { file: { "es-AR": { url: "//assets.ctfassets.net/sermon.pdf" } } },
    });

    const result = await uploadPdfAsset({
      buffer: Buffer.from("pdf-bytes"),
      fileName: "sermon.pdf",
      title: "Sermon — PDF es-AR · v1",
      locale: "es-AR",
    });

    expect(result).toEqual({ ok: true, assetId: "asset42" });
    expect(createFromFiles).toHaveBeenCalledTimes(1);
    expect(processForLocale).toHaveBeenCalledTimes(1);
    expect(assetPublish).not.toHaveBeenCalled();

    const [, createdData] = createFromFiles.mock.calls[0];
    expect(createdData.fields.title["es-AR"]).toBe("Sermon — PDF es-AR · v1");
    expect(createdData.fields.file["es-AR"].contentType).toBe("application/pdf");
    expect(createdData.fields.file["es-AR"].fileName).toBe("sermon.pdf");
  });

  it("returns a failure result when the SDK call rejects", async () => {
    stubValidEnv();
    createFromFiles.mockRejectedValueOnce(new Error("upload failed"));

    const result = await uploadPdfAsset({
      buffer: Buffer.from("pdf-bytes"),
      fileName: "sermon.pdf",
      title: "t",
      locale: "es-AR",
    });

    expect(result.ok).toBe(false);
  });
});

describe("swapPdfSummary", () => {
  it("returns the previous asset id, updates only the given locale, and calls update once", async () => {
    stubValidEnv();
    entryGet.mockResolvedValue({
      sys: { id: "entry1", version: 7 },
      fields: {
        pdfSummary: {
          "es-AR": { sys: { type: "Link", linkType: "Asset", id: "oldAsset" } },
          "en-US": { sys: { type: "Link", linkType: "Asset", id: "untouchedAsset" } },
        },
      },
    });
    entryUpdate.mockImplementation(async (_params, rawData) => rawData);

    const result = await swapPdfSummary({
      entryId: "entry1",
      locale: "es-AR",
      assetId: "newAsset",
    });

    expect(result).toEqual({ ok: true, previousAssetId: "oldAsset" });
    expect(entryUpdate).toHaveBeenCalledTimes(1);
    const [updateParams, updatedEntry] = entryUpdate.mock.calls[0];
    expect(updateParams).toMatchObject({ entryId: "entry1" });
    expect(updatedEntry.fields.pdfSummary["es-AR"]).toEqual({
      sys: { type: "Link", linkType: "Asset", id: "newAsset" },
    });
    expect(updatedEntry.fields.pdfSummary["en-US"]).toEqual({
      sys: { type: "Link", linkType: "Asset", id: "untouchedAsset" },
    });
    expect(entryPublish).not.toHaveBeenCalled();
  });

  it("creates the pdfSummary object when absent and returns no previousAssetId", async () => {
    stubValidEnv();
    entryGet.mockResolvedValue({ sys: { id: "entry1", version: 1 }, fields: {} });
    entryUpdate.mockImplementation(async (_params, rawData) => rawData);

    const result = await swapPdfSummary({
      entryId: "entry1",
      locale: "en-US",
      assetId: "newAsset",
    });

    expect(result).toEqual({ ok: true, previousAssetId: undefined });
    const [, updatedEntry] = entryUpdate.mock.calls[0];
    expect(updatedEntry.fields.pdfSummary["en-US"]).toEqual({
      sys: { type: "Link", linkType: "Asset", id: "newAsset" },
    });
  });
});

describe("deleteSupersededAsset", () => {
  it("skips deletion when a referrer other than exceptEntryId remains", async () => {
    stubValidEnv();
    entryGetMany.mockResolvedValue({
      items: [{ sys: { id: "otherSermon" } }, { sys: { id: "keepEntry" } }],
    });

    const result = await deleteSupersededAsset({
      assetId: "oldAsset",
      exceptEntryId: "keepEntry",
    });

    expect(result).toEqual({ ok: true, deleted: false, skippedReason: "still-referenced" });
    expect(assetGet).not.toHaveBeenCalled();
    expect(assetDelete).not.toHaveBeenCalled();
  });

  it("skips deletion (and unpublish) when the old asset is PUBLISHED, even with no other referrers", async () => {
    stubValidEnv();
    entryGetMany.mockResolvedValue({ items: [{ sys: { id: "keepEntry" } }] });
    assetGet.mockResolvedValue({ sys: { id: "oldAsset", version: 3, publishedVersion: 2 } });

    const result = await deleteSupersededAsset({
      assetId: "oldAsset",
      exceptEntryId: "keepEntry",
    });

    expect(result).toEqual({ ok: true, deleted: false, skippedReason: "published-asset" });
    expect(assetUnpublish).not.toHaveBeenCalled();
    expect(assetDelete).not.toHaveBeenCalled();
  });

  it("deletes without unpublishing when the asset was never published and no referrers remain", async () => {
    stubValidEnv();
    entryGetMany.mockResolvedValue({ items: [] });
    assetGet.mockResolvedValue({ sys: { id: "oldAsset", version: 1, publishedVersion: undefined } });

    const result = await deleteSupersededAsset({ assetId: "oldAsset" });

    expect(result).toEqual({ ok: true, deleted: true });
    expect(assetUnpublish).not.toHaveBeenCalled();
    expect(assetDelete).toHaveBeenCalledTimes(1);
  });
});
