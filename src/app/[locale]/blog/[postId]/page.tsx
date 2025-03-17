import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import BlogPostDetails from "@src/components/features/blog-post-details/BlogPostDetails";
import { ContactCta } from "@src/components/features/contact-cta";
import {
  fetchDummyOtherPosts,
  fetchDummySinglePost,
} from "@src/data/sample-blog-posts";
import { setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

type PostDetailsPageParams = {
  postId: string;
  locale: string;
};

type PostDetailsPageProps = Readonly<{
  params: Promise<PostDetailsPageParams>;
}>;

export async function generateMetadata({ params }: PostDetailsPageProps) {
  const { postId } = await params;
  const post = await fetchDummySinglePost(postId);

  return {
    title: post?.title,
    description: post?.description,
    keywords: post?.keywords,
    openGraph: {
      title: post?.title,
      description: post?.ogDescription,
      image: "/assets/img/redentor_logo.png",
      url: `/blog/${post?.slug}`,
    },
    alternates: {
      canonical: `/blog/${post?.slug}`,
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
    },
  };
}

export default async function PostDetailsPage({
  params,
}: PostDetailsPageProps) {
  const { postId, locale } = await params;
  setRequestLocale(locale);

  const post = await fetchDummySinglePost(postId);
  const relatedPosts = await fetchDummyOtherPosts(3);

  const { isEnabled } = await draftMode();
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );

  return (
    <>
      <BlogPostDetails post={post} relatedPosts={relatedPosts} />
      <ContactCta content={contactCta} />
    </>
  );
}
