import { GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

import { BlogSection } from '@src/components/features/blog-section';
import { ContactCta } from '@src/components/features/contact-cta';
import { OurMission } from '@src/components/features/our-mission/OurMission';
import { fetchDummyBlogPosts } from '@src/data/sample-blog-posts';
import { revalidateDuration } from '@src/pages/utils/constants';
import { getServerSideTranslations } from '@src/pages/utils/get-serverside-translations';
import { BlogPost } from '@src/types/BlogPost';

type HomePageProps = {
  posts: BlogPost[];
};

const HomePage: NextPage<HomePageProps> = ({ posts }: HomePageProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t('homePage.title')}</title>
        <meta name="description" content={t('homePage.description')} />
        <meta name="keywords" content={t('homePage.keywords')} />
        <meta property="og:title" content={t('homePage.title')} />
        <meta property="og:description" content={t('homePage.ogDescription')} />
        <meta property="og:image" content="/assets/img/redentor_logo.png" />
        <meta property="og:url" content="https://idcredentor.com/" />
        <link rel="canonical" href="https://idcredentor.com/" />
      </Head>
      <main>
        <OurMission />
        <BlogSection posts={posts} />
        <ContactCta />
      </main>
    </>
  );
};

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  try {
    // const landingPageData = await gqlClient.pageLanding({ locale });
    // const page = landingPageData.pageLandingCollection?.items[0];

    // const blogPostsData = await gqlClient.blogPostPageCollection({
    //   limit: 6,
    //   locale,
    //   order: PageBlogPostOrder.PublishedDateDesc,
    //   where: {
    //     slug_not: page?.featuredBlogPost?.slug,
    //   },
    // });
    // const posts = blogPostsData.pageBlogPostCollection?.items;

    // if (!page) {
    //   return {
    //     revalidate: revalidateDuration,
    //     notFound: true,
    //   };
    // }
    const posts = await fetchDummyBlogPosts();

    return {
      revalidate: revalidateDuration,
      props: {
        ...(await getServerSideTranslations(locale)),
        posts,
      },
    };
  } catch {
    return {
      revalidate: revalidateDuration,
      notFound: true,
    };
  }
};

export default HomePage;
