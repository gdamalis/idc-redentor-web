import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getLatestBlogPostPages } from "@lib/contentful/getBlogPostPages";
import { getContentCollection } from "@lib/contentful/getContentCollection";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import { mapContentCollection } from "@lib/contentful/mapContentCollection";
import { buildPageMetadata } from "@lib/metadata";
import { BlogSection } from "@src/components/features/blog-section";
import {
  ComponentCta,
  ComponentCtaLive,
} from "@src/components/features/component-cta";
import {
  OurMissionCta,
  OurMissionCtaLive,
} from "@src/components/features/our-mission-cta";
import {
  OurMissionSection,
  OurMissionSectionLive,
} from "@src/components/features/our-mission-section";
import { type Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ machineName: "seo-home", locale, path: "" });
}

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isEnabled = await shouldUseDraftMode();
  const ourMission = await getHeroBannerComponent(
    "our-mission",
    locale,
    isEnabled,
  );
  const ourMissionCollection = await getContentCollection(
    "collection-our-mission",
    locale,
    isEnabled,
  );
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );
  const latestPosts = await getLatestBlogPostPages(locale, {
    isDraftMode: isEnabled,
  });

  return (
    <main>
      {isEnabled ? (
        <OurMissionCtaLive raw={ourMission} locale={locale} />
      ) : (
        <OurMissionCta content={ourMission} />
      )}
      {isEnabled ? (
        <OurMissionSectionLive raw={ourMissionCollection} locale={locale} />
      ) : (
        <OurMissionSection
          content={mapContentCollection(ourMissionCollection)}
        />
      )}
      <BlogSection posts={latestPosts} />
      {isEnabled ? (
        <ComponentCtaLive raw={contactCta} locale={locale} />
      ) : (
        <ComponentCta content={contactCta} />
      )}
    </main>
  );
}
