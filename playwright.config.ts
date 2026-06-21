import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright is configured but the e2e suite is authored per-ticket by the `qa-runner` agent
 * (heavy QA depth). Phase 1 ships zero specs. Tests run against a Vercel PREVIEW deployment
 * via the BASE_URL env var (never production — see qaLoop.env.preview in .claude/config.json).
 *
 * Project names mirror .claude/config.json → playwrightProjectMap:
 *   e2ePublic · e2eBlog · apiForms · apiLikes
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "es-AR",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "e2ePublic", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "e2eBlog", testMatch: /blog\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "apiForms", testMatch: /api\/forms.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "apiLikes", testMatch: /api\/likes.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
