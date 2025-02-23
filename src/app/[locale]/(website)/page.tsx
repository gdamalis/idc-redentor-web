import { BlogSection } from "@src/components/features/blog-section";
import { ContactCta } from "@src/components/features/contact-cta";
import { OurMissionCta } from "@src/components/features/our-mission-cta";
import { fetchDummyBlogPosts } from "@src/data/sample-blog-posts";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t("homePage.title"),
    description: t("homePage.description"),
    keywords: t("homePage.keywords"),
    openGraph: {
      title: t("homePage.title"),
      description: t("homePage.description"),
      image: "/assets/img/redentor_logo.png",
      url: "/",
    },
    alternates: {
      canonical: "/",
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
    },
  };
}

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  const posts = await fetchDummyBlogPosts();
  setRequestLocale(locale);

  return (
    <main>
      <OurMissionCta />
      <BlogSection posts={posts} />
      <ContactCta />
    </main>
  );
}
