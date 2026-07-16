import type { Locale } from "@src/i18n/config";

export interface ScriptureRef {
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number | null;
  verseContent: string;
  bibleVersion: string;
}

/** The author shape shared by `preacher`, `additionalPreachers` and `interpreter`. */
export interface SermonAuthor {
  name: string;
  avatar?: {
    url: string;
    title: string;
  };
  email: string;
}

export interface Sermon {
  title: string;
  slug: string;
  sermonDate: string;
  preacher: SermonAuthor;
  /**
   * Co-preachers for a multi-preacher service (optional). When present, the byline
   * lists `[preacher, ...additionalPreachers]`; absent for normal single-author sermons.
   */
  additionalPreachers?: SermonAuthor[];

  /**
   * Languages spoken in the audio recording. NON-LOCALIZED in Contentful: one
   * recording serves both locale pages, so both pages see the same value.
   * The mapper guarantees a non-empty array (absent/empty => ["es-AR"]), so
   * consumers never handle undefined.
   */
  audioLanguages: Locale[];

  /**
   * The live interpreter, when the message was interpreted into another language.
   * NOT a preacher: never add this person to the preacher byline (ICR-146 AC3).
   */
  interpreter?: SermonAuthor;
  scriptureReferences?: ScriptureRef[];
  thesis: string;
  mainPoints: string[];
  excerpt: string;
  content?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: any;
    links: {
      assets: {
        block: Array<{
          sys: { id: string };
          url: string;
          title: string;
          width?: number;
          height?: number;
          contentType: string;
        }>;
      };
    };
  };
  featuredImage?: {
    url: string;
    title: string;
  };
  audio?: {
    url: string;
    title: string;
    contentType: string;
    fileName: string;
    size: number;
  };
  durationSeconds?: number;
  pdfSummary?: {
    url: string;
    title: string;
  };
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  relatedSermons?: Array<{
    title: string;
    slug: string;
    sermonDate: string;
    excerpt: string;
    featuredImage?: {
      url: string;
      title: string;
    };
  }>;
  sys: {
    id: string;
    publishedAt?: string;
  };
}
