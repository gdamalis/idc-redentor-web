"use client";

import LoadingSpinner from "@src/components/ui/LoadingSpinner";
import { Typography } from "@src/components/ui/typography";
import { subscribe, type SubscribeState } from "@src/service/subscribe";
import { useTranslations } from "next-intl";
import { trackEvent } from "@src/lib/analytics";
import { useActionState } from "react";

type SubscribeFormProps = {
  content: {
    title: string;
    shortDescription: string;
    inputPlaceholder: string;
    ctaText: string;
    successMessage: string;
  };
  size?: "sm" | "lg";
  className?: string;
};

const getSizeClasses = (size: "sm" | "lg") => {
  switch (size) {
    case "sm":
      return {
        input: "sm:w-56 sm:text-sm sm:leading-6",
        button: "sm:w-32 sm:px-4 sm:py-2 sm:text-sm sm:font-semibold",
      };
    case "lg":
      return {
        input: "sm:w-96 text-lg leading-8",
        button: "sm:w-36 px-6 py-3 text-lg sm:font-semibold",
      };
  }
};

export const SubscribeForm = ({
  content,
  size = "sm",
  className = "",
}: SubscribeFormProps) => {
  const sizeClasses = getSizeClasses(size);
  const t = useTranslations();

  const [state, formAction, isPending] = useActionState<
     
    SubscribeState,
    FormData
  >(async (currentState, formData) => {
    const email = formData.get("email") as string;
    const data = await subscribe(email);
    
    if (data.success) {
      trackEvent("newsletter_subscribe", {
        subscribe_location: "footer_form",
        page_path: window.location.pathname,
      });
    }
    
    return data;
  }, null);

  return (
    <div className={`mt-10 xl:mt-0 ${className}`}>
      {content.title && (
        <Typography
          component="h3"
          variant="h3"
          className="text-sm font-semibold leading-6 text-white"
        >
          {content.title}
        </Typography>
      )}
      {content.shortDescription && (
        <Typography
          component="p"
          variant="body1"
          className="mt-2 text-sm leading-6 text-white"
        >
          {content.shortDescription}
        </Typography>
      )}
      <form action={formAction} className="flex flex-col mt-4">
        <div className="flex md:max-w-md">
          <label htmlFor="email" className="sr-only">
            {content.inputPlaceholder}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={content.inputPlaceholder}
            autoComplete="email"
            className={`w-full min-w-0 appearance-none rounded-l-2xl rounded-r-none border-0  px-3 py-1.5 text-base text-white shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-1 focus:ring-inset focus:ring-primary sm:w-56 ${sizeClasses.input}`}
          />
          <div className="text-center sm:shrink-0">
            <button
              type="submit"
              className={`flex w-full text-nowrap items-center justify-center rounded-r-2xl bg-primary px-6 py-2 font-semibold text-white cursor-pointer shadow-sm hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${sizeClasses.button}`}
            >
              {isPending ? <LoadingSpinner size={size} /> : content.ctaText}
            </button>
          </div>
        </div>
        {state?.success && (
          <span className="text-sm text-center mt-2">
            {content.successMessage}
          </span>
        )}
        {!state?.success && state?.messageKey && (
          <span className="text-sm text-center mt-2">{t(state.messageKey)}</span>
        )}
      </form>
    </div>
  );
};
