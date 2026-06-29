import { Resend } from "resend";
import { resolveAudienceId } from "./resendAudience";
import type { BroadcastLocale } from "./broadcast/types";

export type SubscribeOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid-input" | "not-configured" | "already-subscribed" | "failed" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDuplicate(error: { name?: string; message?: string }): boolean {
  const haystack = `${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();
  return haystack.includes("already") || haystack.includes("exists");
}

export async function addSubscriber(
  email: string,
  locale: BroadcastLocale,
): Promise<SubscribeOutcome> {
  const trimmed = email?.trim();
  if (!trimmed || !EMAIL_RE.test(trimmed)) return { ok: false, reason: "invalid-input" };

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = resolveAudienceId(locale);
  if (!apiKey || !audienceId) return { ok: false, reason: "not-configured" };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.contacts.create({ audienceId, email: trimmed, unsubscribed: false });
    if (error) {
      if (isDuplicate(error)) return { ok: false, reason: "already-subscribed" };
      console.error(`[subscribe] resend error: ${error.message ?? "unknown"}`);
      return { ok: false, reason: "failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[subscribe] unexpected:", e instanceof Error ? e.message : String(e));
    return { ok: false, reason: "failed" };
  }
}
