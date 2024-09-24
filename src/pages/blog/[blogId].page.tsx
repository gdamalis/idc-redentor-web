import { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

import { fetchDummyBlogPosts, fetchDummySinglePost } from '@src/data/sample-blog-posts';
import { revalidateDuration } from '@src/pages/utils/constants';
import { getServerSideTranslations } from '@src/pages/utils/get-serverside-translations';
import { BlogPost } from '@src/types/BlogPost';

type BlogPostPageProps = {
  post: BlogPost;
};

const BlogPostPage: NextPage<BlogPostPageProps> = ({ post }: BlogPostPageProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{post.title}</title>
        <meta name="description" content={post.description} />
        <meta name="keywords" content={post.keywords} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.ogDescription} />
        <meta property="og:image" content={post.imageUrl} />
        <meta property="og:url" content={`https://idcredentor.com/blog/${post.slug}`} />
        <link rel="canonical" href={`https://idcredentor.com/blog/${post.slug}`} />
      </Head>
      <main className="container mx-auto">
        <div className="bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <article className="mx-auto max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {post.title}
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">{post.description}</p>
              <img src={post.imageUrl} alt="" className="mt-10 rounded-lg" />
              <p className="mt-8">{post.content}</p>
            </article>
          </div>
        </div>
      </main>
    </>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await fetchDummyBlogPosts();

  const paths = posts.map(post => ({
    params: { blogId: post.slug.toString() },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params, locale }) => {
  const post = await fetchDummySinglePost(params?.blogId as string);

  if (!post) {
    return {
      notFound: true,
    };
  }

  try {
    return {
      revalidate: revalidateDuration,
      props: {
        ...(await getServerSideTranslations(locale)),
        post,
      },
    };
  } catch {
    return {
      revalidate: revalidateDuration,
      notFound: true,
    };
  }
};

export default BlogPostPage;
