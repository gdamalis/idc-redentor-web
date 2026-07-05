import { describe, expect, it } from "vitest";
import { mapContentCollection } from "./mapContentCollection";
import type { RawContentCollection } from "./types";

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

const BELIEF_ITEM_2 = {
  title: "Servicio al prójimo",
  description: { json: { nodeType: "document", content: [] } },
  bibleVerse: null,
  image: { url: "https://images.ctfassets.net/service.jpg", title: "Servicio" },
  kind: "Value",
  sys: { id: "belief-2" },
  __typename: "BeliefItem",
};

// Mirrors the GraphQL fixture shape from getContentCollection.test.ts (the
// getter's own test), ported here because the mapping responsibility moved
// from the getter to this pure function. Cast at the boundary — the fixture's
// rich-text `json` stub (like every other getter test in this repo) is a
// loose shape, not the full `@contentful/rich-text-types` Document.
function makeRaw(items: unknown[]): RawContentCollection {
  return {
    title: "Nuestras creencias",
    description: { json: { nodeType: "document", content: [] } },
    contentItemsCollection: { items },
    sys: { id: "collection-1" },
    __typename: "ContentCollection",
  } as unknown as RawContentCollection;
}

describe("mapContentCollection", () => {
  it("maps title, description, and creedItems from the raw node", () => {
    const raw = makeRaw([BELIEF_ITEM_1, BELIEF_ITEM_2]);

    const result = mapContentCollection(raw);

    expect(result.title).toBe("Nuestras creencias");
    expect(result.description).toEqual(raw.description);
    expect(result.creedItems).toBe(raw.contentItemsCollection.items);
  });

  it("preserves the collection's own sys.id (for the inspector's entryId)", () => {
    const raw = makeRaw([BELIEF_ITEM_1]);

    const result = mapContentCollection(raw);

    expect(result.sys).toEqual({ id: "collection-1" });
  });

  it("preserves each beliefItem's fields (title, description, bibleVerse, image, kind, sys, __typename)", () => {
    const raw = makeRaw([BELIEF_ITEM_1]);

    const result = mapContentCollection(raw);

    expect(result.creedItems[0]).toEqual(BELIEF_ITEM_1);
  });

  it("preserves a null bibleVerse for Value items", () => {
    const raw = makeRaw([BELIEF_ITEM_2]);

    const result = mapContentCollection(raw);

    expect(result.creedItems[0].bibleVerse).toBeNull();
  });

  it("does not populate image — preserves today's pre-existing behavior (never queried on the collection)", () => {
    const raw = makeRaw([]);

    // `image` is intentionally absent from the ContentCollection type (never
    // queried on ContentCollection) — read it as an unknown record to assert
    // the mapper still carries the (always-undefined) value through as-is.
    const result = mapContentCollection(raw) as unknown as Record<
      string,
      unknown
    >;

    expect(result.image).toBeUndefined();
  });
});
