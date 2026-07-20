# ICR-166 — One connection string per database in `apps/admin` (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/admin` one self-contained MongoDB connection string per database — keep `MONGODB_URI` (→ `ministry-admin*`) and add `WEBSITE_MONGODB_URI` (→ `website*`) — each behind its own cached client and a positive-allowlist name assertion.

**Architecture:** Two independently cached `MongoClient`s built by a closure factory that binds exactly one env var name per client, so neither accessor can structurally read the other's variable. Each accessor does a bare zero-arg `client.db()` (letting the URI path decide the database) and asserts the resolved name against a positive allowlist before returning. Name-resolution logic disappears entirely: no const map, no tier derivation, no parsing.

**Tech Stack:** TypeScript (strict), `mongodb@6.21.0`, Vitest, ESLint flat config, Next.js 16 (`apps/admin`).

**Design doc (authoritative):** `tasks/specs/ICR-166-admin-per-db-connection-strings.md` — read it before starting. This plan implements it; it does not re-decide it.

## Global Constraints

- **Functional-first.** No `class` declarations. Closures over classes. Plain `Error` only — no `Error` subclass.
- **Throwing is the one documented exception** here: a misconfigured database is a deployment defect, not a branchable outcome. Preserve the existing doc comment explaining this.
- **Assertions stay unmemoized** (O(1) regex) so a dev-mode HMR client swap can never bypass them.
- **`ADMIN_DB_NAME` must not be reintroduced anywhere.** The DB name rides in the URI path.
- **No database name hardcoded** outside the two assertion patterns.
- **Secret hygiene:** variable **names** only. Never write a real connection string into `.env.example`, docs, commits, or the PR.
- **`dbNameAllow` regex patterns in `.claude/config.json` MUST NOT change** — only the surrounding prose.
- Allowlists are exactly: admin `/^ministry-admin(-staging)?$/`, website `/^website(-staging)?$/`.
- Every checkpoint ends green on `pnpm type-check`, `pnpm lint`, `pnpm test`.

## Deliberate deviation from the design doc (approved at the plan gate, 2026-07-20)

The design doc says the ESLint entry needs **no structural change** (message only). **Approved deviation:** also broaden the selector from `CallExpression[callee.property.name='db'][arguments.length=0]` to `CallExpression[callee.property.name='db']` (any arity).

**Why:** the zero-arg-only selector leaves a hardcoded `client.db("website")` lint-legal — precisely the bug this ticket removes — so AC9 ("no database name hardcoded outside the two assertions") would be a review-time convention rather than a mechanically enforced rule. Broadening makes AC9 self-enforcing.

**Accepted risk:** the selector matches _any_ `.db()` property call, not only Mongo's, so an unrelated `foo.db(x)` in `apps/admin/src/**` would now error. Verified low: `apps/admin` is the ICR-124 scaffold. Task 2 Step 4 greps for other `.db(` call sites to confirm before relying on a green lint.

---

### Task 1: Two cached clients, two asserted accessors

**Files:**

- Modify: `apps/admin/src/service/database.service.ts` (full rewrite of the client + assertion sections)
- Test: `apps/admin/src/service/database.service.test.ts` (rewrite the `mongodb` mock; extend coverage)

**Interfaces:**

- Consumes: nothing (no existing callers — confirmed by grep + graphify).
- Produces:
  - `assertAdminDbName(name: string | null | undefined): void` — throws unless `/^ministry-admin(-staging)?$/`
  - `assertWebsiteDbName(name: string | null | undefined): void` — throws unless `/^website(-staging)?$/`
  - `getAdminDb(): Db` — reads `MONGODB_URI`
  - `getContentDb(): Db` — reads `WEBSITE_MONGODB_URI`
  - `connect(): Promise<MongoClient | undefined>` — unchanged name/signature; connects the **admin** client only

- [ ] **Step 1: Rewrite the test's `mongodb` mock so the resolved DB name derives from the URI**

The shipped mock shares one `dbFn` across every client and returns whatever the test stubs. That makes the AC5 independence test **vacuous** — both clients would report the same name no matter which URI they got. Replace it with a mock that mirrors the real driver: the path database, or `"test"` when the path is absent (`connection_string.js:323–326`).

Replace lines 1–25 of `apps/admin/src/service/database.service.test.ts` with:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

Replace everything from `describe("assertAdminDbName"` to the end of the file with:

```ts
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

  it.each(["ministry-admin", "ministry-admin-staging"])(
    "accepts %s",
    async (name) => {
      const { assertAdminDbName } = await loadService();
      expect(() => assertAdminDbName(name)).not.toThrow();
    },
  );

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

  it.each(["website", "website-staging"])("accepts %s", async (name) => {
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
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-166
pnpm --filter @idcr/admin test -- src/service/database.service.test.ts
```

Expected: FAIL — `assertWebsiteDbName` and `getContentDb` are not exported (`is not a function`), and the `ministry-admin-staging` / prefix-boundary cases fail against the current denylist.

- [ ] **Step 4: Implement — replace `apps/admin/src/service/database.service.ts` in full**

```ts
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

const ADMIN_DB_NAME_PATTERN = /^ministry-admin(-staging)?$/;
const WEBSITE_DB_NAME_PATTERN = /^website(-staging)?$/;

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
): void {
  const trimmed = (name ?? "").trim();

  if (!trimmed) {
    throw new Error(
      `Refusing to use the ${clientLabel} Mongo client: ${envVar} resolved no database name ` +
        `(empty or whitespace). Carry the DB name in the URI path, e.g. ".../${expected}?authSource=admin".`,
    );
  }

  if (!pattern.test(trimmed)) {
    throw new Error(
      `Refusing to use the ${clientLabel} Mongo client against database "${trimmed}" — ` +
        `${envVar}'s path database must be exactly ${expected}. Reserved Mongo system databases ` +
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
    '"ministry-admin" or "ministry-admin-staging"',
  );
}

export function assertWebsiteDbName(name: string | null | undefined): void {
  assertDbName(
    name,
    WEBSITE_DB_NAME_PATTERN,
    "website content",
    "WEBSITE_MONGODB_URI",
    '"website" or "website-staging"',
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
  const db = getAdminClient().db();
  assertAdminDbName(db.databaseName);
  return db;
}

export function getContentDb(): Db {
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @idcr/admin test -- src/service/database.service.test.ts
```

Expected: PASS, all cases green.

- [ ] **Step 6: Full verification**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-166
pnpm type-check && pnpm lint && pnpm test
```

Expected: all three green. `lint` must stay green **without** touching the `ignores` entry — the exemption already covers both accessors because it exempts the whole file.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/service/database.service.ts apps/admin/src/service/database.service.test.ts
git commit -m "chore(ICR-166): split admin data layer into one client per database"
```

---

### Task 2: Declare `WEBSITE_MONGODB_URI` and retarget the ESLint message

**Files:**

- Modify: `apps/admin/.env.example:3-14`
- Modify: `apps/admin/src/types/environment.d.ts:3-7`
- Modify: `apps/admin/eslint.config.mjs:16-18`

**Interfaces:**

- Consumes: `getAdminDb()` / `getContentDb()` from Task 1 (referenced by name in the lint message and env comments).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite the MongoDB block in `apps/admin/.env.example`**

Replace lines 3–14 with:

```
# --- MongoDB (one connection string per database — ICR-166) ---

# apps/admin reaches TWO databases, each via its own self-contained connection
# string authenticating as its own single-database Atlas user. The DB name rides
# in the URI PATH — there is deliberately no separate DB-name env var. Both URIs
# must set authSource=admin explicitly and maxPoolSize to match this app's
# MongoClient options (10). Neither accessor can read the other's variable.
# See docs/architecture/admin-database.md.
# Do not commit real connection strings here (server-side only, gitignored).

# Congregant PII + admin auth. Path DB must be exactly "ministry-admin"
# (prod) or "ministry-admin-staging" (non-prod), e.g.:
#   mongodb+srv://<host>/ministry-admin?authSource=admin&retryWrites=true&w=majority&maxPoolSize=10
# getAdminDb() fails closed on any other name.
MONGODB_URI=

# Public-site content (likes, contact) — the admin authors it as a CMS. Reuses
# apps/web's existing website user. Path DB must be exactly "website" (prod) or
# "website-staging" (non-prod), e.g.:
#   mongodb+srv://<host>/website?authSource=admin&retryWrites=true&w=majority&maxPoolSize=10
# getContentDb() fails closed on any other name.
WEBSITE_MONGODB_URI=
```

- [ ] **Step 2: Declare the variable in `apps/admin/src/types/environment.d.ts`**

Replace lines 3–7 with:

```ts
// MongoDB — ONE connection string per database (ICR-166). The DB name rides
// in each URI's PATH (see .env.example) — there is deliberately no separate
// DB-name env var. Each is read by exactly one accessor in
// src/service/database.service.ts, which asserts the resolved name.
// See docs/architecture/admin-database.md.
MONGODB_URI: string; // -> ministry-admin | ministry-admin-staging (getAdminDb)
WEBSITE_MONGODB_URI: string; // -> website | website-staging (getContentDb)
```

- [ ] **Step 3: Retarget AND broaden the ESLint rule in `apps/admin/eslint.config.mjs`**

The current message advertises `client.db("website")` — the hardcoded production name this ticket removes — and the selector catches only the zero-arg form. Per the approved deviation above, change **both**. Replace lines 12–19 with:

```js
      "no-restricted-syntax": [
        "error",
        {
          // Any arity: a bare client.db() resolves an unasserted name, and
          // client.db("website") hardcodes a production database name that is
          // wrong on staging. Both go through the asserted accessors instead.
          selector: "CallExpression[callee.property.name='db']",
          message:
            "client.db() is banned in apps/admin — use getAdminDb() or getContentDb() from src/service/database.service.ts, which assert the URI-resolved database name. Never hardcode a database name.",
        },
      ],
```

Leave the `ignores: ["src/service/database.service.ts"]` entry untouched — the exemption is file-scoped and already covers both accessors.

- [ ] **Step 4: Confirm the broadened selector has no false positives**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-166
grep -rn '\.db(' apps/admin/src --include='*.ts' --include='*.tsx'
```

Expected: hits **only** inside `src/service/database.service.ts` (exempt) and `src/service/database.service.test.ts` (the mock's `db:` property and the mocked calls — note the ESLint block is scoped to `files: ["src/**/*.{ts,tsx}"]`, so if the test file trips the rule, that is a real hit to resolve, not a false alarm). Any other hit must be converted to an accessor call or the deviation reconsidered.

- [ ] **Step 5: Verify**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 6: Confirm no stray hardcoded name and no `ADMIN_DB_NAME` regression**

```bash
grep -rn 'ADMIN_DB_NAME' apps/ docs/ .claude/ || echo "OK: ADMIN_DB_NAME absent from code/docs"
grep -rn 'db("website")\|db('"'"'website'"'"')' apps/ || echo "OK: no hardcoded client.db(\"website\")"
```

Expected: both print their OK line. (`ADMIN_DB_NAME` may still legitimately appear in `.claude/config.json` prose and older specs **asserting it is cancelled** — per the ICR-110 lesson those references must SURVIVE. The grep above scopes to `apps/`, `docs/`, `.claude/`; review any hit before deleting it.)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/.env.example apps/admin/src/types/environment.d.ts apps/admin/eslint.config.mjs
git commit -m "chore(ICR-166): declare WEBSITE_MONGODB_URI and harden the admin client.db lint rule"
```

---

### Task 3: Update the harness QA prose in `.claude/config.json`

**Files:**

- Modify: `.claude/config.json` — `qa.env.preview.dbNote`, `qa.env.staging.dbNameAllowNote`

**Interfaces:**

- Consumes: the two env var names from Task 2.
- Produces: nothing consumed by later tasks.

Both notes currently end by asserting QA resolves the DB name "from the connection URI via `client.db().databaseName` (the `MONGODB_URI` path) — NOT from an env var (there is no `ADMIN_DB_NAME`)". That is now under-specified: there are two URIs. **The `dbNameAllow` regex values must not change** — they only ever match suffixed _test_ databases and are unaffected by the URI split.

- [ ] **Step 1: Update `qa.env.preview.dbNote`**

Replace the trailing sentence:

> `QA resolves the target DB name from the connection URI via client.db().databaseName (the MONGODB_URI path) — NOT from an env var (there is no ADMIN_DB_NAME).`

with:

```
QA resolves each target DB name from its OWN connection URI via client.db().databaseName. apps/admin carries one connection string per database (ICR-166): MONGODB_URI -> ministry-admin*, WEBSITE_MONGODB_URI -> website*, each authenticating as a single-database Atlas user. Names never come from an env var (there is no ADMIN_DB_NAME).
```

Leave the rest of `dbNote` (the default-deny allowlist explanation, the Phase-1 no-writes note) and `dbNameAllow` unchanged.

- [ ] **Step 2: Update `qa.env.staging.dbNameAllowNote`**

Replace its trailing sentence:

> `QA resolves the DB name from client.db().databaseName (the MONGODB_URI path), not an env var (no ADMIN_DB_NAME).`

with:

```
QA resolves each DB name from its OWN connection URI via client.db().databaseName — MONGODB_URI -> ministry-admin*, WEBSITE_MONGODB_URI -> website* (ICR-166, one single-database credential each) — not from an env var (no ADMIN_DB_NAME).
```

Leave `dbNameAllow` unchanged.

- [ ] **Step 3: Verify the JSON still parses and the allowlists are byte-identical**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-166
node -e "
const c = require('./.claude/config.json');
console.log('preview:', c.qa.env.preview.dbNameAllow);
console.log('staging:', c.qa.env.staging.dbNameAllow);
"
git diff -- .claude/config.json | grep -E '^[-+].*dbNameAllow"' || echo "OK: dbNameAllow patterns untouched"
```

Expected: `preview: ^(website|ministry-admin)-(test|qa|e2e)$`, `staging: ^(website|ministry-admin)-(staging|test|qa|e2e)$`, and the `OK:` line (the grep must find no changed `dbNameAllow` line).

- [ ] **Step 4: Commit**

```bash
git add .claude/config.json
git commit -m "chore(ICR-166): describe the two-connection admin model in QA config prose"
```

---

### Task 4: Document the two-connection model

**Files:**

- Create: `docs/architecture/admin-database.md`
- Modify: `CLAUDE.md` (engineering-docs index, the `docs/architecture/` bullet list)

**Interfaces:**

- Consumes: everything from Tasks 1–3.
- Produces: the doc path already referenced by the code comments and `.env.example` written in Tasks 1–2 — those references dangle until this task lands, so it must not be skipped.

No `docs/architecture/*.md` currently describes `apps/admin`'s data layer (confirmed by grep — the existing Mongo doc, `likes-and-mongodb.md`, is `apps/web`-scoped). This is a new file.

- [ ] **Step 1: Write `docs/architecture/admin-database.md`**

```markdown
# Admin database — one connection string per database

`apps/admin` reaches **two** MongoDB databases with **two independent connection
strings**, each authenticating as its own single-database Atlas user.

| Env var               | Path database (prod / non-prod)             | Holds                          | Accessor         |
| --------------------- | ------------------------------------------- | ------------------------------ | ---------------- |
| `MONGODB_URI`         | `ministry-admin` / `ministry-admin-staging` | congregant PII + admin auth    | `getAdminDb()`   |
| `WEBSITE_MONGODB_URI` | `website` / `website-staging`               | public content, likes, contact | `getContentDb()` |

Both URIs set `authSource=admin` explicitly and `maxPoolSize=10`.

## Why not a single URI

The shipped ICR-124 model carried one `MONGODB_URI` naming `ministry-admin` and
expected the second database to be reached with a hardcoded `client.db("website")`.
Two problems:

1. **Asymmetry.** One database's name lived in config, the other in code. Neither
   is "the" database, so privileging one in the connection string misleads.
2. **A latent bug.** `"website"` is the _production_ name. On staging the database
   is `website-staging`, so that literal would have been wrong there. The single-URI
   model solved the per-environment suffix for the first database only.

Splitting the URIs keeps the locked tenet — **the DB name rides in the URI path;
there is no separate DB-name env var** (`ADMIN_DB_NAME` stays cancelled) — while
making each URI honestly _single-database_, which is exactly where DB-in-the-path is
the correct idiom. All name-resolution logic disappears: no const map, no tier
derivation from `VERCEL_ENV`, no parsing.

## The two-layer safety argument

Two **independent** layers now cover both failure modes:

| Failure                                                         | Caught by                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Tier** mix-up (prod names meet non-prod creds, or vice versa) | the Atlas grant — the user cannot reach the other tier's database |
| **Role** mix-up (URIs swapped; content code reaches PII)        | the Atlas grant **and** the in-code name assertion                |

The role axis is the upgrade. Under the previous shared user — which held
`readWrite` on **both** databases — MongoDB _permitted_ a cross-wiring, so only code
could catch it. Now a swapped URI fails at the credential _and_ at the assertion.

**No single credential the admin app holds can reach both databases.** A leaked
`MONGODB_URI` exposes only `ministry-admin`; a leaked `WEBSITE_MONGODB_URI` exposes
only `website`. Blast radius halved. `apps/web` still never receives any grant on
`ministry-admin*`.

## Code shape

`src/service/database.service.ts`:
```

getAdminDb() -> adminClient.db() -> assert /^ministry-admin(-staging)?$/
getContentDb() -> websiteClient.db() -> assert /^website(-staging)?$/

```

- **Two cached clients**, each built by a closure that binds **exactly one** env var
  name — so no accessor can read the other's connection string. Each mirrors the
  shipped caching pattern: a distinct `globalThis` dev-HMR key
  (`_adminMongoClient` / `_websiteMongoClient`), `maxPoolSize: 10`, `serverApi` v1 strict.
- **Positive allowlists, not denylists.** Reserved Mongo system databases
  (`test`/`admin`/`local`/`config`) and the other tier's databases are rejected for
  free by matching neither pattern.
- **Assertions are unmemoized** (one anchored regex) so a dev-mode HMR client swap
  can never bypass them.
- **Throwing is the deliberate functional-first exception**: a misconfigured database
  is a *deployment defect*, not a branchable outcome. Plain `Error` naming the
  offending database; no `Error` subclass.
- `connect()` warms the **admin** client only. The driver connects lazily on first
  operation, so the content client needs no warmup; a twin would be speculative.

## Fail-closed behavior

| Condition | Behavior |
| --- | --- |
| Either variable unset | throws naming the missing variable |
| URI has no path database | `client.db()` resolves `test` → assertion throws naming `test` |
| URIs swapped | assertion throws naming the offending database; the grant would also deny |
| Reserved system database in path | assertion throws (matches neither allowlist) |
| Connection failure | `connect()` logs and returns `undefined` |

### Driver facts (verified against installed `mongodb@6.21.0`)

- `connection_string.js:302–310` — the driver copies the path database into
  `credentials.source` **only** when a path database is present *and* `authSource` is
  absent. Because both URIs set `authSource=admin` explicitly, the path is **never**
  used as the auth source; auth targets `admin`, where Atlas users live.
- `connection_string.js:323–326` — `dbName` defaults to `test` when the URI has no
  path database. This is precisely why a missing path fails closed: `test` matches
  neither allowlist.

## Operational notes

- **Two connection pools** (2 × `maxPoolSize` 10 = 20 from admin) — trivial against
  the M0 500-connection cap. Related: ICR-157 caps the web side.
- **No cross-database transaction** is possible with two clients. Not a regression
  (cross-DB `$lookup`/`$unionWith` never worked), and coupling a PII write to a
  content write is exactly what the sensitivity split exists to prevent — treat it as
  a property, not a limitation.
- **Local development.** Point both URIs at the `-staging` databases. Local must
  never reach production data; the staging users cannot, so this is enforced rather
  than merely conventional.
- **Shared `website` user.** `apps/web` and `apps/admin` use the same website
  credential. Accepted: it is already single-database-scoped, so the meaningful
  boundary (`website` vs `ministry-admin`) is unaffected. A dedicated admin-side
  website user remains a future hardening option if independent revocation is wanted.

> **Provisioning is human-only and tracked on ICR-141**: re-scope the admin users to a
> single grant each (no `website` grant), and set `WEBSITE_MONGODB_URI` in all three
> admin Vercel environments with its path database matching the tier.

**Secret hygiene:** variable **names** only — never paste a real connection string
into docs, commits, or PRs.

Design record: `tasks/specs/ICR-166-admin-per-db-connection-strings.md`.
```

- [ ] **Step 2: Register the new doc in the `CLAUDE.md` index**

In `CLAUDE.md`, in the `docs/architecture/` bullet list under **Documentation**, insert immediately after the `monorepo-packages.md` bullet:

```markdown
- `admin-database.md` — `apps/admin`'s two-connection MongoDB model: one self-contained connection string per database (`MONGODB_URI` → `ministry-admin*`, `WEBSITE_MONGODB_URI` → `website*`), each with a single-database Atlas user; the positive-allowlist name assertions, the two-layer (grant + assertion) safety argument, and the verified driver fail-closed behavior.
```

- [ ] **Step 3: Verify the doc references resolve**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-166
test -f docs/architecture/admin-database.md && echo "OK: doc exists"
grep -rn 'admin-database.md' apps/ docs/ CLAUDE.md
pnpm format:check || pnpm format
```

Expected: `OK: doc exists`, and hits from `database.service.ts`, `.env.example`, `environment.d.ts`, and `CLAUDE.md` — i.e. every reference written in Tasks 1–2 now resolves.

- [ ] **Step 4: Final full verification**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/admin-database.md CLAUDE.md
git commit -m "docs(ICR-166): document the admin two-connection database model"
```

---

## Acceptance-criteria traceability

| AC                                                                                          | Covered by                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `WEBSITE_MONGODB_URI` in `.env.example` + `environment.d.ts`                                | Task 2, Steps 1–2                                                                   |
| `getContentDb()` reads `WEBSITE_MONGODB_URI`, `client.db()`, asserts `^website(-staging)?$` | Task 1, Step 4                                                                      |
| `getAdminDb()` denylist → positive allowlist                                                | Task 1, Step 4                                                                      |
| Two independently cached clients, distinct HMR keys, neither reads the other's var          | Task 1, Step 4 (closure factory)                                                    |
| 🔒 Cross-wiring regression tests                                                            | Task 1, Step 2 (`describe("cross-wiring")`)                                         |
| ESLint message points at `getContentDb()`                                                   | Task 2, Step 3 (message + approved selector broadening)                             |
| `.claude/config.json` prose updated, `dbNameAllow` unchanged                                | Task 3 (Step 3 asserts the patterns are untouched)                                  |
| Admin data-layer doc in `docs/architecture/`                                                | Task 4                                                                              |
| No hardcoded DB name; `ADMIN_DB_NAME` not reintroduced                                      | Task 2, Steps 4 + 6 (explicit greps) — now also enforced by the broadened lint rule |
| `type-check` / `lint` / `test` green                                                        | Every task's verify step                                                            |

## Out of scope

- **Atlas provisioning and Vercel env vars** — human-only, tracked on **ICR-141** (re-scope admin users to a single grant each; set `WEBSITE_MONGODB_URI` in all three admin environments). This branch ships code only and is safe to land first: nothing consumes `getContentDb()` yet, so an unset `WEBSITE_MONGODB_URI` cannot break the app — it only throws if called.
- A content-side `connectContent()` twin — deliberately omitted (approved at the plan gate): the driver connects lazily on first operation, so `getContentDb()` needs no warmup and an unused export would be speculative.

## Amendment (2026-07-20, post-review): allowlists widened to match the QA contract

A PR review on ICR-166 (Codex, P2, maintainer-approved) flagged that the code allowlists planned above
(`ADMIN_DB_NAME_PATTERN = /^ministry-admin(-staging)?$/`, `WEBSITE_DB_NAME_PATTERN = /^website(-staging)?$/`
— see Task 1 Step 3–4 and the AC-traceability row `getContentDb()` ... asserts `^website(-staging)?$`)
disagreed with `.claude/config.json`'s `qa.env.{preview,staging}.dbNameAllow`, which sanctions
`{website,ministry-admin}-{staging,test,qa,e2e}` as QA-touchable databases. The maintainer decided to
**widen the code allowlists** to agree with the QA contract, rather than narrow `dbNameAllow`. Both
regexes now accept the optional suffix `-staging`, `-test`, `-qa`, or `-e2e` — superseding the narrower
`(-staging)?` shape planned and shipped in Task 1 above. Test coverage in Task 1 Step 2 gained accept-cases
for the four QA suffixes on both prefixes; the reserved-name rejections, cross-wiring cases, and
prefix-boundary cases (`ministry-admin-evil` / `website-evil`) were kept, not weakened.

**Accepted tradeoff:** a production deployment misconfigured to a QA-suffixed name (e.g.
`ministry-admin-test`) is now accepted by the code-layer assertion where the originally-planned pattern
would have failed closed — the Atlas grant is what now solely enforces that boundary. Full detail:
`docs/architecture/admin-database.md` § Amendment and this spec's own Amendment section.
