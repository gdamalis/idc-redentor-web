import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getSeo } from "@lib/contentful/getSeo";
import { BlogSection } from "@src/components/features/blog-section";
import { ContactCta } from "@src/components/features/contact-cta";
import { fetchDummyBlogPosts } from "@src/data/sample-blog-posts";
import { localesPath } from "@src/i18n/config";
import { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;

  const seoContent = await getSeo("seo-blog", locale);
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

export default async function BlogPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { isEnabled } = await draftMode();
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );

  const posts = await fetchDummyBlogPosts();

  return (
    <div>
      <BlogSection posts={posts} />
      <ContactCta content={contactCta} />
    </div>
  );
}
