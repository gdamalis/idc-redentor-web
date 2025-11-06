import React from "react";
import { cn } from "@src/utils/cn";

type TypographyProps = {
  component: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "blockquote";
  variant:
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "body"
    | "body1"
    | "body2"
    | "caption"
    | "overline"
    | "blockquote";
  id?: string;
  className?: string;
  children: React.ReactNode;
};

export const Typography = ({
  component,
  className = "",
  variant,
  id,
  children,
}: TypographyProps) => {
  const Component = component;

  // Base styles without colors
  const baseStyles = {
    h1: "text-4xl",
    h2: "text-3xl mt-7 mb-4 md:text-3xl md:mt-8 md:mb-5",
    h3: "text-xl md:text-2xl",
    h4: "text-lg",
    h5: "text-md",
    h6: "text-base",
    body: "text-lg leading-7 sm:text-xl sm:leading-8 mb-4",
    body1: "text-base",
    body2: "text-sm",
    caption: "text-xs",
    overline: "text-xs uppercase",
    blockquote: "text-lg md:text-xl italic my-4 py-4 px-6 border-l-4 border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-r-lg",
  };

  const headingStyles = "font-bold text-gray-900 dark:text-gray-100";
  const nonHeadingStyles = "text-gray-900 dark:text-gray-300";
  const blockquoteStyles = "text-gray-700 dark:text-gray-300";

  const isHeading = variant.startsWith("h");
  const isBlockquote = variant === "blockquote";
  const styles = isHeading ? headingStyles : isBlockquote ? blockquoteStyles : nonHeadingStyles;

  return (
    <Component
      id={id}
      className={cn(baseStyles[variant], styles, className)}
    >
      {children}
    </Component>
  );
};
