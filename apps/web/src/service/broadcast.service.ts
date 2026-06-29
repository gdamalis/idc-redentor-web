import { renderTemplate } from "@src/templates/template-engine";
import { BROADCAST_CHROME } from "@src/templates/broadcast.template";
import {
  broadcastInputSchema,
  type BroadcastInput,
  type BroadcastResult,
} from "./broadcast/types";
import { claimBroadcast, markFailed, markSent } from "./broadcast/broadcastLog";
import {
  isResendBroadcastConfigured,
  createAndSendBroadcast,
} from "./broadcast/resendBroadcast";

/**
 * Send ONE email to all current newsletter subscribers via a Resend broadcast.
 * Idempotent on `broadcastId`. Never throws — returns a typed result.
 */
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const parsed = broadcastInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    console.error(`[broadcast] invalid-input: ${fields}`);
    return { status: "failed", reason: "invalid-input" };
  }
  const { broadcastId, subject, html, text, locale } = parsed.data;

  if (!isResendBroadcastConfigured()) {
    console.error(`[broadcast] resend-not-configured for ${broadcastId}`);
    return { status: "failed", reason: "resend-not-configured" };
  }

  const postalAddress = process.env.BROADCAST_POSTAL_ADDRESS?.trim();
  if (!postalAddress) {
    console.error(`[broadcast] postal-address-missing for ${broadcastId}`);
    return { status: "failed", reason: "postal-address-missing" };
  }

  const claim = await claimBroadcast(broadcastId);
  if (claim === "already-sent") return { status: "skipped", reason: "already-sent" };
  if (claim === "error") return { status: "failed", reason: "dedupe-unavailable" };

  try {
    const chrome = BROADCAST_CHROME[locale];
    const wrappedHtml = renderTemplate("broadcast", {
      lang: locale,
      body: html,
      logoAlt: chrome.logoAlt,
      footer: chrome.footer,
      postalAddress,
      unsubscribeLabel: chrome.unsubscribeLabel,
    });
    const dispatch = await createAndSendBroadcast({
      subject,
      name: `broadcast ${broadcastId}`,
      html: wrappedHtml,
      text,
    });
    if (!dispatch.ok) {
      console.error(
        `[broadcast] ${dispatch.reason} for ${broadcastId}${dispatch.message ? `: ${dispatch.message}` : ""}`,
      );
      await markFailed(broadcastId, dispatch.reason);
      return { status: "failed", reason: dispatch.reason };
    }
    await markSent(broadcastId, dispatch.id);
    console.log(`[broadcast] sent ${broadcastId} (${locale}) broadcast=${dispatch.id}`);
    return { status: "sent", campaignId: dispatch.id };
  } catch (error) {
    console.error(
      `[broadcast] send-failed for ${broadcastId}:`,
      error instanceof Error ? error.message : String(error),
    );
    await markFailed(broadcastId, "send-failed");
    return { status: "failed", reason: "send-failed" };
  }
}
