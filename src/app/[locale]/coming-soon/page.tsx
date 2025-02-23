import LanguageSwitcher from "@src/components/shared/language-switcher/LanguageSwitcher";
import SocialLinks from "@src/components/shared/social-links/SocialLinks";
import { SubscribeForm } from "@src/components/shared/subscribe-form";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t("coming-soon.metadata.title"),
    description: t("coming-soon.metadata.description"),
  };
}

export default async function ComingSoonPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return (
    <main className="py-12 h-screen">
      <Container className="flex flex-col justify-between h-full">
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
        </div>
        <section className="flex flex-col items-center justify-center h-full space-y-12 md:max-w-screen-md md:mx-auto">
          <div className="flex flex-col items-center space-y-8">
            <Image
              src="/assets/img/redentor_logo.png"
              className="h-32 w-32"
              width={60}
              height={80}
              alt="Redentor church logo"
            />
            <Typography
              component="h1"
              variant="h1"
              className="text-4xl font-bold mb-6 md:text-6xl"
            >
              {t("coming-soon.title")}
            </Typography>
            <Typography
              component="p"
              variant="body1"
              className="text-center text-xl"
            >
              {t("coming-soon.message.line-1")}
            </Typography>
            <Typography
              component="p"
              variant="body1"
              className="text-center text-xl"
            >
              {t("coming-soon.message.line-2")}
            </Typography>
          </div>
          <SubscribeForm
            className="mb-2"
            size="lg"
            ctaSrLabel={t("coming-soon.notify.input-sr-label")}
            ctaText={t("coming-soon.notify.cta-text")}
            placeholder={t("coming-soon.notify.placeholder")}
          />
          <SocialLinks className="justify-center" />
        </section>
      </Container>
    </main>
  );
}
