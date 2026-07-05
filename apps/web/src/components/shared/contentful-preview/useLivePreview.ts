"use client";

import {
  useContentfulInspectorMode,
  useContentfulLiveUpdates,
} from "@contentful/live-preview/react";

// Matches the SDK's own generic bound for useContentfulLiveUpdates
// (Argument = Record<any, any> | Record<any, any>[]) without importing an
// internal (unexported) SDK type.
type LivePreviewEntity = Record<string, unknown> | Record<string, unknown>[];

export type InspectorProps = (args: {
  entryId: string;
  fieldId: string;
  locale?: string;
}) => Record<string, string>;

export interface UseLivePreviewResult<T> {
  readonly data: T;
  readonly inspectorProps: InspectorProps;
}

// Un-preset accessor: entryId is NOT bound by the hook, so nested entries
// (e.g. a BeliefItem inside a ContentCollection) can pass their own entryId
// per field instead of being locked to the top-level raw node's id.
export function useLivePreview<
  T extends LivePreviewEntity | null | undefined,
>(raw: T, locale: string): UseLivePreviewResult<T> {
  const data = useContentfulLiveUpdates(raw, { locale });
  const getInspectorProps = useContentfulInspectorMode({ locale });

  const inspectorProps: InspectorProps = ({
    entryId,
    fieldId,
    locale: fieldLocale,
  }) => {
    const tags = getInspectorProps({
      entryId,
      fieldId,
      ...(fieldLocale ? { locale: fieldLocale } : {}),
    });

    if (!tags) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(tags).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  };

  return { data, inspectorProps };
}
