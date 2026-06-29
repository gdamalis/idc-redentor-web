import { BROADCAST_LOCALES, type BroadcastLocale } from "@src/service/broadcast/types";
import { isResendBroadcastConfigured } from "@src/service/broadcast/resendBroadcast";
import { sendBroadcast } from "@src/service/broadcast.service";
import {
  buildPostNotificationEmail,
  type PostNotificationContent,
} from "@src/service/post-notification.email";
import { getBlogPostPageById } from "@lib/contentful/getBlogPostPages";
import { getSermonById } from "@lib/contentful/getSermons";

export interface PublishEvent {
  contentTypeId: string;
  entryId: string;
}

type LocaleStatus = "sent" | "skipped" | "failed" | "no-content" | "not-configured";

export interface PostNotificationSummary {
  contentTypeId: string;
  handled: boolean;
  perLocale: Array<{ locale: BroadcastLocale; status: LocaleStatus; reason?: string }>;
}

interface ContentHandler {
  kind: "blog" | "sermon";
  getById: (id: string, locale: string) => Promise<unknown>;
  toContent: (post: unknown) => PostNotificationContent | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blogContent = (p: any): PostNotificationContent | null =>
  p?.title
    ? {
        title: p.title,
        slug: p.slug,
        excerpt: p.subtitle ?? p.seoDescription ?? "",
        imageUrl: p.featuredImage?.url,
      }
    : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sermonContent = (p: any): PostNotificationContent | null =>
  p?.title
    ? {
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt ?? "",
        imageUrl: p.featuredImage?.url,
      }
    : null;

const HANDLERS: Record<string, ContentHandler> = {
  blogPostPage: { kind: "blog", getById: getBlogPostPageById, toContent: blogContent },
  sermon: { kind: "sermon", getById: getSermonById, toContent: sermonContent },
};

async function notifyLocale(
  handler: ContentHandler,
  entryId: string,
  locale: BroadcastLocale,
): Promise<{ locale: BroadcastLocale; status: LocaleStatus; reason?: string }> {
  try {
    if (!isResendBroadcastConfigured(locale)) return { locale, status: "not-configured" };

    const post = await handler.getById(entryId, locale);
    const content = handler.toContent(post);
    if (!content) return { locale, status: "no-content" };

    const { subject, html, text } = buildPostNotificationEmail({
      kind: handler.kind,
      content,
      locale,
    });
    const broadcastId = `${handler.kind}:${entryId}:${locale}`;
    const result = await sendBroadcast({ broadcastId, subject, html, text, locale });
    return { locale, status: result.status, reason: result.reason };
  } catch (e) {
    console.error(
      `[post-notification] ${handler.kind} ${entryId} ${locale}:`,
      e instanceof Error ? e.message : String(e),
    );
    return { locale, status: "failed", reason: "exception" };
  }
}

export async function notifyOnPublish(event: PublishEvent): Promise<PostNotificationSummary> {
  const handler = HANDLERS[event.contentTypeId];
  if (!handler) {
    return { contentTypeId: event.contentTypeId, handled: false, perLocale: [] };
  }

  const perLocale: Array<{ locale: BroadcastLocale; status: LocaleStatus; reason?: string }> = [];
  for (const locale of BROADCAST_LOCALES) {
    perLocale.push(await notifyLocale(handler, event.entryId, locale));
  }

  return { contentTypeId: event.contentTypeId, handled: true, perLocale };
}
