import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchGraphQL so no real network calls are made
vi.mock("./fetch", () => ({
  fetchGraphQL: vi.fn(),
}));

import { fetchGraphQL } from "./fetch";
import { getContentCollection } from "./getContentCollection";

const mockFetchGraphQL = vi.mocked(fetchGraphQL);

const STRUCTURED_BIBLE_VERSE = {
  book: "Marcos",
  chapter: "10",
  fromVerse: "45",
  toVerse: null,
  verseContent:
    "Porque ni aun el Hijo del Hombre vino para ser servido, sino para servir",
  bibleVersion: "RVR60",
};

const BELIEF_ITEM_1 = {
  title: "La Trinidad",
  description: { json: { nodeType: "document", content: [] } },
  bibleVerse: STRUCTURED_BIBLE_VERSE,
  image: { url: "https://images.ctfassets.net/trinity.jpg", title: "Trinidad" },
  kind: "Creed",
  sys: { id: "belief-1" },
  __typename: "BeliefItem",
};

function makeCollectionResponse(items: unknown[]) {
  return {
    data: {
      contentCollectionCollection: {
        items: [
          {
            title: "Nuestras creencias",
            description: { json: { nodeType: "document", content: [] } },
            contentItemsCollection: { items },
            sys: { id: "collection-1" },
            __typename: "ContentCollection",
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getContentCollection", () => {
  it("returns the raw first item unchanged (no reshape)", async () => {
    const response = makeCollectionResponse([BELIEF_ITEM_1]);
    mockFetchGraphQL.mockResolvedValueOnce(response);

    const result = await getContentCollection("creed", "es-AR");

    expect(result).toBe(
      response.data.contentCollectionCollection.items[0],
    );
    expect(result.contentItemsCollection.items[0]).toEqual(BELIEF_ITEM_1);
    expect(result.sys).toEqual({ id: "collection-1" });
    expect(result.__typename).toBe("ContentCollection");
  });

  it("returns undefined when the collection has no items", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({
      data: { contentCollectionCollection: { items: [] } },
    });

    const result = await getContentCollection("creed", "es-AR");

    expect(result).toBeUndefined();
  });

  it("queries with the correct machineName and locale", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("values", "en-US");

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('machineName: "values"'),
      false,
    );
    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('locale: "en-US"'),
      false,
    );
  });

  it("passes isDraftMode flag to fetchGraphQL", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR", true);

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("preview: true"),
      true,
    );
  });

  it("queries ... on BeliefItem fragment (not Credo or ValueItem)", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("... on BeliefItem");
    expect(query).not.toContain("... on Credo");
    expect(query).not.toContain("... on ValueItem");
  });

  it("includes the kind field in the GraphQL query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("kind");
  });

  it("selects verseContent (not json) under bibleVerse in the GraphQL query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("verseContent");
    expect(query).not.toMatch(/bibleVerse\s*\{\s*json/);
  });

  it("includes sys { id } and __typename inside the BeliefItem fragment", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    const beliefItemFragment = query.slice(query.indexOf("... on BeliefItem"));
    expect(beliefItemFragment).toContain("sys");
    expect(beliefItemFragment).toContain("id");
    expect(beliefItemFragment).toContain("__typename");
  });
});
