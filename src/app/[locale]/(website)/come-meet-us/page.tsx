import { ContactForm } from "@src/components/features/contact-form";
import { ContactInformationSection } from "@src/components/features/contact-information-section";
import { Header } from "@src/components/shared/header";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t("conectemosPage.title"),
    description: t("conectemosPage.description"),
    keywords: t("conectemosPage.keywords"),
    openGraph: {
      title: t("conectemosPage.title"),
      description: t("conectemosPage.description"),
      image: "/assets/img/redentor_logo.png",
      url: "/come-meet-us",
    },
    alternates: {
      canonical: "/come-meet-us",
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
    },
  };
}

export default async function ComeMeetUsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main>
      <Header
        titlePath={"conectemosPage.headerTitle"}
        className="bg-community"
      />

      <div className="bg-blue-600/20 ">
        <Container className="max-w-5xl py-16 text-center sm:py-24">
          <Typography
            component="p"
            variant="body1"
            className="text-xl md:text-2xl dark:text-white"
          >
            Ser parte de nuestra comunidad es una gran responsabilidad igual que
            a formar parte de una familia. Cada miembro de la comunidad es un
            miembro imprescindible. Dios va juntando hijos suyos para formar
            parte de esta comunidad que sirve y da testimonio acerca de la
            persona y obra de Cristo en nuestro mundo.
          </Typography>
        </Container>
      </div>

      <ContactInformationSection />
      <ContactForm />
    </main>
  );
}
