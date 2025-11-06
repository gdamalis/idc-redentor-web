import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { BlogPost } from "@src/types/BlogPost";
import Image from "next/image";
import { Divider } from "@src/components/ui/divider";
import { formatDate } from "@src/utils/formatDate";

type RelatedArticlesProps = {
  posts: BlogPost[];
  locale: string;
};

export function RelatedArticles({
  posts,
  locale,
}: Readonly<RelatedArticlesProps>) {
  if (!posts || posts.length === 0) {
    return null;
  }

  return (
    <div className="max-w-2xl pt-8">
      <div className="grid gap-4">
        {posts.map((post) => (
          <div key={post.sys.id} className="flex relative w-full">
            <div className="w-full">
              <Divider className="my-6" />
              <Link href={`/blog/${post.slug}`}>
                <article className="grid grid-cols-[minmax(0,1fr)_82px] md:grid-cols-[minmax(0,1fr)_160px] gap-8">
                  <div className="flex flex-col gap-2 relative">
                    <Typography component="p" variant="h4">
                      {post.title}
                    </Typography>
                    <Typography component="p" variant="body2">
                      {post.subtitle}
                    </Typography>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-2 overflow-hidden text-sm leading-6 text-gray-500 dark:text-gray-300">
                      <time
                        dateTime={post.publishedDate}
                        className="uppercase text-xs"
                      >
                        {formatDate(post.publishedDate, locale)}
                      </time>
                      {post.author && (
                        <>
                          <svg
                            viewBox="0 0 2 2"
                            className="-ml-0.5 h-0.5 w-0.5 flex-none fill-gray-500 dark:fill-gray-300"
                          >
                            <circle r={1} cx={1} cy={1} />
                          </svg>
                          <div className="flex gap-x-2">
                            <Typography
                              component="p"
                              variant="caption"
                              className="text-gray-500 uppercase self-center"
                            >
                              {post.author.name}
                            </Typography>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <Image
                      alt={post.featuredImage.title}
                      src={post.featuredImage.url}
                      width={780}
                      height={780}
                      className="h-auto md:h-full md:w-full rounded-md"
                    />
                  </div>
                </article>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
