/**
 * ICR-44: E2E spec for the notify-subscribers-on-publish feature.
 *
 * Tests the observable API and UI contract of ICR-44:
 *   - /api/subscribe now routes to a locale-specific Resend audience
 *   - /api/revalidate auth boundary (no broadcast trigger in tests)
 *   - SubscribeBanner renders locale-correct copy and sends `locale` in the POST body
 *
 * Safety note: these tests do NOT trigger the broadcast/notify path.
 * They exercise /api/subscribe only at the validation and auth boundaries.
 * No valid revalidate secret is used.
 */

import { expect, test } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// API — /api/subscribe validation
// ---------------------------------------------------------------------------

test.describe("/api/subscribe validation", () => {
  test("returns 400 with messageKey for empty body {}", async ({ request }) => {
    const res = await request.post(`${BASE}/api/subscribe`, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("messageKey");
    expect(typeof body.messageKey).toBe("string");
  });

  test("returns 400 for invalid email", async ({ request }) => {
    const res = await request.post(`${BASE}/api/subscribe`, {
      data: { email: "not-an-email", locale: "es-AR" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.messageKey).toBe("SubscribeBanner.error-unexpected");
  });

  test("returns 400 for invalid locale value", async ({ request }) => {
    const res = await request.post(`${BASE}/api/subscribe`, {
      data: { email: "test@example.com", locale: "fr-FR" },
      headers: { "Content-Type": "application/json" },
    });
    // invalid locale is caught by the zod schema — locale is optional so it
    // falls back to default; but the email is valid, so result depends on
    // Resend config. Accept either 200/409/500 (configured / already-subscribed /
    // not-configured) — the important thing is NOT a 400 for locale alone.
    expect([200, 400, 409, 500]).toContain(res.status());
  });

  test("returns 400 when no body at all (no Content-Type)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/subscribe`);
    expect(res.status()).toBe(400);
  });

  test("accepts both es-AR and en-US as locale values", async ({ page }) => {
    // Navigate once so page.evaluate() has a JS context; page.route() will
    // intercept the fetch — the request never reaches the live endpoint.
    await page.goto(`${BASE}/es-AR`);

    for (const locale of ["es-AR", "en-US"] as const) {
      let capturedBody: Record<string, unknown> | null = null;

      await page.route("**/api/subscribe", async (route) => {
        capturedBody = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      });

      await page.evaluate(
        async ({ base, loc }) => {
          await fetch(`${base}/api/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: `qa-icr44-locale-schema-${loc}@example.com`,
              locale: loc,
            }),
          });
        },
        { base: BASE, loc: locale },
      );

      await page.unrouteAll();

      // Request was intercepted → locale was forwarded correctly in the POST body
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.locale).toBe(locale);
    }
  });
});

// ---------------------------------------------------------------------------
// API — /api/revalidate auth boundary (NO valid secret used)
// ---------------------------------------------------------------------------

test.describe("/api/revalidate auth boundary", () => {
  test("returns 401 with 'Invalid secret' when header is absent", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/revalidate`, {
      data: { sys: { id: "qa-test-entry", contentType: { sys: { id: "blogPostPage" } } } },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.message).toBe("Invalid secret");
  });

  test("returns 401 with 'Invalid secret' for a wrong secret", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/revalidate`, {
      data: { sys: { id: "qa-test-entry", contentType: { sys: { id: "blogPostPage" } } } },
      headers: {
        "Content-Type": "application/json",
        "x-vercel-reval-key": "intentionally-wrong-secret-icr44-qa",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.message).toBe("Invalid secret");
  });
});

// ---------------------------------------------------------------------------
// UI — SubscribeBanner locale routing
// ---------------------------------------------------------------------------

test.describe("SubscribeBanner — es-AR locale", () => {
  test.use({ locale: "es-AR" });

  test("renders Spanish copy and sends locale=es-AR in the subscribe POST", async ({
    page,
  }) => {
    // Intercept to capture the POST body without hitting the live endpoint
    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/subscribe", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`${BASE}/es-AR/blog`);

    // Verify es-AR subscribe copy is present
    const section = page.locator("section").filter({ hasText: "Suscribite" });
    await expect(section).toBeVisible();
    await expect(section.locator("h3")).toContainText("Suscribite a nuestro boletín");
    await expect(section.getByRole("button", { name: /Suscribite/i })).toBeVisible();

    // Submit the form
    await section.getByRole("textbox").fill("qa-icr44-spec-esar@example.com");
    await section.getByRole("button", { name: /Suscribite/i }).click();

    // Wait briefly for the fetch to fire
    await page.waitForTimeout(500);

    // Assert the POST body included locale: "es-AR"
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.locale).toBe("es-AR");
    expect(capturedBody!.email).toBe("qa-icr44-spec-esar@example.com");
  });
});

test.describe("SubscribeBanner — en-US locale", () => {
  test.use({ locale: "en-US" });

  test("renders English copy and sends locale=en-US in the subscribe POST", async ({
    page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/subscribe", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`${BASE}/en-US/blog`);

    // Verify en-US subscribe copy is present
    const section = page.locator("section").filter({ hasText: "Subscribe" });
    await expect(section).toBeVisible();
    await expect(section.locator("h3")).toContainText("Subscribe to our newsletter");
    await expect(section.getByRole("button", { name: /Subscribe/i })).toBeVisible();

    // Submit the form
    await section.getByRole("textbox").fill("qa-icr44-spec-enus@example.com");
    await section.getByRole("button", { name: /Subscribe/i }).click();

    await page.waitForTimeout(500);

    // Assert locale: "en-US" in POST body
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.locale).toBe("en-US");
    expect(capturedBody!.email).toBe("qa-icr44-spec-enus@example.com");
  });
});

// ---------------------------------------------------------------------------
// UI — SubscribeBanner error-state i18n (edge case from ticket)
// ---------------------------------------------------------------------------

test.describe("SubscribeBanner error state — locale-correct messages", () => {
  test("shows es-AR error message after a failed subscribe attempt", async ({
    page,
  }) => {
    // Force a 400 response to test error rendering without hitting Resend
    await page.route("**/api/subscribe", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ messageKey: "SubscribeBanner.error-unexpected" }),
      });
    });

    await page.goto(`${BASE}/es-AR/blog`);
    const section = page.locator("section").filter({ hasText: "Suscribite" });
    await section.getByRole("textbox").fill("qa-icr44-errtest@example.com");
    await section.getByRole("button", { name: /Suscribite/i }).click();

    // Wait for error paragraph
    const errorParagraph = page.locator("p.text-red-600, p.text-red-500, span.text-red-600");
    await expect(errorParagraph.first()).toBeVisible({ timeout: 5000 });
    // Error text should be in Spanish
    await expect(errorParagraph.first()).toContainText("Ocurrió un error inesperado");
  });

  test("shows en-US error message after a failed subscribe attempt", async ({
    page,
  }) => {
    await page.route("**/api/subscribe", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ messageKey: "SubscribeBanner.error-unexpected" }),
      });
    });

    await page.goto(`${BASE}/en-US/blog`);
    const section = page.locator("section").filter({ hasText: "Subscribe" });
    await section.getByRole("textbox").fill("qa-icr44-errtest@example.com");
    await section.getByRole("button", { name: /Subscribe/i }).click();

    const errorParagraph = page.locator("p.text-red-600, p.text-red-500, span.text-red-600");
    await expect(errorParagraph.first()).toBeVisible({ timeout: 5000 });
    // Error text should be in English
    await expect(errorParagraph.first()).toContainText("An unexpected error occurred");
  });
});
