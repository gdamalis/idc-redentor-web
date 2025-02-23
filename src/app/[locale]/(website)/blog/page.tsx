import { BlogSection } from "@src/components/features/blog-section";
import { ContactCta } from "@src/components/features/contact-cta";
import { fetchDummyBlogPosts } from "@src/data/sample-blog-posts";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
    params,
  }: Readonly<{
    params: Promise<{ locale: string }>;
  }>) {
    const { locale } = await params;
    const t = await getTranslations({ locale });
  
    return {
      title: t("blogPage.title"),
      description: t("blogPage.description"),
      keywords: t("blogPage.keywords"),
      openGraph: {
        title: t("blogPage.title"),
        description: t("blogPage.description"),
        image: "/assets/img/redentor_logo.png",
        url: "/blog",
      },
      alternates: {
        canonical: "/blog",
        languages: {
          "es-AR": "/es-AR",
          "en-US": "/en-US",
        },
      },
    };
  }

export default async function BlogPage() {
  const posts = await fetchDummyBlogPosts();

  return (
    <div>
      <BlogSection posts={posts} />
      <ContactCta />
    </div>
  );
}
