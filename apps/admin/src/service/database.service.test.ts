import { afterEach, describe, expect, it, vi } from "vitest";

const { MongoClientMock } = vi.hoisted(() => {
  /**
   * Mirrors the driver: `client.db()` resolves the URI's PATH database, and
   * falls back to "test" when the URI carries no path (connection_string.js
   * :323-326). Deriving the name from the URI — rather than from a shared
   * stub — is what makes the cross-wiring and independence cases real: each
   * client can only report the database its OWN connection string names.
   */
  function resolveDbNameFromUri(uri: string): string {
    const afterScheme = uri.split("://")[1] ?? "";
    const slash = afterScheme.indexOf("/");
    if (slash === -1) return "test";
    const path = afterScheme.slice(slash + 1).split("?")[0];
    return path || "test";
  }

  const MongoClientMock = vi.fn(function MongoClient(uri: string) {
    const databaseName = resolveDbNameFromUri(uri);
    return { connect: vi.fn(), db: vi.fn(() => ({ databaseName })) };
  });
  return { MongoClientMock };
});

vi.mock("mongodb", () => ({
  MongoClient: MongoClientMock,
  ServerApiVersion: { v1: "1" },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/** Re-imports the module with fresh module-level state (the cached clients). */
async function loadService() {
  vi.resetModules();
  return import("./database.service");
}

describe("assertAdminDbName", () => {
  it.each(["", "   ", undefined, null])("throws for %s", async (name) => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName(name)).toThrow();
  });

  // Reserved Mongo system DBs + the website tier — all rejected for free by the
  // positive allowlist (they match neither legitimate name).
  const rejected = [
    "test",
    "admin",
    "local",
    "config",
    "website",
    "website-staging",
  ];

  it.each(rejected)(
    "throws naming the offending database for %s",
    async (name) => {
      const { assertAdminDbName } = await loadService();
      expect(() => assertAdminDbName(name)).toThrow(name);
    },
  );

  it.each([
    "ministry-admin",
    "ministry-admin-staging",
    "ministry-admin-test",
    "ministry-admin-qa",
    "ministry-admin-e2e",
  ])("accepts %s", async (name) => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName(name)).not.toThrow();
  });

  it("rejects a name that merely starts with the allowed prefix", async () => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName("ministry-admin-evil")).toThrow(
      "ministry-admin-evil",
    );
  });
});

describe("assertWebsiteDbName", () => {
  it.each(["", "   ", undefined, null])("throws for %s", async (name) => {
    const { assertWebsiteDbName } = await loadService();
    expect(() => assertWebsiteDbName(name)).toThrow();
  });

  const rejected = [
    "test",
    "admin",
    "local",
    "config",
    "ministry-admin",
    "ministry-admin-staging",
  ];

  it.each(rejected)(
    "throws naming the offending database for %s",
    async (name) => {
      const { assertWebsiteDbName } = await loadService();
      expect(() => assertWebsiteDbName(name)).toThrow(name);
    },
  );

  it.each([
    "website",
    "website-staging",
    "website-test",
    "website-qa",
    "website-e2e",
  ])("accepts %s", async (name) => {
    const { assertWebsiteDbName } = await loadService();
    expect(() => assertWebsiteDbName(name)).not.toThrow();
  });

  it("rejects a name that merely starts with the allowed prefix", async () => {
    const { assertWebsiteDbName } = await loadService();
    expect(() => assertWebsiteDbName("website-evil")).toThrow("website-evil");
  });
});

describe("getAdminDb", () => {
  it.each(["ministry-admin", "ministry-admin-staging"])(
    "returns the Db when MONGODB_URI's path is %s",
    async (name) => {
      vi.stubEnv(
        "MONGODB_URI",
        `mongodb://localhost:27017/${name}?authSource=admin`,
      );
      const { getAdminDb } = await loadService();

      expect(getAdminDb().databaseName).toBe(name);
    },
  );

  it("fails closed naming test when MONGODB_URI carries no path database", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");
    const { getAdminDb } = await loadService();

    expect(() => getAdminDb()).toThrow("test");
  });

  it("throws naming the missing variable when MONGODB_URI is unset", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const { getAdminDb } = await loadService();

    expect(() => getAdminDb()).toThrow("MONGODB_URI");
  });
});

describe("getContentDb", () => {
  it.each(["website", "website-staging"])(
    "returns the Db when WEBSITE_MONGODB_URI's path is %s",
    async (name) => {
      vi.stubEnv(
        "WEBSITE_MONGODB_URI",
        `mongodb://localhost:27017/${name}?authSource=admin`,
      );
      const { getContentDb } = await loadService();

      expect(getContentDb().databaseName).toBe(name);
    },
  );

  it("fails closed naming test when WEBSITE_MONGODB_URI carries no path database", async () => {
    vi.stubEnv("WEBSITE_MONGODB_URI", "mongodb://localhost:27017");
    const { getContentDb } = await loadService();

    expect(() => getContentDb()).toThrow("test");
  });

  it("throws naming the missing variable when WEBSITE_MONGODB_URI is unset", async () => {
    vi.stubEnv("WEBSITE_MONGODB_URI", "");
    const { getContentDb } = await loadService();

    expect(() => getContentDb()).toThrow("WEBSITE_MONGODB_URI");
  });
});

// 🔒 The regression cover this ticket exists for: a swapped or half-configured
// pair must fail at the assertion, never silently read the wrong database.
describe("cross-wiring", () => {
  it("rejects swapped URIs in both directions", async () => {
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://localhost:27017/website?authSource=admin",
    );
    vi.stubEnv(
      "WEBSITE_MONGODB_URI",
      "mongodb://localhost:27017/ministry-admin?authSource=admin",
    );
    const { getAdminDb, getContentDb } = await loadService();

    expect(() => getAdminDb()).toThrow("website");
    expect(() => getContentDb()).toThrow("ministry-admin");
  });

  it("does not let a stubbed MONGODB_URI satisfy getContentDb", async () => {
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://localhost:27017/ministry-admin?authSource=admin",
    );
    vi.stubEnv("WEBSITE_MONGODB_URI", "");
    const { getAdminDb, getContentDb } = await loadService();

    expect(getAdminDb().databaseName).toBe("ministry-admin");
    expect(() => getContentDb()).toThrow("WEBSITE_MONGODB_URI");
  });

  it("does not let a stubbed WEBSITE_MONGODB_URI satisfy getAdminDb", async () => {
    vi.stubEnv(
      "WEBSITE_MONGODB_URI",
      "mongodb://localhost:27017/website?authSource=admin",
    );
    vi.stubEnv("MONGODB_URI", "");
    const { getAdminDb, getContentDb } = await loadService();

    expect(getContentDb().databaseName).toBe("website");
    expect(() => getAdminDb()).toThrow("MONGODB_URI");
  });

  it("builds each client from its own connection string", async () => {
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://localhost:27017/ministry-admin?authSource=admin",
    );
    vi.stubEnv(
      "WEBSITE_MONGODB_URI",
      "mongodb://localhost:27017/website?authSource=admin",
    );
    const { getAdminDb, getContentDb } = await loadService();

    getAdminDb();
    getContentDb();

    const uris = MongoClientMock.mock.calls.map(([uri]) => uri);
    expect(uris).toEqual([
      "mongodb://localhost:27017/ministry-admin?authSource=admin",
      "mongodb://localhost:27017/website?authSource=admin",
    ]);
  });
});
