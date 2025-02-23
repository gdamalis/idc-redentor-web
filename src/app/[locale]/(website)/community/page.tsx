import { ContactCta } from "@src/components/features/contact-cta";
import { CredoSection } from "@src/components/features/credo-section";
import { OurMissionSection } from "@src/components/features/our-mission-section";
import { Header } from "@src/components/shared/header";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t("comunidadPage.title"),
    description: t("comunidadPage.description"),
    keywords: t("comunidadPage.keywords"),
    openGraph: {
      title: t("comunidadPage.title"),
      description: t("comunidadPage.description"),
      image: "/assets/img/redentor_logo.png",
      url: "/community",
    },
    alternates: {
      canonical: "/community",
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
    },
  };
}

export default async function CommunityPage() {
  return (
    <main>
      <Header titlePath="comunidadPage.headerTitle" className="bg-community" />

      <div className="bg-blue-600/20 ">
        <Container className="max-w-5xl py-16 text-center sm:py-24">
          <Typography
            component="p"
            variant="body1"
            className="text-xl md:text-2xl dark:text-white"
          >
            La Iglesia de Cristo Redentor es una comunidad cristiana que busca
            proclamar las buenas nuevas del reino de Dios en Buenos Aires a
            través de la enseñanza de la Palabra, la vida comunitaria y la
            misión.
          </Typography>
          <Typography
            component="p"
            variant="body1"
            className="mt-6 text-xl md:text-2xl dark:text-white"
          >
            Somos una comunidad integrada por personas de diferentes países con
            profesiones diferentes.
          </Typography>
          <Typography
            component="p"
            variant="body1"
            className="mt-6 text-xl md:text-2xl dark:text-white"
          >
            Más allá de lo que hacemos, somos cristianos, seguidores de Jesús.
            No somos perfectos pero hemos sido redimidos. Dios nos ha llamado,
            por su misericordia a formar parte de su pueblo para anunciar al
            mundo lo que El ha hecho por nosotros.
          </Typography>
        </Container>
      </div>

      <CredoSection />
      <OurMissionSection />
      <ContactCta />
    </main>
  );
}
