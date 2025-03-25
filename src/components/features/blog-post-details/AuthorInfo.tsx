"use client";

import { Typography } from "@src/components/ui/typography";
import { formatDate } from "@src/utils/formatDate";
import { useLocale } from "next-intl";
import Image from "next/image";

type AuthorInfoProps = {
  authorDetails: {
    name: string;
    avatar: {
      url: string;
      title: string;
    };
  };
  publishedDate: string;
};

export function AuthorInfo({
  authorDetails,
  publishedDate,
}: Readonly<AuthorInfoProps>) {
  const locale = useLocale();

  const formattedDate = formatDate(publishedDate, locale);

  return (
    <div className="flex items-center gap-4 text-gray-500">
      <div className="flex items-center gap-2">
        <Image
          src={authorDetails.avatar.url}
          alt={authorDetails.avatar.title}
          width={36}
          height={36}
          className="rounded-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Typography component="p" variant="overline" className="font-semibold tracking-wide dark:text-gray-300">
          {authorDetails.name}
        </Typography>
        <Typography component="p" variant="overline" className="tracking-wide">
          {formattedDate}
        </Typography>
      </div>
    </div>
  );
}
