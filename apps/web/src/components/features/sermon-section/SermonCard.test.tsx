import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useLocale: () => "es-AR",
  useTranslations: () => (key: string) => key,
}));

// ── next/image mock ───────────────────────────────────────────────────────────
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...rest
  }: { src: string; alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />
  ),
}));

// ── i18n routing mock ─────────────────────────────────────────────────────────
vi.mock("@src/i18n/routing", () => ({
  Link: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// ── framer-motion mock ────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

import { SermonCard } from "./SermonCard";
import type { Sermon } from "@src/types/Sermon";

const baseSermon: Sermon = {
  title: "La gracia de Dios",
  slug: "la-gracia-de-dios",
  sermonDate: "2025-06-01",
  preacher: {
    name: "Pastor Juan",
    email: "juan@example.com",
  },
  audioLanguages: ["es-AR"],
  thesis: "La gracia es suficiente",
  mainPoints: [],
  excerpt: "Un mensaje sobre la gracia.",
  featuredImage: {
    url: "https://example.com/image.jpg",
    title: "Sermon image",
  },
  seoTitle: "La gracia de Dios",
  seoDescription: "Un mensaje sobre la gracia.",
  keywords: [],
  sys: { id: "abc123" },
};

describe("SermonCard", () => {
  it("renders the sermon title", () => {
    render(<SermonCard sermon={baseSermon} index={0} />);
    expect(screen.getByText("La gracia de Dios")).toBeDefined();
  });

  it("renders the preacher name", () => {
    render(<SermonCard sermon={baseSermon} index={0} />);
    expect(screen.getByText("Pastor Juan")).toBeDefined();
  });

  it("renders a link to /predicas/<slug>", () => {
    render(<SermonCard sermon={baseSermon} index={0} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/predicas/la-gracia-de-dios");
  });

  it("renders the featured image with alt text", () => {
    render(<SermonCard sermon={baseSermon} index={0} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", "Sermon image");
  });

  it("does NOT render an audio indicator when audio is absent", () => {
    render(<SermonCard sermon={baseSermon} index={0} />);
    // No headphones/play icon text should appear
    expect(screen.queryByTitle("audio-indicator")).toBeNull();
  });

  it("renders an audio indicator when audio is present", () => {
    const sermonWithAudio: Sermon = {
      ...baseSermon,
      audio: {
        url: "https://example.com/audio.mp3",
        title: "Sermon audio",
        contentType: "audio/mpeg",
        fileName: "sermon.mp3",
        size: 1024,
      },
    };
    render(<SermonCard sermon={sermonWithAudio} index={0} />);
    // Audio indicator should be present (we use aria-label="audio-indicator")
    expect(screen.getByLabelText("audio-indicator")).toBeDefined();
  });
});
