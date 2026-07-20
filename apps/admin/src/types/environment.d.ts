declare namespace NodeJS {
  interface ProcessEnv {
    // MongoDB — Ministry Admin Panel (congregant PII). The DB name rides in the
    // URI PATH (see .env.example) — there is deliberately no separate DB-name
    // env var (docs/architecture/contentful-environments.md's sibling data-layer
    // decision; see src/service/database.service.ts).
    MONGODB_URI: string;

    // Base URL
    NEXT_PUBLIC_ADMIN_BASE_URL: string;

    // Firebase — client SDK (browser-safe)
    NEXT_PUBLIC_FIREBASE_API_KEY: string;
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
    NEXT_PUBLIC_FIREBASE_APP_ID: string;

    // Firebase — Admin SDK (server-only service account)
    FIREBASE_PROJECT_ID: string;
    FIREBASE_CLIENT_EMAIL: string;
    FIREBASE_PRIVATE_KEY: string;

    // Email — invite + password-reset flows (server-only)
    RESEND_API_KEY: string;
    FROM_EMAIL: string;
  }
}
