"use client";

import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { Container } from "@src/components/ui/container";
import LoadingSpinner from "@src/components/ui/LoadingSpinner";
import { subscribe, type SubscribeState } from "@src/service/subscribe";
import { useLocale, useTranslations } from "next-intl";
import { trackEvent } from "@src/lib/analytics";
import { useActionState } from "react";

type SubscribeBannerProps = {
  content: {
    title: string;
    shortDescription: string;
    inputPlaceholder: string;
    ctaText: string;
    successMessage: string;
  };
};

export const SubscribeBanner = ({ content }: SubscribeBannerProps) => {
  const t = useTranslations();
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState<SubscribeState, FormData>(
    async (_currentState, formData) => {
      const email = formData.get("email") as string;
      const data = await subscribe(email, locale);
      
      if (data.success) {
        trackEvent("newsletter_subscribe", {
          subscribe_location: "banner",
          page_path: window.location.pathname,
        });
      }
      
      return data;
    },
    null,
  );

  return (
    <section className="border-t border-gray-200 bg-gray-50 px-4 py-6 dark:border-slate-700 dark:bg-slate-800 md:py-8">
      <Container className="flex flex-col items-center justify-between gap-6 md:flex-row">
        {/* Icon + Text */}
        <div className="flex items-center gap-4">
          <div className="hidden shrink-0 rounded-full bg-primary/10 p-3 text-primary dark:bg-primary-light/10 dark:text-primary-light md:block">
            <EnvelopeIcon className="h-6 w-6" />
          </div>
          <div className="text-center md:text-left">
            <h3 className="font-serif text-lg font-bold text-gray-900 dark:text-gray-100">
              {content.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {content.shortDescription}
            </p>
          </div>
        </div>

        {/* Form */}
        <form
          action={formAction}
          className="flex w-full items-center gap-2 md:w-auto"
        >
          <label htmlFor="subscribe-email" className="sr-only">
            {content.inputPlaceholder}
          </label>
          <input
            id="subscribe-email"
            name="email"
            type="email"
            required
            placeholder={content.inputPlaceholder}
            autoComplete="email"
            className="min-w-0 flex-1 rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary dark:bg-slate-900 dark:text-gray-100 dark:ring-slate-600 dark:placeholder:text-gray-500 dark:focus:ring-primary-light md:w-64"
          />
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm cursor-pointer font-semibold text-white shadow-sm transition-colors hover:bg-primary-navy disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary-light"
          >
            {isPending ? <LoadingSpinner size="sm" /> : content.ctaText}
          </button>
        </form>
      </Container>

      {/* Feedback */}
      {state?.success && (
        <p className="mt-3 text-center text-sm text-green-600 dark:text-green-400">
          {content.successMessage}
        </p>
      )}
      {!state?.success && state?.messageKey && (
        <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
          {t(state.messageKey)}
        </p>
      )}
    </section>
  );
};
