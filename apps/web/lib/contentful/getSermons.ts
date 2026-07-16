import { fetchGraphQL } from "./fetch";
import { isValidSlug } from "./slug";
import { isValidLocale } from "@src/i18n/config";
import { normalizeAudioLanguages } from "@src/utils/sermon/audioLanguage";
import type { Sermon } from "@src/types/Sermon";

const GRAPHQL_FIELDS = `
  title
  slug
  sermonDate
  thesis
  mainPoints
  excerpt
  durationSeconds
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
      }
    }
  }
  featuredImage {
    url
    title
  }
  audio {
    url
    title
    contentType
    fileName
    size
  }
  audioLanguages
  pdfSummary {
    url
    title
    contentType
    fileName
    size
  }
  preacher {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  interpreter {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  additionalPreachersCollection {
    items {
      ... on Author {
        name
        avatar {
          url
          title
        }
        email
      }
    }
  }
  scriptureReferencesCollection {
    items {
      ... on BibleVerse {
        book
        chapter
        fromVerse
        toVerse
        verseContent
        bibleVersion
      }
    }
  }
  seoTitle
  seoDescription
  keywords
  relatedSermonsCollection(limit: 3) {
    items {
      ... on Sermon {
        title
        slug
        sermonDate
        excerpt
        featuredImage {
          url
          title
        }
      }
    }
  }
  sys {
    id
    publishedAt
  }
  __typename
`;

/**
 * Lightweight field set for the archive/list view (rendered by SermonCard).
 *
 * The full GRAPHQL_FIELDS set is too expensive at `limit: 100`: requesting the
 * rich-text `content` (+ asset links) plus the `scriptureReferences` and
 * `relatedSermons` collections for every item pushes the Contentful query cost
 * past its 11000 ceiling (TOO_COMPLEX_QUERY). Contentful computes cost from the
 * query shape × `limit`, not the actual result count, so that query 400s
 * regardless of how many sermons exist — and `fetchGraphQL` then returns
 * `data: null`, which previously made `getAllSermons` silently return `[]`
 * (an empty archive). Cards only need the fields below, so fetch just those.
 */
const SERMON_CARD_FIELDS = `
  title
  slug
  sermonDate
  thesis
  excerpt
  mainPoints
  durationSeconds
  seoTitle
  seoDescription
  keywords
  featuredImage {
    url
    title
  }
  audio {
    url
    title
    contentType
    fileName
    size
  }
  preacher {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  sys {
    id
    publishedAt
  }
  __typename
`;

function mapSermon(item: Record<string, unknown>): Sermon {
  const scriptureItems = (
    (item.scriptureReferencesCollection as Record<string, unknown>)?.items as unknown[]
  ) ?? [];

  const relatedItems = (
    (item.relatedSermonsCollection as Record<string, unknown>)?.items as unknown[]
  ) ?? [];

  const additionalPreacherItems = (
    (item.additionalPreachersCollection as Record<string, unknown>)?.items as unknown[]
  ) ?? [];

  return {
    title: item.title as string,
    slug: item.slug as string,
    sermonDate: item.sermonDate as string,
    preacher: item.preacher as Sermon["preacher"],
    additionalPreachers: additionalPreacherItems as Sermon["additionalPreachers"],
    // NOTE: mapSermon serves BOTH the detail query (GRAPHQL_FIELDS, which requests
    // audioLanguages) and the archive query (SERMON_CARD_FIELDS, which does not).
    // Card results therefore get the ["es-AR"] default for a field they never
    // fetched. That is harmless — no card renders it — and deliberate: keeping the
    // field non-optional means no consumer has to handle `undefined`.
    audioLanguages: normalizeAudioLanguages(
      item.audioLanguages as string[] | undefined,
    ),
    interpreter: item.interpreter as Sermon["interpreter"],
    scriptureReferences: scriptureItems as Sermon["scriptureReferences"],
    thesis: item.thesis as string,
    mainPoints: (item.mainPoints as string[]) ?? [],
    excerpt: item.excerpt as string,
    content: item.content as Sermon["content"],
    featuredImage: item.featuredImage as Sermon["featuredImage"],
    audio: item.audio as Sermon["audio"],
    durationSeconds: item.durationSeconds as number | undefined,
    pdfSummary: item.pdfSummary as Sermon["pdfSummary"],
    seoTitle: item.seoTitle as string,
    seoDescription: item.seoDescription as string,
    keywords: (item.keywords as string[]) ?? [],
    relatedSermons: relatedItems as Sermon["relatedSermons"],
    sys: item.sys as Sermon["sys"],
  };
}

const ARCHIVE_PAGE_SIZE = 100;

/**
 * Fetches every item of a `sermonCollection` query across pages, so the public
 * archive and the sitemap never silently truncate once there are more than
 * ARCHIVE_PAGE_SIZE sermons. `buildQuery(skip, limit)` MUST request `total`
 * alongside `items`.
 */
async function fetchAllSermonItems<T>(
  buildQuery: (skip: number, limit: number) => string,
  isDraftMode: boolean,
): Promise<T[]> {
  const all: T[] = [];
  let skip = 0;
  let total = 0;

  do {
    const data = await fetchGraphQL(
      buildQuery(skip, ARCHIVE_PAGE_SIZE),
      isDraftMode,
    );
    // Surface GraphQL errors (e.g. TOO_COMPLEX_QUERY) instead of silently
    // treating an errored response as an empty archive.
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      console.error(
        "[getSermons] Contentful GraphQL error fetching sermon archive:",
        JSON.stringify(data.errors),
      );
    }
    const collection = data?.data?.sermonCollection as
      | { total?: number; items?: T[] }
      | undefined;
    const items = collection?.items ?? [];
    total = collection?.total ?? all.length + items.length;
    all.push(...items);
    skip += ARCHIVE_PAGE_SIZE;
    if (items.length < ARCHIVE_PAGE_SIZE) break;
  } while (skip < total);

  return all;
}

export async function getSermon(
  slug: string,
  locale: string,
  isDraftMode = false,
): Promise<Sermon | undefined> {
  if (!isValidSlug(slug) || !isValidLocale(locale)) return undefined;

  const data = await fetchGraphQL(
    `query {
      sermonCollection(
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

  // A typoed/deleted slug yields an empty `items` array; returning undefined
  // here lets callers hit their `if (!sermon)` not-found path instead of
  // mapSermon dereferencing undefined and throwing a 500.
  const item = data?.data?.sermonCollection?.items?.[0] as
    | Record<string, unknown>
    | undefined;

  return item ? mapSermon(item) : undefined;
}

/**
 * Fetch a single sermon by its Contentful entry id.
 * Guards against injection: only accepts alphanumeric ids (Contentful sys id format).
 */
export async function getSermonById(
  id: string,
  locale: string,
  isDraftMode = false,
): Promise<Sermon | undefined> {
  if (!id || !/^[a-zA-Z0-9]{1,64}$/.test(id) || !isValidLocale(locale)) {
    return undefined;
  }

  const data = await fetchGraphQL(
    `query {
      sermonCollection(
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

  const item = data?.data?.sermonCollection?.items?.[0] as
    | Record<string, unknown>
    | undefined;

  return item ? mapSermon(item) : undefined;
}

export async function getLatestSermons(
  locale: string,
  options: {
    slug?: string;
    isDraftMode?: boolean;
  } = {},
): Promise<Sermon[]> {
  const whereClause =
    options?.slug && isValidSlug(options.slug)
      ? `where: { slug_not: "${options.slug}" },`
      : "";

  const data = await fetchGraphQL(
    `query {
      sermonCollection(
        locale: "${locale}",
        limit: 3,
        ${whereClause}
        order: sermonDate_DESC,
        preview: ${options?.isDraftMode ? "true" : "false"}
      ) {
        items {
          ${GRAPHQL_FIELDS}
        }
      }
    }`,
    options?.isDraftMode ?? false,
  );

  return (data?.data?.sermonCollection?.items ?? []).map(
    (item: Record<string, unknown>) => mapSermon(item),
  );
}

export async function getAllSermons(
  locale: string,
  options: {
    isDraftMode?: boolean;
  } = {},
): Promise<Sermon[]> {
  const items = await fetchAllSermonItems<Record<string, unknown>>(
    (skip, limit) =>
      `query {
      sermonCollection(
        locale: "${locale}",
        limit: ${limit},
        skip: ${skip},
        order: sermonDate_DESC,
        preview: ${options?.isDraftMode ? "true" : "false"}
      ) {
        total
        items {
          ${SERMON_CARD_FIELDS}
        }
      }
    }`,
    options?.isDraftMode ?? false,
  );

  return items.map((item) => mapSermon(item));
}

export async function getAllSermonSlugs(
  locale: string,
): Promise<Array<{ slug: string; updatedAt: string }>> {
  const items = await fetchAllSermonItems<{
    slug: string;
    sys: { publishedAt: string };
  }>(
    (skip, limit) =>
      `query {
      sermonCollection(
        locale: "${locale}",
        limit: ${limit},
        skip: ${skip},
        preview: false
      ) {
        total
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

  return items.map((item) => ({
    slug: item.slug,
    updatedAt: item.sys.publishedAt,
  }));
}
