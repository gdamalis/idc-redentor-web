import { Container } from "@src/components/ui/container";
import { BlogPost } from "@src/types/BlogPost";
import { BlogPostHeader } from "./BlogPostHeader";
import { BlogPostContent } from "./BlogPostContent";
import { LikeButton } from "./LikeButton";
import { RelatedArticles } from "./RelatedArticles";

type BlogPostDetailsProps = Readonly<{
  post: BlogPost;
  relatedPosts: BlogPost[];
  locale: string;
  initialLikeCount: number;
  initialHasLiked: boolean;
}>;

export default function BlogPostDetails({
  post,
  relatedPosts,
  locale,
  initialLikeCount,
  initialHasLiked,
}: BlogPostDetailsProps) {
  if (!post) {
    return null;
  }

  return (
    <Container className="pt-28 pb-20 lg:py-32">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        <BlogPostHeader post={post} />
        <BlogPostContent post={post} />
        <LikeButton
          slug={post.slug}
          initialCount={initialLikeCount}
          initialHasLiked={initialHasLiked}
        />
        <RelatedArticles posts={relatedPosts} locale={locale} sourceSlug={post.slug} />
      </div>
    </Container>
  );
}
