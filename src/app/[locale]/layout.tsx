import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getFooter } from "@lib/contentful/getFooter";
import { getNavigationMenu } from "@lib/contentful/getNavigationMenu";
import { getSingleEmailForm } from "@lib/contentful/getSingleEmailForm";
import { buildOrganizationJsonLd, DEFAULT_OG_IMAGE } from "@lib/metadata";
import { ConsentBanner } from "@src/components/shared/consent-banner/ConsentBanner";
import { Footer } from "@src/components/shared/footer";
import { JsonLd } from "@src/components/shared/json-ld";
import { NavbarWrapper } from "@src/components/shared/navbar";
import { SubscribeBanner } from "@src/components/shared/subscribe-banner";
import { Toaster } from "@src/components/ui/toaster";
import { routing } from "@src/i18n/routing";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleTagManager } from "@next/third-parties/google";
import { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Outfit, Playfair_Display } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { notFound } from "next/navigation";
import "../globals.css";

const consentDefaultScript = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

var consent = null;
try { consent = localStorage.getItem('analytics-consent'); } catch(e) {}

gtag('consent', 'default', {
  'analytics_storage': consent === 'granted' ? 'granted' : 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});
`;

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL!),
  title: {
    template: "%s | Iglesia de Cristo Redentor",
    default: "Iglesia de Cristo Redentor",
  },
  description:
    "Iglesia de Cristo Redentor - Comunidad cristiana reformada en Buenos Aires.",
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: React.ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const isEnabled = await shouldUseDraftMode();
  const navMenu = await getNavigationMenu("main-menu", locale, isEnabled);
  const footerContent = await getFooter(locale, isEnabled);
  const subscribeContent = await getSingleEmailForm(
    "single-email-subscribe",
    locale,
    isEnabled,
  );

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${outfit.variable} ${playfairDisplay.variable} font-sans antialiased`}>
        <Script
          id="consent-defaults"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: consentDefaultScript }}
        />
        <JsonLd data={buildOrganizationJsonLd(locale)} />
        <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID!} />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <NextIntlClientProvider messages={messages}>
            <NavbarWrapper menuItems={navMenu} />
            {children}
            <SubscribeBanner content={subscribeContent} />
            <Footer content={footerContent} />
            <ConsentBanner />
            <Toaster />
          </NextIntlClientProvider>
          <SpeedInsights />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
