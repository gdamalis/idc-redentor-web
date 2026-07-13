import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import headersConfig from "./config/headers";

const withNextIntl = createNextIntlPlugin();
const nextConfig: NextConfig = {
  // @playwright/test is a devDependency, only ever dynamically imported behind the
  // renderSermonPdf.ts local/dev branch (ICR-114) — externalizing it here stops
  // webpack from tracing/bundling it into the Vercel function even though it's a
  // dynamic import; that branch never runs in a Vercel/Lambda environment.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "@playwright/test"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.eu.ctfassets.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
      },
    ],
  },
  headers: headersConfig,
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only log source-map upload noise in CI.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Same-origin tunnel: browser events POST to /monitoring and the server
  // forwards them. Keeps the CSP untouched and dodges ad-blockers.
  // NOTE: /monitoring MUST stay excluded from the src/proxy.ts matcher.
  tunnelRoute: "/monitoring",
});
