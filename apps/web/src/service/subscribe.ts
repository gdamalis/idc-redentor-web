import {
  SUBSCRIBE_BANNER_KEYS,
  type SubscribeBannerKey,
} from "@src/components/shared/subscribe-banner/subscribeBannerMessageKeys";

export interface SubscribeResult {
  success: boolean;
  messageKey?: SubscribeBannerKey;
}

export type SubscribeState = SubscribeResult | null;

const KNOWN_KEYS = Object.values(SUBSCRIBE_BANNER_KEYS) as string[];

export async function subscribe(email: string): Promise<SubscribeResult> {
  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    if (response.ok) {
      return { success: true };
    }

    const data = await response.json().catch(() => ({}));
    const messageKey =
      typeof data?.messageKey === "string" && KNOWN_KEYS.includes(data.messageKey)
        ? (data.messageKey as SubscribeBannerKey)
        : SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED;

    return { success: false, messageKey };
  } catch {
    return { success: false, messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED };
  }
}
