import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getContentCollection } from "@lib/contentful/getContentCollection";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getTextBlockComponent } from "@lib/contentful/getTextBlockComponent";
import { mapContentCollection } from "@lib/contentful/mapContentCollection";
import { buildPageMetadata } from "@lib/metadata";
import { ComponentCta } from "@src/components/features/component-cta";
import { CreedSection } from "@src/components/features/creed-section";
import InfoCommunity from "@src/components/features/info-community/InfoCommunity";
import { OurMissionSection } from "@src/components/features/our-mission-section";
import { PhotoGrid } from "@src/components/features/photo-grid";
import { Header } from "@src/components/shared/header";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    machineName: "seo-community",
    locale,
    path: "community",
  });
}

export default async function CommunityPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Community");
  const isEnabled = await shouldUseDraftMode();
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );
  const infoCommunity = await getTextBlockComponent(
    "info-community",
    locale,
    isEnabled,
  );
  const ourCreedContent = await getContentCollection(
    "our-creed",
    locale,
    isEnabled,
  );
  const ourMissionCollection = await getContentCollection(
    "collection-our-mission",
    locale,
    isEnabled,
  );

  return (
    <main>
      <Header 
        titlePath="Community.header-title" 
        variant="gradient"
        subtitle={t("header-subtitle")}
      />
      {infoCommunity?.imagesCollection?.items && infoCommunity.imagesCollection.items.length > 0 && (
        <PhotoGrid 
          images={infoCommunity.imagesCollection.items}
          caption={t("photo-grid-caption")}
        />
      )}
      <InfoCommunity content={infoCommunity} />
      <CreedSection content={mapContentCollection(ourCreedContent)} />
      <OurMissionSection content={mapContentCollection(ourMissionCollection)} />
      <ComponentCta content={contactCta} />
    </main>
  );
}
