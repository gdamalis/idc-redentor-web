import type { Metadata } from "next";
import type { Sermon } from "@src/types/Sermon";
import { buildLocaleAlternates } from "@src/i18n/config";
import { DEFAULT_OG_IMAGE } from "./metadata";

interface BuildSermonMetadataOptions {
  sermon: Sermon;
  locale: string;
  path: string;
}

/**
 * Formats a duration in seconds to ISO-8601 duration string.
 * Examples: 2730 → "PT45M30S", 3661 → "PT1H1M1S"
 */
export function formatIsoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `PT${hours}H${minutes}M${secs}S`;
  }
  return `PT${minutes}M${secs}S`;
}

export function buildSermonMetadata({
  sermon,
  locale,
  path,
}: BuildSermonMetadataOptions): Metadata {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const pageUrl = `${baseUrl}/${locale}/${path}`;

  // featuredImage is optional in Contentful and is often empty on drafts, so
  // fall back to the site-wide default OG image rather than dereferencing a
  // missing asset (which previously 500'd the live preview).
  const ogImage = sermon.featuredImage
    ? {
        url: sermon.featuredImage.url,
        width: 1200,
        height: 630,
        alt: sermon.featuredImage.title,
      }
    : DEFAULT_OG_IMAGE;

  const audioEntry = sermon.audio
    ? { url: sermon.audio.url, type: sermon.audio.contentType }
    : undefined;

  return {
    title: sermon.seoTitle,
    description: sermon.seoDescription,
    keywords: sermon.keywords,
    openGraph: {
      title: sermon.seoTitle,
      description: sermon.seoDescription,
      images: [ogImage],
      url: pageUrl,
      type: "article",
      locale: locale.replace("-", "_"),
      publishedTime: sermon.sermonDate,
      modifiedTime: sermon.sys.publishedAt ?? sermon.sermonDate,
      authors: [sermon.preacher.name],
      tags: sermon.keywords,
      ...(audioEntry ? { audio: audioEntry } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: sermon.seoTitle,
      description: sermon.seoDescription,
      images: [ogImage],
    },
    alternates: {
      canonical: pageUrl,
      languages: buildLocaleAlternates(path),
    },
  };
}

export function buildSermonJsonLd(sermon: Sermon, locale: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const audioObject = sermon.audio
    ? {
        "@type": "AudioObject" as const,
        contentUrl: sermon.audio.url,
        encodingFormat: sermon.audio.contentType,
        ...(sermon.durationSeconds
          ? { duration: formatIsoDuration(sermon.durationSeconds) }
          : {}),
      }
    : undefined;

  const citations =
    sermon.scriptureReferences && sermon.scriptureReferences.length > 0
      ? sermon.scriptureReferences.map(
          (ref) =>
            `${ref.book} ${ref.chapter}:${ref.fromVerse}${ref.toVerse != null ? `-${ref.toVerse}` : ""} (${ref.bibleVersion})`,
        )
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Article" as const,
    headline: sermon.seoTitle,
    description: sermon.seoDescription,
    image: sermon.featuredImage?.url ?? `${baseUrl}${DEFAULT_OG_IMAGE.url}`,
    datePublished: sermon.sermonDate,
    dateModified: sermon.sys.publishedAt ?? sermon.sermonDate,
    author: {
      "@type": "Person" as const,
      name: sermon.preacher.name,
    },
    publisher: {
      "@type": "Organization" as const,
      name: "Iglesia de Cristo Redentor",
      logo: {
        "@type": "ImageObject" as const,
        url: `${baseUrl}/assets/img/redentor_logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage" as const,
      "@id": `${baseUrl}/${locale}/predicas/${sermon.slug}`,
    },
    keywords: sermon.keywords?.join(", "),
    inLanguage: locale,
    ...(audioObject
      ? {
          audio: audioObject,
          associatedMedia: [
            { "@type": "AudioObject" as const, contentUrl: sermon.audio!.url },
          ],
        }
      : {}),
    ...(citations ? { citation: citations } : {}),
  };
}
