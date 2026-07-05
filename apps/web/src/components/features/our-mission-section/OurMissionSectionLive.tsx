"use client";

import { mapContentCollection } from "@lib/contentful/mapContentCollection";
import type { RawContentCollection } from "@lib/contentful/types";
import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import { OurMissionSection } from "./OurMissionSection";

// `useLivePreview`'s generic constraint requires an object type with an index
// signature. `RawContentCollection` is an `interface` (per repo convention),
// which — unlike a `type` literal — TS does NOT treat as implicitly
// index-signature-compatible, even though its shape matches. The identity
// `Pick` below produces a structurally identical *mapped* type, which TS does
// accept, without loosening `raw`'s actual shape or touching the interface.
type RawContentCollectionLive = Pick<
  RawContentCollection,
  keyof RawContentCollection
>;

interface OurMissionSectionLiveProps {
  readonly raw: RawContentCollectionLive;
  readonly locale: string;
}

export function OurMissionSectionLive({
  raw,
  locale,
}: OurMissionSectionLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return (
    <OurMissionSection
      content={mapContentCollection(data)}
      inspectorProps={inspectorProps}
    />
  );
}
