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
    
    // MailChimp
    MAILCHIMP_API_KEY: string;
    MAILCHIMP_API_SERVER: string;
    MAILCHIMP_AUDIENCE_ID: string;

    // Resend Broadcasts
    RESEND_AUDIENCE_ID: string;
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
  }
} 