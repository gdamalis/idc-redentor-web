"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* NextError's type requires a statusCode; the App Router does not expose
            one for root errors, so 0 renders the generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
