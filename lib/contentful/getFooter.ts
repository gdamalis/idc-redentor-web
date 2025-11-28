import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  shortDescription
  logo {
    url
    title
  }
  socialLinksCollection {
    items {
      ... on SocialLink {
        url
        platform
      }
    }
  }
  location {
    ... on LocationComponent {
      addressLine1
      neighborhood
      city
      country
      googleMapsUrl
    }
  }
  sys {
    id
  }
  __typename
`;

export async function getFooter(locale: string, isDraftMode = false) {
  const data = await fetchGraphQL(
    `query {
        footerCollection(
          locale: "${locale}",
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );

  const footerData = {
    logo: data?.data?.footerCollection?.items[0].logo,
    shortDescription: data?.data?.footerCollection?.items[0].shortDescription,
    socialLinks:
      data?.data?.footerCollection?.items[0].socialLinksCollection.items,
    location: data?.data?.footerCollection?.items[0].location,
  };

  return footerData;
}
