/**
 * ICR-114: E2E spec for the predica PDF-regen webhook + cron AUTH BOUNDARY ONLY.
 *
 * Safety note: PREDICA_REGEN_SECRET / CRON_SECRET / CONTENTFUL_MANAGEMENT_ACCESS_TOKEN /
 * MONGODB_URI are NOT set on preview deployments (env-limited, see ICR-44 lesson + the
 * cron route's own doc comment: Vercel Cron only ever invokes production, never a
 * preview). These tests therefore exercise ONLY the fail-closed auth rejection —
 * they never send a valid secret and never attempt to reach the mark-dirty/render/
 * write-back path. The happy-path (AC1/AC2/AC3/AC5) and the "non-sermon payload ->
 * 200 no-op" branch of AC4 are BLOCKED on preview and deferred to post-merge staging
 * QA where the secrets exist.
 */

import { expect, test } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("/api/predica/regenerate-pdf webhook auth boundary", () => {
  test("returns 401 'Invalid secret' when x-predica-regen-key is absent", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {
        sys: { id: "qa-icr114-test", contentType: { sys: { id: "sermon" } } },
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Invalid secret" });
  });

  test("returns 401 'Invalid secret' for a wrong x-predica-regen-key", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {
        sys: { id: "qa-icr114-test", contentType: { sys: { id: "sermon" } } },
      },
      headers: {
        "Content-Type": "application/json",
        "x-predica-regen-key": "intentionally-wrong-secret-icr114-qa",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Invalid secret" });
  });

  test("401 body never leaks the configured secret or a stack trace", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain("at ");
    expect(text.toLowerCase()).not.toContain("error:");
    expect(text.length).toBeLessThan(200);
  });
});

test.describe("/api/predica/regenerate-pdf/cron auth boundary", () => {
  test("returns 401 'Unauthorized' when Authorization header is absent", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  test("returns 401 'Unauthorized' for a wrong bearer token", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`, {
      headers: { Authorization: "Bearer intentionally-wrong-cron-secret-icr114-qa" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  test("401 body never leaks the configured secret or a stack trace", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`);
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain("at ");
    expect(text.toLowerCase()).not.toContain("error:");
    expect(text.length).toBeLessThan(200);
  });
});
