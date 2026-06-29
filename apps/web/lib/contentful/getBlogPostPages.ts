import { fetchGraphQL } from "./fetch";
import { isValidSlug } from "./slug";
import { isValidLocale } from "@src/i18n/config";
import type { BlogPost } from "@src/types/BlogPost";

const GRAPHQL_FIELDS = `
  title
  subtitle
  category
  slug
  featuredImage {
    url
    title
  }
  content {
    json
    links {
      assets {
        block {
          sys {
            id
          }
          url
          title
          width
          height
          contentType
        }
        hyperlink {
          sys {
            id
          }
          url
          title
          contentType
        }
      }
      entries {
        block {
          sys {
            id
          }
          __typename
        }
        hyperlink {
          sys {
            id
          }
          __typename
          ... on BlogPostPage {
            title
            slug
          }
        }
      }
    }
  }
  author {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  publishedDate
  seoTitle
  seoDescription
  keywords
  relatedBlogPostsCollection {
    items {
      ... on BlogPostPage {
        title
        slug
        subtitle
        featuredImage {
          url
          title
        }
        publishedDate
      }
    }
  }
  sys {
    id
    publishedAt
  }
  __typename
`;

export async function getLatestBlogPostPages(
  locale: string,
  options: {
    slug?: string;
    isDraftMode?: boolean;
  },
) {
  const whereClause =
    options?.slug && isValidSlug(options.slug)
      ? `where: { slug_not: "${options.slug}" },`
      : "";

  const data = await fetchGraphQL(
    `query {
        blogPostPageCollection(
          locale: "${locale}",
          limit: 3, 
          ${whereClause}
          preview: ${options?.isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    options?.isDraftMode,
  );

  return data?.data?.blogPostPageCollection?.items;
}

export async function getAllBlogPostSlugs(
  locale: string,
): Promise<Array<{ slug: string; updatedAt: string }>> {
  const data = await fetchGraphQL(
    `query {
        blogPostPageCollection(
          locale: "${locale}",
          limit: 100,
          preview: false
        ) {
          items {
            slug
            sys {
              publishedAt
            }
          }
        }
      }`,
    false,
  );

  return (
    data?.data?.blogPostPageCollection?.items?.map(
      (item: { slug: string; sys: { publishedAt: string } }) => ({
        slug: item.slug,
        updatedAt: item.sys.publishedAt,
      }),
    ) ?? []
  );
}

export async function getBlogPostPage(
  slug: string,
  locale: string,
  isDraftMode = false,
) {
  if (!isValidSlug(slug) || !isValidLocale(locale)) return undefined;

  const data = await fetchGraphQL(
    `query {
        blogPostPageCollection(
          where: { slug: "${slug}" },
          locale: "${locale}",
          limit: 1,
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );

  return data?.data?.blogPostPageCollection?.items[0];
}

/**
 * Fetch a single blog post by its Contentful entry id.
 * Guards against injection: only accepts alphanumeric ids (Contentful sys id format).
 */
export async function getBlogPostPageById(
  id: string,
  locale: string,
  isDraftMode = false,
): Promise<BlogPost | undefined> {
  if (!id || !/^[a-zA-Z0-9]{1,64}$/.test(id) || !isValidLocale(locale)) {
    return undefined;
  }

  const data = await fetchGraphQL(
    `query {
        blogPostPageCollection(
          where: { sys: { id: "${id}" } },
          locale: "${locale}",
          limit: 1,
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );

  return data?.data?.blogPostPageCollection?.items?.[0];
}
