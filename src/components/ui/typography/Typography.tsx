import React from "react";
import { cn } from "@src/utils/cn";

type TypographyProps = {
  component: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
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
    | "overline";
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
    h1: "text-4xl font-bold",
    h2: "text-2xl lg:text-3xl font-bold mt-8 lg:mb-5",
    h3: "text-2xl font-bold",
    h4: "text-xl font-bold",
    h5: "text-lg font-bold",
    h6: "text-base font-bold",
    body: "text-lg leading-7 lg:text-xl lg:leading-8",
    body1: "text-base",
    body2: "text-sm",
    caption: "text-xs",
    overline: "text-xs uppercase",
  };
  
  const colorStyles = "text-gray-900 dark:text-gray-100";
  const bodyColorStyles = "text-gray-600 dark:text-gray-300";
  
  const isHeading = variant.startsWith('h');
  const defaultColor = isHeading ? colorStyles : bodyColorStyles;

  return (
    <Component id={id} className={cn(baseStyles[variant], defaultColor, className)}>
      {children}
    </Component>
  );
};
