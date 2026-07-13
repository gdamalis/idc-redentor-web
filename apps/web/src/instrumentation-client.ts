import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@src/utils/sentry/options";

Sentry.init(baseSentryOptions());

// Instruments client-side router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
