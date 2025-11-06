import { Typography } from "@src/components/ui/typography";
import { BlogPost } from "@src/types/BlogPost";
import { FeaturedImage } from "./FeaturedImage";
import {
  documentToReactComponents,
  Options,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS, MARKS } from "@contentful/rich-text-types";

const richTextOptions: Options = {
  renderMark: {
    [MARKS.BOLD]: (text) => <strong>{text}</strong>,
    [MARKS.ITALIC]: (text) => <em>{text}</em>,
  },
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node, children) => (
      <Typography component="p" variant="body">
        {children}
      </Typography>
    ),
    [BLOCKS.HEADING_2]: (node, children) => (
      <Typography component="h2" variant="h2">
        {children}
      </Typography>
    ),
    [BLOCKS.HEADING_3]: (node, children) => (
      <Typography component="h3" variant="h3">
        {children}
      </Typography>
    ),
    [BLOCKS.QUOTE]: (node, children) => (
      <Typography component="blockquote" variant="blockquote">
        {children}
      </Typography>
    ),
    [BLOCKS.UL_LIST]: (node, children) => (
      <ul className="list-disc pl-5 space-y-2 mb-4">
        {children}
      </ul>
    ),
    [BLOCKS.OL_LIST]: (node, children) => (
      <ol className="list-decimal pl-5 space-y-2 mb-4">
        {children}
      </ol>
    ),
    [BLOCKS.LIST_ITEM]: (node, children) => (
      <li className="space-y-2">
        {children}
      </li>
    ),
  },
};

type BlogPostContentProps = Readonly<{
  post: Pick<BlogPost, "content" | "featuredImage" | "seoDescription">;
}>;

export function BlogPostContent({ post }: BlogPostContentProps) {
  let richTextContent = null;
  if (post.content?.json) {
    try {
      richTextContent = documentToReactComponents(
        post.content.json,
        richTextOptions,
      );
    } catch (error) {
      console.error("Error rendering rich text:", error);
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <FeaturedImage
        url={post.featuredImage.url}
        title={post.featuredImage.title}
      />

      <div className="rich-text-content">
        {richTextContent || (
          <Typography component="p" variant="body1">
            {post.seoDescription}
          </Typography>
        )}
      </div>
    </div>
  );
}
