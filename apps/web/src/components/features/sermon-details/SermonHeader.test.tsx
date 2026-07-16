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

import { SermonHeader } from "./SermonHeader";
import type { Sermon } from "@src/types/Sermon";

type HeaderSermon = Pick<
  Sermon,
  | "title"
  | "thesis"
  | "preacher"
  | "additionalPreachers"
  | "sermonDate"
  | "interpreter"
>;

const baseSermon: HeaderSermon = {
  title: "La gracia de Dios",
  thesis: "La gracia es suficiente",
  sermonDate: "2025-06-01",
  preacher: { name: "Pastor Juan", email: "juan@example.com" },
};

describe("SermonHeader — interpreter credit (ICR-146)", () => {
  it("does not render an interpreter block when sermon.interpreter is absent", () => {
    render(<SermonHeader sermon={baseSermon} />);
    expect(screen.queryByText("interpreted-by")).toBeNull();
  });

  it("renders a distinct, labeled interpreter block when sermon.interpreter is set", () => {
    const sermon: HeaderSermon = {
      ...baseSermon,
      interpreter: { name: "Jonathan Hanegan", email: "jh@example.com" },
    };
    render(<SermonHeader sermon={sermon} />);

    expect(screen.getByText("interpreted-by")).toBeDefined();
    expect(screen.getByText("Jonathan Hanegan")).toBeDefined();
  });

  // AC3 — the whole ethical point of the ticket: an interpreter did not preach and
  // must never be attributed as one. This is the case most likely to regress if a
  // future refactor "helpfully" folds every credited person into one list.
  it("NEVER folds the interpreter into the preacher byline, even with co-preachers (AC3)", () => {
    const sermon: HeaderSermon = {
      ...baseSermon,
      additionalPreachers: [{ name: "Pastor Ana", email: "ana@example.com" }],
      interpreter: { name: "Jonathan Hanegan", email: "jh@example.com" },
    };
    render(<SermonHeader sermon={sermon} />);

    // The byline text is preacher names joined by " · " — the interpreter is not one
    // of them.
    expect(screen.getByText("Pastor Juan · Pastor Ana")).toBeDefined();
    // The interpreter is still credited, but only in their own separate block.
    expect(screen.getByText("Jonathan Hanegan")).toBeDefined();
  });
});
