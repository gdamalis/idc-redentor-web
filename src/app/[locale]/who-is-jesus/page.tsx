import { getSeo } from '@lib/contentful/getSeo';
import { localesPath } from '@src/i18n/config';
import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;

  const seoContent = await getSeo("seo-who-is-jesus", locale);
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

export default function WhoIsJesusPage() {
  return (
    <div>WhoIsJesusPage</div>
  )
}
