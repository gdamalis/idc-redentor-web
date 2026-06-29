import {
  DEFAULT_BROADCAST_LOCALE,
  type BroadcastLocale,
} from "@src/service/broadcast/types";

const ENV_BY_LOCALE: Record<BroadcastLocale, string> = {
  "es-AR": "RESEND_AUDIENCE_ID_ES_AR",
  "en-US": "RESEND_AUDIENCE_ID_EN_US",
};

/**
 * Resolve the Resend audience id for a locale. Falls back to the legacy
 * single-audience `RESEND_AUDIENCE_ID` for the DEFAULT locale only, so a
 * legacy deploy behaves as "es-AR only" and never double-emails a subscriber.
 */
export function resolveAudienceId(locale: BroadcastLocale): string | undefined {
  const perLocale = process.env[ENV_BY_LOCALE[locale]]?.trim();
  if (perLocale) return perLocale;
  if (locale === DEFAULT_BROADCAST_LOCALE) {
    return process.env.RESEND_AUDIENCE_ID?.trim() || undefined;
  }
  return undefined;
}
