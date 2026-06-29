import { Resend } from "resend";
import { FROM_EMAIL } from "../mailing.service";
import { resolveAudienceId } from "@src/service/resendAudience";
import type { BroadcastLocale } from "./types";

export const BROADCAST_REPLY_TO = "info@idcredentor.org";
export const BROADCAST_FROM_NAME = "Iglesia de Cristo Redentor";

export interface BroadcastParams {
  subject: string;
  /** Internal broadcast name (not shown to subscribers; carries no PII). */
  name: string;
  html: string;
  text: string;
  /** Resolved by the caller from the locale via resolveAudienceId. */
  audienceId: string;
}

export type BroadcastDispatchResult =
  | { ok: true; id: string }
  | { ok: false; reason: "resend-not-configured" | "send-failed"; message?: string };

export function isResendBroadcastConfigured(locale: BroadcastLocale): boolean {
  return Boolean(process.env.RESEND_API_KEY && resolveAudienceId(locale));
}

export async function createAndSendBroadcast(
  params: BroadcastParams,
): Promise<BroadcastDispatchResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !params.audienceId) {
    return { ok: false, reason: "resend-not-configured" };
  }

  const from = `${BROADCAST_FROM_NAME} <${process.env.FROM_EMAIL ?? FROM_EMAIL}>`;
  const resend = new Resend(apiKey);

  const { data: created, error: createError } = await resend.broadcasts.create({
    audienceId: params.audienceId,
    from,
    replyTo: BROADCAST_REPLY_TO,
    subject: params.subject,
    html: params.html,
    text: params.text,
    name: params.name,
  });
  if (createError) {
    return { ok: false, reason: "send-failed", message: createError.message };
  }
  if (!created) {
    return { ok: false, reason: "send-failed", message: "no data returned" };
  }

  const { error: sendError } = await resend.broadcasts.send(created.id);
  if (sendError) {
    return { ok: false, reason: "send-failed", message: sendError.message };
  }

  return { ok: true, id: created.id };
}
