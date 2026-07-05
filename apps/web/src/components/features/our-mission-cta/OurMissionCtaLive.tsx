"use client";

import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import { OurMissionCta } from "./OurMissionCta";

interface OurMissionCtaLiveProps {
  readonly raw: Parameters<typeof OurMissionCta>[0]["content"];
  readonly locale: string;
}

export function OurMissionCtaLive({ raw, locale }: OurMissionCtaLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return <OurMissionCta content={data} inspectorProps={inspectorProps} />;
}
