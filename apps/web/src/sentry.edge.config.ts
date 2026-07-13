import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@src/utils/sentry/options";

Sentry.init(baseSentryOptions());
