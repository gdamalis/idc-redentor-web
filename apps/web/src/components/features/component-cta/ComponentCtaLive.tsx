"use client";

import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import { ComponentCta } from "./ComponentCta";

interface ComponentCtaLiveProps {
  readonly raw: Parameters<typeof ComponentCta>[0]["content"];
  readonly locale: string;
}

export function ComponentCtaLive({ raw, locale }: ComponentCtaLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return <ComponentCta content={data} inspectorProps={inspectorProps} />;
}
