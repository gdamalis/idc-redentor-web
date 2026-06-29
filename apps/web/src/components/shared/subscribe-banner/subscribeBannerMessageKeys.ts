/**
 * Typed const map of every next-intl message key used by the subscribe
 * banner/form feedback. All keys live under the "SubscribeBanner" namespace
 * in public/locales/{es-AR,en-US}.json.
 *
 * Use these constants instead of bare string literals so key renames are
 * caught by the compiler and IDEs can find all usages.
 */
export const SUBSCRIBE_BANNER_KEYS = {
  /** Shown when the submitted email is already on the Mailchimp audience. */
  ERROR_ALREADY_SUBSCRIBED: "SubscribeBanner.error-already-subscribed",

  /** Fallback for server/network/unexpected failures. */
  ERROR_UNEXPECTED: "SubscribeBanner.error-unexpected",
} as const satisfies Record<string, `SubscribeBanner.${string}`>;

export type SubscribeBannerKey =
  (typeof SUBSCRIBE_BANNER_KEYS)[keyof typeof SUBSCRIBE_BANNER_KEYS];
