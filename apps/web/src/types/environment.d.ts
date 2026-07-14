declare namespace NodeJS {
  interface ProcessEnv {
    // Base URL
    NEXT_PUBLIC_BASE_URL: string;
    
    // Vercel Environment
    VERCEL_ENV?: 'production' | 'preview' | 'development';
    
    // Contentful CMS
    CONTENTFUL_SPACE_ID: string;
    CONTENTFUL_ACCESS_TOKEN: string;
    CONTENTFUL_PREVIEW_ACCESS_TOKEN: string;
    CONTENTFUL_PREVIEW_SECRET: string;
    CONTENTFUL_REVALIDATE_SECRET: string;
    CONTENTFUL_ENVIRONMENT?: string;
    CONTENTFUL_MANAGEMENT_ACCESS_TOKEN: string;

    // Predica PDF regeneration webhook + cron
    PREDICA_REGEN_SECRET: string;
    CRON_SECRET: string;
    PDF_REGEN_QUIET_WINDOW_SECONDS?: string;

    // Resend Broadcasts
    RESEND_AUDIENCE_ID: string;
    RESEND_AUDIENCE_ID_ES_AR: string;
    RESEND_AUDIENCE_ID_EN_US: string;
    BROADCAST_POSTAL_ADDRESS: string;

    // Mail Provider
    MAIL_PROVIDER: 'sendgrid' | 'resend';
    CONTACT_FORM_RECIPIENT_EMAIL: string;
    FROM_EMAIL: string;
    
    // SendGrid
    SENDGRID_API_KEY: string;
    
    // Resend
    RESEND_API_KEY: string;
    
    // MongoDB
    MONGODB_URI: string;

    // Sentry (observability) — see docs/architecture/observability-sentry.md
    NEXT_PUBLIC_SENTRY_DSN?: string;
    NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
    // Injected automatically by Vercel — the browser-readable mirror of VERCEL_ENV.
    // Normally left unset locally; see resolveSentryEnvironment() in
    // src/utils/sentry/options.ts for why this is in the fallback chain.
    NEXT_PUBLIC_VERCEL_ENV?: 'production' | 'preview' | 'development';
    SENTRY_ORG?: string;
    SENTRY_PROJECT?: string;
    SENTRY_AUTH_TOKEN?: string;
  }
}