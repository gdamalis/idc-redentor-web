import { renderTemplate } from "@src/templates/template-engine";
import { POST_NOTIFICATION_COPY } from "@src/templates/post-notification.template";
import type { BroadcastLocale } from "@src/service/broadcast/types";

export interface PostNotificationContent {
  title: string;
  slug: string;
  excerpt: string;
  imageUrl?: string;
}

const SEGMENT: Record<"blog" | "sermon", string> = {
  blog: "blog",
  sermon: "predicas",
};

export function buildPostNotificationEmail(input: {
  kind: "blog" | "sermon";
  content: PostNotificationContent;
  locale: BroadcastLocale;
}): { subject: string; html: string; text: string } {
  const { kind, content, locale } = input;
  const copy = POST_NOTIFICATION_COPY[locale][kind];
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const ctaUrl = `${base}/${locale}/${SEGMENT[kind]}/${content.slug}`;
  const imageBlock = content.imageUrl
    ? `<img src="${content.imageUrl}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:0 0 16px;" />`
    : "";
  const subject = `${copy.subjectPrefix}: ${content.title}`;
  const html = renderTemplate("post-notification", {
    title: content.title,
    excerpt: content.excerpt,
    ctaUrl,
    ctaLabel: copy.ctaLabel,
    imageBlock,
  });
  const text = `${content.title}\n\n${content.excerpt}\n\n${copy.ctaLabel}: ${ctaUrl}`;
  return { subject, html, text };
}
