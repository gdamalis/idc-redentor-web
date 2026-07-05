import { Document } from "@contentful/rich-text-types";

export interface RichTextField {
  json: Document;
}

export interface ContentfulImage {
  url: string;
  title: string;
}

export const BELIEF_KIND = {
  Creed: "Creed",
  Value: "Value",
} as const;

export type BeliefKind = (typeof BELIEF_KIND)[keyof typeof BELIEF_KIND];

export interface StructuredBibleVerse {
  book: string;
  chapter: string;
  fromVerse: string;
  toVerse: string | null;
  verseContent: string;
  bibleVersion: string;
}

export interface ContentItem {
  title: string;
  description: RichTextField;
  bibleVerse?: StructuredBibleVerse | null;
  image?: ContentfulImage;
  kind?: BeliefKind;
  sys?: { id: string };
  __typename?: string;
}

export interface ContentCollection {
  title: string;
  description: RichTextField;
  creedItems: ContentItem[];
  sys?: { id: string };
}

// The raw GraphQL node returned by getContentCollection (unmapped). image is
// declared for parity with the mapper's output shape, but the query never
// requests a top-level `image` field on ContentCollection — it is always
// undefined today. See mapContentCollection.ts.
export interface RawContentCollection {
  title: string;
  description: RichTextField;
  contentItemsCollection: { items: ContentItem[] };
  image?: ContentfulImage;
  sys: { id: string };
  __typename: string;
}

export const SECTION_LAYOUT = {
  hero: "hero",
  cta: "cta",
  textBlock: "textBlock",
} as const;

export type SectionLayout = (typeof SECTION_LAYOUT)[keyof typeof SECTION_LAYOUT];

export interface SectionImageItem {
  url: string;
  title: string;
  width?: number;
  height?: number;
}

export interface Section {
  layout?: SectionLayout;
  machineName?: string;
  headline?: string;
  subHeadline?: string;
  body?: RichTextField;
  ctaText?: string;
  targetPage?: { slug: string };
  urlParameters?: string;
  image?: ContentfulImage;
  imagesCollection?: { items: SectionImageItem[] };
  sys?: { id: string };
  __typename?: string;
}
