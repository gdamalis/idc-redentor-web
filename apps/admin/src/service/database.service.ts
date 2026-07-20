import { MongoClient, ServerApiVersion } from "mongodb";
import type { Db } from "mongodb";

const MONGODB_OPTIONS = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
};

/**
 * One self-contained connection string per database, each authenticating as its
 * own single-database Atlas user (ICR-166). The database name rides in the URI
 * PATH — there is deliberately no DB-name env var (`ADMIN_DB_NAME` stays
 * cancelled) — so `client.db()` is called bare and the URI alone decides the
 * target. Both URIs set `authSource=admin` explicitly, so the path database is
 * never used as the auth source (mongodb@6.21.0 connection_string.js:302-310).
 *
 * See docs/architecture/admin-database.md for the two-layer safety argument.
 */
type MongoClientGlobalKey = "_adminMongoClient" | "_websiteMongoClient";

/**
 * Builds a cached client accessor bound to EXACTLY ONE env var. Binding the
 * variable name in the closure is the point: no accessor can read the other's
 * connection string, so a cross-wiring has to be a deliberate edit here rather
 * than an accidental fallthrough.
 */
function createClientAccessor(
  envVar: "MONGODB_URI" | "WEBSITE_MONGODB_URI",
  globalKey: MongoClientGlobalKey,
): () => MongoClient {
  let client: MongoClient | null = null;

  return function getClient(): MongoClient {
    if (client) return client;

    const uri = process.env[envVar];
    if (!uri) {
      throw new Error(`${envVar} is not defined`);
    }

    // In development, cache on globalThis to survive HMR. Distinct keys keep
    // the two clients from colliding across reloads.
    if (process.env.NODE_ENV === "development") {
      const globalWithMongo = globalThis as typeof globalThis & {
        _adminMongoClient?: MongoClient;
        _websiteMongoClient?: MongoClient;
      };
      const cached = globalWithMongo[globalKey];
      if (cached) {
        client = cached;
      } else {
        client = new MongoClient(uri, MONGODB_OPTIONS);
        globalWithMongo[globalKey] = client;
      }
    } else {
      client = new MongoClient(uri, MONGODB_OPTIONS);
    }

    return client;
  };
}

const getAdminClient = createClientAccessor("MONGODB_URI", "_adminMongoClient");
const getWebsiteClient = createClientAccessor(
  "WEBSITE_MONGODB_URI",
  "_websiteMongoClient",
);

const ADMIN_DB_NAME_PATTERN = /^ministry-admin(-staging|-test|-qa|-e2e)?$/;
const WEBSITE_DB_NAME_PATTERN = /^website(-staging|-test|-qa|-e2e)?$/;

/**
 * Functional-first exception (documented, not a precedent to reuse casually):
 * a misconfigured database name here is a **deployment defect**, not a
 * branchable outcome, so this throws a plain `Error` naming the offending
 * database instead of returning a discriminated result a caller could `??`
 * past. A returnable refusal would silently reintroduce exactly the
 * mis-wired-DB failure mode these allowlists — and the deliberate absence of a
 * separate DB-name env var — exist to prevent.
 * Precedent: `apps/web/src/service/database.service.ts`'s
 * `throw new Error("MONGODB_URI is not defined")` for the same class of
 * problem. No `Error` subclass is introduced.
 *
 * These are POSITIVE allowlists, not denylists: reserved Mongo system
 * databases (`test`/`admin`/`local`/`config`) and the other tier's databases
 * are rejected for free by matching neither pattern. `test` matters
 * specifically because it is the driver's silent fallback when a URI carries
 * no path database (connection_string.js:323-326), which is why a missing
 * path fails closed.
 *
 * The optional suffix accepts `-staging`, `-test`, `-qa`, and `-e2e` (in
 * addition to bare, i.e. production) — this deliberately WIDENS the original
 * `(-staging)?` shape to match `.claude/config.json`'s `qa.env.*.dbNameAllow`
 * exactly, so the QA harness's contract and this assertion agree on what
 * counts as a legitimate database name (post-review widening, ICR-166).
 * ACCEPTED TRADEOFF: this is a real widening, not a strictly safer change — a
 * production deployment accidentally pointed at `ministry-admin-test` (or any
 * other QA-suffixed name) now PASSES this assertion where the narrower
 * `(-staging)?` pattern would have failed closed. The Atlas grant (per
 * environment, see docs/architecture/admin-database.md) is what actually
 * prevents a prod credential from reaching a `-test`/`-qa`/`-e2e` database;
 * this code layer alone no longer catches that specific misconfiguration.
 *
 * Runs on every call (one anchored regex) with no memoization, so a dev-mode
 * HMR client swap can never bypass it. Has no Next.js runtime dependency —
 * ICR-155's plain Node/tsx seed script can import these directly.
 */
function assertDbName(
  name: string | null | undefined,
  pattern: RegExp,
  clientLabel: string,
  envVar: string,
  expected: string,
  examplePath: string,
): void {
  const trimmed = (name ?? "").trim();

  if (!trimmed) {
    throw new Error(
      `Refusing to use the ${clientLabel} Mongo client: ${envVar} resolved no database name ` +
        `(empty or whitespace). Carry the DB name in the URI path, e.g. ".../${examplePath}?authSource=admin".`,
    );
  }

  if (!pattern.test(trimmed)) {
    throw new Error(
      `Refusing to use the ${clientLabel} Mongo client against database "${trimmed}" — ` +
        `${envVar}'s path database must be one of ${expected}. Reserved Mongo system databases ` +
        `(test/admin/local/config) and the other tier's databases are rejected by construction.`,
    );
  }
}

export function assertAdminDbName(name: string | null | undefined): void {
  assertDbName(
    name,
    ADMIN_DB_NAME_PATTERN,
    "Ministry Admin",
    "MONGODB_URI",
    '"ministry-admin", "ministry-admin-staging", "ministry-admin-test", ' +
      '"ministry-admin-qa", or "ministry-admin-e2e"',
    "ministry-admin",
  );
}

export function assertWebsiteDbName(name: string | null | undefined): void {
  assertDbName(
    name,
    WEBSITE_DB_NAME_PATTERN,
    "website content",
    "WEBSITE_MONGODB_URI",
    '"website", "website-staging", "website-test", "website-qa", or "website-e2e"',
    "website",
  );
}

/**
 * The ONLY two sanctioned bare, zero-arg `client.db()` calls in `apps/admin` —
 * every other read must go through one of these accessors (enforced by the
 * `no-restricted-syntax` ESLint rule in `eslint.config.mjs`). Synchronous:
 * `client.db()` reads the URI-resolved DB name without needing a live
 * connection, so these assert-and-return without awaiting `connect()`.
 */
export function getAdminDb(): Db {
  // Sanctioned call site #1/2: assertAdminDbName() on the next line is what makes
  // this bare client.db() safe.
  // eslint-disable-next-line no-restricted-syntax
  const db = getAdminClient().db();
  assertAdminDbName(db.databaseName);
  return db;
}

export function getContentDb(): Db {
  // Sanctioned call site #2/2: assertWebsiteDbName() on the next line is what makes
  // this bare client.db() safe.
  // eslint-disable-next-line no-restricted-syntax
  const db = getWebsiteClient().db();
  assertWebsiteDbName(db.databaseName);
  return db;
}

/**
 * Warms the ADMIN client. The driver de-dupes concurrent connect() calls
 * internally (connectionLock) and no-ops on a warm topology, so repeat calls
 * are free — no memoization needed here.
 *
 * There is deliberately no content-side twin: the driver connects lazily on
 * first operation, so `getContentDb()` needs no warmup, and adding an unused
 * export would be speculative. Add one when a caller actually needs it.
 */
export async function connect(): Promise<MongoClient | undefined> {
  try {
    const mongoClient = getAdminClient();
    await mongoClient.connect();
    return mongoClient;
  } catch (error) {
    console.error("[db] Failed to connect to MongoDB", error);
  }
}
