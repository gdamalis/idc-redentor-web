import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── next-intl/server mock ─────────────────────────────────────────────────────
// `getTranslations` is async in real next-intl; the mock returns the key itself
// so assertions can target the i18n key rather than translated copy.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

// ── Child components mocked out — this file only exercises the audio-language
// notice wiring (ICR-146), not the children's own rendering (each has its own
// tests).
vi.mock("./SermonHeader", () => ({
  SermonHeader: () => <div data-testid="sermon-header" />,
}));
vi.mock("./SermonAudioPlayer", () => ({
  SermonAudioPlayer: () => <div data-testid="sermon-audio-player" />,
}));
vi.mock("./PdfDownloadButton", () => ({
  PdfDownloadButton: () => <div data-testid="pdf-download-button" />,
}));
vi.mock("./SermonContent", () => ({
  SermonContent: () => <div data-testid="sermon-content" />,
}));
vi.mock("./ScriptureReferences", () => ({
  ScriptureReferences: () => <div data-testid="scripture-references" />,
}));
vi.mock("./RelatedSermons", () => ({
  RelatedSermons: () => <div data-testid="related-sermons" />,
}));
vi.mock("@src/components/features/blog-post-details/PostActions", () => ({
  PostActions: () => <div data-testid="post-actions" />,
}));

import SermonDetails from "./SermonDetails";
import type { Sermon } from "@src/types/Sermon";

const baseSermon: Sermon = {
  title: "La gracia de Dios",
  slug: "la-gracia-de-dios",
  sermonDate: "2025-06-01",
  preacher: { name: "Pastor Juan", email: "juan@example.com" },
  audioLanguages: ["es-AR"],
  thesis: "La gracia es suficiente",
  mainPoints: [],
  excerpt: "Un mensaje sobre la gracia.",
  audio: {
    url: "https://example.com/audio.mp3",
    title: "Audio",
    contentType: "audio/mpeg",
    fileName: "audio.mp3",
    size: 1024,
  },
  seoTitle: "La gracia de Dios",
  seoDescription: "Un mensaje sobre la gracia.",
  keywords: [],
  sys: { id: "abc123" },
};

describe("SermonDetails — audio-language notice (ICR-146)", () => {
  it("renders no notice for a Spanish-only sermon on the es-AR page (AC2 — no regression)", async () => {
    const ui = await SermonDetails({
      sermon: baseSermon,
      relatedSermons: [],
      locale: "es-AR",
    });
    render(ui);

    expect(screen.queryByText("audio-language.es")).toBeNull();
    expect(screen.queryByText("audio-language.en")).toBeNull();
    expect(screen.queryByText("audio-language.bilingual")).toBeNull();
  });

  it("announces a Spanish recording to an en-US reader (AC4 — supersedes the retired note)", async () => {
    const ui = await SermonDetails({
      sermon: baseSermon,
      relatedSermons: [],
      locale: "en-US",
    });
    render(ui);

    expect(screen.getByText("audio-language.es")).toBeDefined();
  });

  it("announces a bilingual recording on the es-AR page (AC1)", async () => {
    const bilingualSermon: Sermon = {
      ...baseSermon,
      audioLanguages: ["es-AR", "en-US"],
    };
    const ui = await SermonDetails({
      sermon: bilingualSermon,
      relatedSermons: [],
      locale: "es-AR",
    });
    render(ui);

    expect(screen.getByText("audio-language.bilingual")).toBeDefined();
  });

  it("announces a bilingual recording on the en-US page too (AC1)", async () => {
    const bilingualSermon: Sermon = {
      ...baseSermon,
      audioLanguages: ["es-AR", "en-US"],
    };
    const ui = await SermonDetails({
      sermon: bilingualSermon,
      relatedSermons: [],
      locale: "en-US",
    });
    render(ui);

    expect(screen.getByText("audio-language.bilingual")).toBeDefined();
  });

  it("never renders a notice when there is no audio, even if languages differ from the page locale", async () => {
    const noAudioSermon: Sermon = {
      ...baseSermon,
      audio: undefined,
      audioLanguages: ["es-AR"],
    };
    const ui = await SermonDetails({
      sermon: noAudioSermon,
      relatedSermons: [],
      locale: "en-US",
    });
    render(ui);

    expect(screen.queryByText("audio-language.es")).toBeNull();
  });
});
