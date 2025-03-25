import { cn } from "@src/utils/cn";
import { HTMLAttributes } from "react";

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  variant?: "horizontal" | "vertical";
  className?: string;
}

export function Divider({
  variant = "horizontal",
  className,
  ...props
}: DividerProps) {
  return (
    <hr
      className={cn(
        "border-gray-200 dark:border-gray-700",
        variant === "horizontal" ? "my-4 w-full" : "mx-2 h-full",
        className
      )}
      {...props}
    />
  );
} 