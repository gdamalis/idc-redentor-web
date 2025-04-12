import Image from "next/image";
import { useLocale } from "next-intl";

import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { BlogPost } from "@src/types/BlogPost";
import { formatDate } from "@src/utils/formatDate";

type BlogPostCardProps = {
  post: BlogPost;
};

export const BlogPostCard = ({ post }: BlogPostCardProps) => {
  const locale = useLocale();
  const formattedDate = formatDate(post.publishedDate, locale);

  return (
    <article
      key={post.sys.id}
      className="relative isolate flex flex-col justify-end overflow-hidden rounded-lg bg-gray-900 px-8 pb-8 pt-80 sm:pt-48 lg:pt-80"
    >
      <Image
        alt={post.featuredImage.title}
        src={post.featuredImage.url}
        width={780}
        height={780}
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/70" />
      <div className="absolute inset-0 -z-10 rounded-lg ring-1 ring-inset ring-gray-900/10" />

      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 overflow-hidden text-sm leading-6 text-gray-300">
        <time dateTime={post.publishedDate}>
          {formattedDate}
        </time>
        <svg
          viewBox="0 0 2 2"
          className="-ml-0.5 h-0.5 w-0.5 flex-none fill-white/50"
        >
          <circle r={1} cx={1} cy={1} />
        </svg>
        <Typography
          component="p"
          variant="body2"
          className="text-gray-300"
        >
          {post.author.name}
        </Typography>
      </div>
      <Typography
        component="h3"
        variant="h3"
        className="mt-3 text-lg font-semibold leading-6 text-white"
      >
        <Link href={`/blog/${post.slug}`}>
          <span className="absolute inset-0" />
          {post.title}
        </Link>
      </Typography>
    </article>
  );
};
