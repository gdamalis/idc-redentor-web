import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  description
  keywords
  image {
    url
    title
  }
  siteName
  type
  sys {
    id
  }
  __typename
`;

export async function getSeo(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        seoCollection(
          locale: "${locale}",
          where:{
            machineName: "${name}"
          }, 
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

  return data?.data?.seoCollection?.items[0];
}
