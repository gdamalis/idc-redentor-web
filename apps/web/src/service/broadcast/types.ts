import { z } from "zod";

export const BROADCAST_LOCALES = ["es-AR", "en-US"] as const;
export type BroadcastLocale = (typeof BROADCAST_LOCALES)[number];

export const broadcastInputSchema = z.object({
  /** Stable, caller-supplied id. ICR-44 uses `blog:<slug>:<locale>`. */
  broadcastId: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  /** Inner body HTML; the service wraps it in the broadcast template. */
  html: z.string().min(1),
  /** Plain-text alternative (Mailchimp `plain_text`). */
  text: z.string().min(1),
  locale: z.enum(BROADCAST_LOCALES),
});

export type BroadcastInput = z.infer<typeof broadcastInputSchema>;

export type BroadcastStatus = "sent" | "skipped" | "failed";

export interface BroadcastResult {
  status: BroadcastStatus;
  campaignId?: string;
  /** Non-secret token: already-sent | invalid-input | dedupe-unavailable | resend-not-configured | postal-address-missing | send-failed */
  reason?: string;
}
