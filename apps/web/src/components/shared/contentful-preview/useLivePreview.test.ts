import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// useContentfulLiveUpdates/useContentfulInspectorMode require
// ContentfulLivePreview.init() (done by ContentfulLivePreviewProvider) to run
// for real — outside a mounted provider they throw. Mock the SDK boundary so
// this test exercises useLivePreview's OWN logic (delegation, the `{ locale }`
// options shape, and coalescing the SDK's `null` into `{}`) without needing a
// live provider. The mock's inspector function mirrors the SDK's real
// `getProps` contract: null when entryId/fieldId is missing, otherwise the
// `data-contentful-*` attribute set.
vi.mock("@contentful/live-preview/react", () => ({
  useContentfulLiveUpdates: vi.fn((data: unknown) => data),
  useContentfulInspectorMode: vi.fn(
    () =>
      ({
        entryId,
        fieldId,
        locale,
      }: {
        entryId?: string;
        fieldId: string;
        locale?: string;
      }): Record<string, string> | null => {
        if (!entryId || !fieldId) {
          return null;
        }
        return {
          "data-contentful-entry-id": entryId,
          "data-contentful-field-id": fieldId,
          ...(locale ? { "data-contentful-locale": locale } : {}),
        };
      },
  ),
}));

import {
  useContentfulInspectorMode,
  useContentfulLiveUpdates,
} from "@contentful/live-preview/react";
import { useLivePreview } from "./useLivePreview";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useLivePreview", () => {
  it("delegates to useContentfulLiveUpdates and returns its result as data", () => {
    const raw = { sys: { id: "e1" }, __typename: "Section", headline: "Hi" };

    const { result } = renderHook(() => useLivePreview(raw, "es-AR"));

    expect(result.current.data).toEqual(raw);
    expect(useContentfulLiveUpdates).toHaveBeenCalledWith(raw, {
      locale: "es-AR",
    });
  });

  it("presets the hook's locale on useContentfulInspectorMode", () => {
    renderHook(() => useLivePreview({}, "en-US"));

    expect(useContentfulInspectorMode).toHaveBeenCalledWith({
      locale: "en-US",
    });
  });

  it("inspectorProps yields the data-contentful-* attribute set for an entry+field", () => {
    const { result } = renderHook(() => useLivePreview({}, "es-AR"));

    const attrs = result.current.inspectorProps({
      entryId: "e1",
      fieldId: "headline",
    });

    expect(attrs["data-contentful-entry-id"]).toBe("e1");
    expect(attrs["data-contentful-field-id"]).toBe("headline");
  });

  it("inspectorProps coalesces the SDK's null (missing args) into an empty object", () => {
    const { result } = renderHook(() => useLivePreview({}, "es-AR"));

    // @ts-expect-error — intentionally omitting the required entryId to exercise
    // the SDK's own "missing property" guard (which returns null).
    const attrs = result.current.inspectorProps({ fieldId: "headline" });

    expect(attrs).toEqual({});
  });
});
