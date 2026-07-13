/**
 * ICR-111: fail soft when the likes DB (MongoDB) is unavailable.
 *
 * Vercel PREVIEW deployments for this project have NO `MONGODB_URI` (previews lack
 * runtime secrets) — so every request in this suite exercises the REAL degraded path,
 * not a mock. That is intentional: the preview environment is a faithful, permanent
 * reproduction of a total Mongo outage. See src/service/like.service.ts and
 * src/app/api/likes/route.ts.
 *
 * Covers (see tasks/specs for the full AC list):
 *  - AC1/AC2: the article page still renders 200 with its content intact and the like
 *    control (not a disabled/zeroed heart — genuinely ABSENT) omitted, in both locales.
 *  - AC4: GET /api/likes returns 503 with a clean body — never a fabricated `count: 0`.
 *
 * The healthy-Mongo path (AC3: like count/toggle) CANNOT be exercised here — there is no
 * DB to be healthy against on preview — and is covered instead by the unit tests
 * (src/service/like.service.test.ts) plus post-merge staging QA.
 */
import { expect, test } from "@playwright/test";

const SLUG = "retiro-idc-redentor-2026";

const LIKE_ARIA_LABELS = ["Me gusta", "Ya no me gusta", "Like", "Unlike"];
const SHARE_LABEL = { "es-AR": "Compartir", "en-US": "Share" } as const;

test.describe("Blog article — fail-soft when likes DB is unavailable", () => {
  for (const locale of ["es-AR", "en-US"] as const) {
    test(`${locale}: article renders 200 with content intact and no like control`, async ({
      page,
    }) => {
      const res = await page.goto(`/${locale}/blog/${SLUG}`);
      expect(res?.status()).toBeLessThan(400);

      // Title + body render.
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      // Share control is present — proves PostActions rendered and only the like
      // control (which is conditional on a successful DB read) was omitted.
      await expect(
        page.getByRole("button", { name: SHARE_LABEL[locale] }),
      ).toBeVisible();

      // The like control must be genuinely ABSENT, not a disabled/zeroed heart.
      for (const label of LIKE_ARIA_LABELS) {
        await expect(page.getByRole("button", { name: label })).toHaveCount(0);
      }
    });
  }

  test("edge case: GET /api/likes returns 503 with no fabricated count when the DB is down", async ({
    request,
  }) => {
    const res = await request.get(`/api/likes?slug=${SLUG}`);
    expect(res.status()).toBe(503);

    const body = await res.json();
    expect(body).toEqual({ error: "Service Unavailable" });
    expect(body).not.toHaveProperty("count");
    expect(body).not.toHaveProperty("hasLiked");
  });
});
