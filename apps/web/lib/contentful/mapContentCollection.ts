import type { ContentCollection, RawContentCollection } from "./types";

// Mirrors the reshape that used to live inline in getContentCollection — now that
// the getter returns the raw GraphQL node (so useLivePreview can subscribe to it),
// this is the pure mapping step consumers apply on the non-draft render path.
// image is preserved as `raw?.image`, which is always undefined today (the query
// never requests a top-level `image` field on ContentCollection) — not a bug to
// fix here, just today's pre-existing behavior.
export function mapContentCollection(
  raw: RawContentCollection,
): ContentCollection {
  const mapped = {
    title: raw?.title,
    description: raw?.description,
    creedItems: raw?.contentItemsCollection?.items,
    image: raw?.image,
    sys: raw?.sys,
  };

  return mapped;
}
