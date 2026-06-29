import type { BroadcastLocale } from "@src/service/broadcast/types";

/** Inner body only — wrapped by the "broadcast" chrome in sendBroadcast. */
export const POST_NOTIFICATION_TEMPLATE = `
<h1 style="margin:0 0 12px;font-size:22px;color:#111;">{{title}}</h1>
{{imageBlock}}
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#444;">{{excerpt}}</p>
<p style="margin:0;">
  <a href="{{ctaUrl}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">{{ctaLabel}}</a>
</p>
`;

interface NotificationCopy {
  subjectPrefix: string;
  ctaLabel: string;
}

export const POST_NOTIFICATION_COPY: Record<
  BroadcastLocale,
  { blog: NotificationCopy; sermon: NotificationCopy }
> = {
  "es-AR": {
    blog: { subjectPrefix: "Nueva publicación", ctaLabel: "Leer más" },
    sermon: { subjectPrefix: "Nueva prédica", ctaLabel: "Ver la prédica" },
  },
  "en-US": {
    blog: { subjectPrefix: "New post", ctaLabel: "Read more" },
    sermon: { subjectPrefix: "New sermon", ctaLabel: "Watch the sermon" },
  },
};
