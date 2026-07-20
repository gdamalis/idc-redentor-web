declare namespace NodeJS {
  interface ProcessEnv {
    // MongoDB — ONE connection string per database (ICR-166). The DB name rides
    // in each URI's PATH (see .env.example) — there is deliberately no separate
    // DB-name env var. Each is read by exactly one accessor in
    // src/service/database.service.ts, which asserts the resolved name.
    // See docs/architecture/admin-database.md.
    MONGODB_URI: string; // -> ministry-admin | ministry-admin-staging (getAdminDb)
    WEBSITE_MONGODB_URI: string; // -> website | website-staging (getContentDb)

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
