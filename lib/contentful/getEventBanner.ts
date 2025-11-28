import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  eventInfo {
    name
    dayOfWeek
    date
    time
    note
  }
  location {
    ... on LocationComponent {
      addressLine1
      neighborhood
      city
      country
      mapEmbedUrl
      googleMapsUrl
    }
  }
  image {
    url
    title
  }
  sys {
    id
  }
  __typename
`;

export async function getEventBanner(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        eventBannerCollection(
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

  return data?.data?.eventBannerCollection?.items[0];
}
