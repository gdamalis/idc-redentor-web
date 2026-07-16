"use client";

import Image from "next/image";
import { Typography } from "@src/components/ui/typography";
import { getInitials } from "@src/components/features/blog-post-details/AuthorInfo";
import type { SermonAuthor } from "@src/types/Sermon";

interface SermonInterpreterProps {
  readonly interpreter: SermonAuthor;
}

/**
 * Credits the live interpreter of an interpreted message.
 *
 * Deliberately NOT rendered through `AuthorInfo`: that component prints the date
 * beneath the name, and the date already sits under the preacher — repeating it
 * here would read as a second byline.
 *
 * The interpreter is never added to `SermonHeader`'s `preachers` array: an
 * interpreter did not preach, and must never appear in the preacher byline
 * (ICR-146 AC3). The distinct "Interpretado por" label is what keeps the credit
 * honest while still giving the person real visual presence.
 */
export function SermonInterpreter({ interpreter }: SermonInterpreterProps) {
  return (
    <div className="flex items-center gap-4 text-gray-500">
      <div className="relative h-9 w-9 overflow-hidden rounded-full">
        {interpreter.avatar ? (
          <Image
            src={interpreter.avatar.url}
            alt={interpreter.avatar.title}
            fill
            className="object-cover object-top"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs font-semibold"
            aria-label={`${interpreter.name} avatar`}
          >
            {getInitials(interpreter.name)}
          </span>
        )}
      </div>
      <Typography
        component="p"
        variant="overline"
        className="font-semibold tracking-wide dark:text-gray-300"
      >
        {interpreter.name}
      </Typography>
    </div>
  );
}
