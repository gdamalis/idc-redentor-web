import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sermon } from "@src/types/Sermon";

// Mock next/server and next-intl so they don't blow up in jsdom
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@src/i18n/config", () => ({
  buildLocaleAlternates: vi.fn().mockReturnValue({ "es-AR": "/es-AR/predicas/slug", "en-US": "/en-US/predicas/slug" }),
}));

vi.mock("./contentful/draftMode", () => ({
  shouldUseDraftMode: vi.fn().mockResolvedValue(false),
}));

import { buildSermonMetadata, buildSermonJsonLd, formatIsoDuration } from "./sermonMetadata";

const BASE_URL = "https://idcredentor.org";

// Inject NEXT_PUBLIC_BASE_URL into process.env for tests
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", BASE_URL);
});

const FULL_SERMON: Sermon = {
  title: "La gracia de Dios",
  slug: "la-gracia-de-dios",
  sermonDate: "2025-03-16",
  preacher: {
    name: "Juan García",
    avatar: { url: "https://images.ctfassets.net/avatar.jpg", title: "Juan García" },
    email: "juan@example.com",
  },
  scriptureReferences: [
    { book: "Efesios", chapter: 2, fromVerse: 8, toVerse: 9, verseContent: "...", bibleVersion: "RVR60" },
    { book: "Romanos", chapter: 3, fromVerse: 24, toVerse: null, verseContent: "...", bibleVersion: "RVR60" },
  ],
  thesis: "Somos salvos por gracia.",
  mainPoints: ["Gracia definida", "Gracia vivida"],
  excerpt: "Un mensaje sobre la gracia.",
  content: { json: { nodeType: "document", content: [] }, links: { assets: { block: [] } } },
  featuredImage: { url: "https://images.ctfassets.net/hero.jpg", title: "Hero image" },
  audio: {
    url: "https://assets.ctfassets.net/sermon.mp3",
    title: "Audio del sermón",
    contentType: "audio/mpeg",
    fileName: "sermon.mp3",
    size: 45000000,
  },
  durationSeconds: 2730,
  pdfSummary: { url: "https://assets.ctfassets.net/resumen.pdf", title: "Resumen PDF" },
  seoTitle: "La gracia de Dios | IDC Redentor",
  seoDescription: "Un mensaje sobre la gracia de Dios.",
  keywords: ["gracia", "fe", "salvación"],
  relatedSermons: [],
  sys: { id: "sermon-id-1", publishedAt: "2025-03-17T10:00:00Z" },
};

const SERMON_NO_AUDIO: Sermon = {
  ...FULL_SERMON,
  audio: undefined,
  durationSeconds: undefined,
  scriptureReferences: undefined,
};

// A draft sermon where the editor has not yet uploaded a featured image.
// This is the exact shape that crashed the live preview (featuredImage: null).
const SERMON_NO_IMAGE: Sermon = {
  ...FULL_SERMON,
  featuredImage: undefined,
};

describe("formatIsoDuration", () => {
  it("formats whole minutes correctly", () => {
    expect(formatIsoDuration(60)).toBe("PT1M0S");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatIsoDuration(3661)).toBe("PT1H1M1S");
  });

  it("formats seconds only", () => {
    expect(formatIsoDuration(45)).toBe("PT0M45S");
  });

  it("formats the test sermon duration (2730 seconds = 45m30s)", () => {
    expect(formatIsoDuration(2730)).toBe("PT45M30S");
  });

  it("handles exactly one hour", () => {
    expect(formatIsoDuration(3600)).toBe("PT1H0M0S");
  });
});

describe("buildSermonMetadata", () => {
  it("uses the sermon seoTitle and seoDescription", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect(meta.title).toBe("La gracia de Dios | IDC Redentor");
    expect(meta.description).toBe("Un mensaje sobre la gracia de Dios.");
  });

  it("sets openGraph type to article", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect((meta.openGraph as Record<string, unknown>)?.type).toBe("article");
  });

  it("sets openGraph authors from preacher name", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect((meta.openGraph as Record<string, unknown>)?.authors).toEqual(["Juan García"]);
  });

  it("sets openGraph publishedTime from sermonDate", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect((meta.openGraph as Record<string, unknown>)?.publishedTime).toBe("2025-03-16");
  });

  it("sets openGraph modifiedTime from sys.publishedAt when present", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect((meta.openGraph as Record<string, unknown>)?.modifiedTime).toBe("2025-03-17T10:00:00Z");
  });

  it("falls back modifiedTime to sermonDate when sys.publishedAt is absent", () => {
    const sermon: Sermon = { ...FULL_SERMON, sys: { id: "x" } };
    const meta = buildSermonMetadata({ sermon, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect((meta.openGraph as Record<string, unknown>)?.modifiedTime).toBe("2025-03-16");
  });

  it("includes openGraph.audio when sermon.audio is present", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.audio).toMatchObject({
      url: "https://assets.ctfassets.net/sermon.mp3",
      type: "audio/mpeg",
    });
  });

  it("omits openGraph.audio when sermon.audio is absent", () => {
    const meta = buildSermonMetadata({ sermon: SERMON_NO_AUDIO, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.audio).toBeUndefined();
  });

  it("builds canonical URL containing /predicas/", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect((meta.alternates as Record<string, unknown>)?.canonical as string).toContain("/predicas/");
  });

  it("includes keywords", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    expect(meta.keywords).toEqual(["gracia", "fe", "salvación"]);
  });

  it("does not throw when featuredImage is absent (draft preview)", () => {
    expect(() =>
      buildSermonMetadata({ sermon: SERMON_NO_IMAGE, locale: "es-AR", path: "predicas/la-gracia-de-dios" }),
    ).not.toThrow();
  });

  it("falls back to the default OG image when featuredImage is absent", () => {
    const meta = buildSermonMetadata({ sermon: SERMON_NO_IMAGE, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    const ogImages = (meta.openGraph as Record<string, unknown>)?.images as Array<{ url: string }>;
    const twImages = (meta.twitter as Record<string, unknown>)?.images as Array<{ url: string }>;
    expect(ogImages?.[0]?.url).toContain("og_default.jpeg");
    expect(twImages?.[0]?.url).toContain("og_default.jpeg");
  });

  it("uses the sermon's featuredImage for OG when present", () => {
    const meta = buildSermonMetadata({ sermon: FULL_SERMON, locale: "es-AR", path: "predicas/la-gracia-de-dios" });
    const ogImages = (meta.openGraph as Record<string, unknown>)?.images as Array<{ url: string }>;
    expect(ogImages?.[0]?.url).toBe("https://images.ctfassets.net/hero.jpg");
  });
});

describe("buildSermonJsonLd", () => {
  it("has @type Article", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld["@type"]).toBe("Article");
  });

  it("sets inLanguage to the passed locale", () => {
    const ldEs = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ldEs.inLanguage).toBe("es-AR");

    const ldEn = buildSermonJsonLd(FULL_SERMON, "en-US");
    expect(ldEn.inLanguage).toBe("en-US");
  });

  it("builds @id using /predicas/ path", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.mainEntityOfPage["@id"]).toContain("/predicas/");
    expect(ld.mainEntityOfPage["@id"]).toContain("la-gracia-de-dios");
  });

  it("sets datePublished from sermonDate", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.datePublished).toBe("2025-03-16");
  });

  it("sets dateModified from sys.publishedAt when present", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.dateModified).toBe("2025-03-17T10:00:00Z");
  });

  it("falls back dateModified to sermonDate when sys.publishedAt absent", () => {
    const sermon: Sermon = { ...FULL_SERMON, sys: { id: "x" } };
    const ld = buildSermonJsonLd(sermon, "es-AR");
    expect(ld.dateModified).toBe("2025-03-16");
  });

  it("sets author to Person with preacher name", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.author).toMatchObject({ "@type": "Person", name: "Juan García" });
  });

  it("sets publisher logo to redentor_logo.png (not og-default.jpeg)", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.publisher.logo.url).toContain("redentor_logo.png");
    expect(ld.publisher.logo.url).not.toContain("og-default.jpeg");
  });

  it("includes AudioObject with ISO duration when audio and durationSeconds present", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.audio).toMatchObject({
      "@type": "AudioObject",
      contentUrl: "https://assets.ctfassets.net/sermon.mp3",
      encodingFormat: "audio/mpeg",
      duration: "PT45M30S",
    });
  });

  it("includes AudioObject without duration when durationSeconds absent", () => {
    const sermon: Sermon = { ...FULL_SERMON, durationSeconds: undefined };
    const ld = buildSermonJsonLd(sermon, "es-AR");
    expect(ld.audio).toMatchObject({
      "@type": "AudioObject",
      contentUrl: "https://assets.ctfassets.net/sermon.mp3",
    });
    expect(ld.audio?.duration).toBeUndefined();
  });

  it("omits audio fields when sermon.audio is absent", () => {
    const ld = buildSermonJsonLd(SERMON_NO_AUDIO, "es-AR");
    expect(ld.audio).toBeUndefined();
    expect(ld.associatedMedia).toBeUndefined();
  });

  it("includes associatedMedia array when audio present", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.associatedMedia).toEqual([{
      "@type": "AudioObject",
      contentUrl: "https://assets.ctfassets.net/sermon.mp3",
    }]);
  });

  it("formats citation array from scriptureReferences (book chapter:fromVerse-toVerse (version))", () => {
    const ld = buildSermonJsonLd(FULL_SERMON, "es-AR");
    expect(ld.citation).toContain("Efesios 2:8-9 (RVR60)");
    expect(ld.citation).toContain("Romanos 3:24 (RVR60)");
  });

  it("omits citation when scriptureReferences absent", () => {
    const ld = buildSermonJsonLd(SERMON_NO_AUDIO, "es-AR");
    expect(ld.citation).toBeUndefined();
  });

  it("does not throw and falls back to the default OG image when featuredImage is absent (draft preview)", () => {
    let ld: ReturnType<typeof buildSermonJsonLd> | undefined;
    expect(() => {
      ld = buildSermonJsonLd(SERMON_NO_IMAGE, "es-AR");
    }).not.toThrow();
    expect(ld?.image).toBe(`${BASE_URL}/assets/img/og_default.jpeg`);
  });
});
