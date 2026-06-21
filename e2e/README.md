# End-to-end tests (Playwright)

This directory is intentionally empty of specs in Phase 1. The `qa-runner` agent authors
`e2e/<area>/<slug>.spec.ts` per ticket on **heavy** QA depth, and tests run against the PR's
**Vercel preview deployment** (`BASE_URL` env), never production.

Project names (see `.claude/config.json` → `playwrightProjectMap`):

- `e2ePublic` — `e2e/public/*.spec.ts` (home, community, come-meet-us, who-is-jesus)
- `e2eBlog` — `e2e/blog/*.spec.ts`
- `apiForms` — `e2e/api/forms*.spec.ts` (contact, subscribe, revalidate, draft)
- `apiLikes` — `e2e/api/likes*.spec.ts`

Run: `pnpm e2e` (all) or `pnpm e2e --project=e2eBlog`.
