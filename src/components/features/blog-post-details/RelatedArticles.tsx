import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { BlogPost } from "@src/types/BlogPost";
import Image from "next/image";
import { useTranslations } from "next-intl";

type RelatedArticlesProps = {
  posts: BlogPost[];
  formattedDate: string;
};

export function RelatedArticles({ posts, formattedDate }: Readonly<RelatedArticlesProps>) {
  const t = useTranslations("BlogPost");

  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="max-w-2xl">
      <Typography
        component="h2"
        variant="h2"
        className="mt-0 mb-2 lg:mt-8"
      >
        {t("related")}
      </Typography>
      <div className="mx-auto grid auto-rows-fr grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.sys.id}
            className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48"
          >
            <Image
              alt={post.featuredImage.title}
              src={post.featuredImage.url}
              width={780}
              height={780}
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
            <div className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />

            <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm leading-6 text-gray-300">
              <time dateTime={post.publishedDate} className="mr-8">
                {formattedDate}
              </time>
              {post.author && (
                <div className="-ml-4 flex items-center gap-x-4">
                  <svg
                    viewBox="0 0 2 2"
                    className="-ml-0.5 h-0.5 w-0.5 flex-none fill-white/50"
                  >
                    <circle r={1} cx={1} cy={1} />
                  </svg>
                  <div className="flex gap-x-2.5">
                    {post.author.avatar && (
                      <Image
                        alt={post.author.avatar.title}
                        src={post.author.avatar.url}
                        width={24}
                        height={24}
                        className="h-6 w-6 flex-none rounded-full bg-white/10"
                      />
                    )}
                    {post.author.name}
                  </div>
                </div>
              )}
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
        ))}
      </div>
    </div>
  );
} 