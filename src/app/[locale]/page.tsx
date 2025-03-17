import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import { getSeo } from "@lib/contentful/getSeo";
import { ContactCta } from "@src/components/features/contact-cta";
import { OurMissionCta } from "@src/components/features/our-mission-cta";
import { localesPath } from "@src/i18n/config";
import { type Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;

  const seoContent = await getSeo("seo-home", locale);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    title: seoContent.title,
    description: seoContent.description,
    keywords: seoContent.keywords,
    openGraph: {
      title: seoContent.title,
      description: seoContent.description,
      images: [{ url: seoContent.image.url }],
      url: `${baseUrl}/${locale}`,
      siteName: seoContent.siteName,
      type: seoContent.type,
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: localesPath,
    },
  };
}

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { isEnabled } = await draftMode();
  const ourMission = await getHeroBannerComponent(
    "our-mission",
    locale,
    isEnabled,
  );
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );

  return (
    <main>
      <OurMissionCta content={ourMission} />
      {/* <BlogSection posts={posts} /> */}
      <ContactCta content={contactCta} />
    </main>
  );
}
