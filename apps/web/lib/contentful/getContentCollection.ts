import { fetchGraphQL } from "./fetch";
import { RawContentCollection } from "./types";

const GRAPHQL_FIELDS = `
  title
  description {
    json
  }
  contentItemsCollection {
    items {
      ... on BeliefItem {
        title
        description {
          json
        }
        bibleVerse {
          book
          chapter
          fromVerse
          toVerse
          verseContent
          bibleVersion
        }
        image {
          url
          title
        }
        kind
        sys {
          id
        }
        __typename
      }
    }
  }
  sys {
    id
  }
  __typename
`;

// Returns the RAW GraphQL node (unmapped) so useLivePreview can subscribe to it
// directly. Callers on the non-draft render path apply mapContentCollection to
// get back the presentational ContentCollection shape.
export async function getContentCollection(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<RawContentCollection> {
  const data = await fetchGraphQL(
    `query {
        contentCollectionCollection(
          locale: "${locale}",
          where: {
            machineName: "${name}"
          },
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );

  return data?.data?.contentCollectionCollection?.items?.[0];
}
