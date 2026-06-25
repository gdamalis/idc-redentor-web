import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  description
  ctaText
  image {
    url
    title
  }
  agreementNote {
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
  fieldsCollection {
    items {
      ... on FormField {
        name
        values
        type
        required
        placeholder
        inputId
      }
    }
  }
  sys {
    id
  }
  __typename
`;

export async function getContactForm(locale: string, isDraftMode = false) {
  const data = await fetchGraphQL(
    `query {
        contactFormCollection(
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

  const contactFormData = {
    title: data?.data?.contactFormCollection?.items[0].title,
    description: data?.data?.contactFormCollection?.items[0].description,
    ctaText: data?.data?.contactFormCollection?.items[0].ctaText,
    image: data?.data?.contactFormCollection?.items[0].image,
    agreementNote: data?.data?.contactFormCollection?.items[0].agreementNote,
    bibleVerse: data?.data?.contactFormCollection?.items[0].bibleVerse,
    formFields:
      data?.data?.contactFormCollection?.items[0].fieldsCollection.items,
  };

  return contactFormData;
}
