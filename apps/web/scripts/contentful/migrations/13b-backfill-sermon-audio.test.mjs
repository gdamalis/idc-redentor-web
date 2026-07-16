// @vitest-environment node
//
// ICR-146: pins `isInterpreterNote` / `stripInterpreterNote` against the REAL rich-text
// nodes from the live 2026-07-12 bilingual sermon entry (4Tp4Qg3SGEIEIJn09w5OjW). This is
// the riskiest part of the 13b backfill migration — it DELETES a node from live rich-text
// content — and staging's drifted content meant the dry-run never exercised it. See
// docs/architecture/contentful-environments.md and the migration file's SAFETY INVARIANTS.
import { describe, it, expect } from "vitest";
import {
  isInterpreterNote,
  stripInterpreterNote,
  classifyPublishState,
} from "./13b-backfill-sermon-audio.mjs";

// --- Real payloads, copied verbatim from the live entry -------------------------------

const ES_NOTE_TEXT =
  "Nota: Doug Wagner predicó este mensaje en inglés y Jonathan Hanegan lo fue interpretando al español en vivo. Por eso la grabación se escucha en los dos idiomas.";

const EN_NOTE_TEXT =
  "Note: Doug Wagner preached this message in English, with live Spanish interpretation by Jonathan Hanegan. That is why the recording is in both languages.";

const REAL_INTERPRETER_NOTE_ES = {
  nodeType: "blockquote",
  data: {},
  content: [
    {
      nodeType: "paragraph",
      data: {},
      content: [
        {
          nodeType: "text",
          data: {},
          marks: [],
          value: ES_NOTE_TEXT,
        },
      ],
    },
  ],
};

const REAL_INTERPRETER_NOTE_EN = {
  nodeType: "blockquote",
  data: {},
  content: [
    {
      nodeType: "paragraph",
      data: {},
      content: [
        {
          nodeType: "text",
          data: {},
          marks: [],
          value: EN_NOTE_TEXT,
        },
      ],
    },
  ],
};

// --- Helpers for realistic (non-toy) surrounding content -------------------------------

function paragraph(value) {
  return {
    nodeType: "paragraph",
    data: {},
    content: [{ nodeType: "text", data: {}, marks: [], value }],
  };
}

function blockquote(value) {
  return { nodeType: "blockquote", data: {}, content: [paragraph(value)] };
}

function richTextDoc(content) {
  return { nodeType: "document", data: {}, content };
}

// Same sermon's closing scripture blockquote — a legitimate blockquote that must survive.
const SCRIPTURE_BLOCKQUOTE = blockquote(
  "«Pero vayan a decirles a los discípulos y a Pedro: “Él va delante de ustedes a Galilea...”» — Marcos 16:7 (NVI)",
);

const INTRO_PARAGRAPHS = [
  paragraph(
    "Hoy reflexionamos sobre la fidelidad de Dios en medio de la adversidad.",
  ),
  paragraph(
    "Doug Wagner compartió su testimonio personal de fe durante la persecución.",
  ),
];

describe("isInterpreterNote", () => {
  it("matches the real es-AR interpreter note", () => {
    expect(isInterpreterNote(REAL_INTERPRETER_NOTE_ES)).toBe(true);
  });

  it("matches the real en-US interpreter note", () => {
    expect(isInterpreterNote(REAL_INTERPRETER_NOTE_EN)).toBe(true);
  });

  it("does NOT match a legitimate closing scripture blockquote (negative control)", () => {
    expect(isInterpreterNote(SCRIPTURE_BLOCKQUOTE)).toBe(false);
  });

  it("does NOT match a blockquote mentioning interpretation but not Jonathan Hanegan", () => {
    const node = blockquote(
      "Nota: este mensaje incluyó interpretación en vivo al español.",
    );
    expect(isInterpreterNote(node)).toBe(false);
  });

  it("does NOT match a blockquote mentioning Jonathan Hanegan but not interpretation", () => {
    const node = blockquote(
      "Gracias a Jonathan Hanegan por acompañarnos hoy en el servicio.",
    );
    expect(isInterpreterNote(node)).toBe(false);
  });

  it("does NOT match a non-blockquote node carrying the same text", () => {
    expect(isInterpreterNote(paragraph(ES_NOTE_TEXT))).toBe(false);
  });
});

describe("stripInterpreterNote", () => {
  it("removes the note when it is the last node, and leaves prior nodes byte-identical", () => {
    const original = richTextDoc([
      ...INTRO_PARAGRAPHS,
      SCRIPTURE_BLOCKQUOTE,
      REAL_INTERPRETER_NOTE_ES,
    ]);

    const { doc, removed } = stripInterpreterNote(original);

    expect(removed).toBe(true);
    expect(doc.content).toEqual(original.content.slice(0, -1));
  });

  it("is a no-op when the document does not end with the note (idempotent re-run)", () => {
    const original = richTextDoc([...INTRO_PARAGRAPHS, SCRIPTURE_BLOCKQUOTE]);

    const { doc, removed } = stripInterpreterNote(original);

    expect(removed).toBe(false);
    expect(doc).toEqual(original);
  });

  it("does NOT remove a legitimate scripture blockquote that happens to be last", () => {
    const original = richTextDoc([...INTRO_PARAGRAPHS, SCRIPTURE_BLOCKQUOTE]);

    const { doc, removed } = stripInterpreterNote(original);

    expect(removed).toBe(false);
    expect(doc.content[doc.content.length - 1]).toEqual(SCRIPTURE_BLOCKQUOTE);
  });

  it("handles an empty or malformed document without throwing", () => {
    expect(() => stripInterpreterNote(undefined)).not.toThrow();
    expect(() => stripInterpreterNote({})).not.toThrow();
    expect(() => stripInterpreterNote({ content: [] })).not.toThrow();

    expect(stripInterpreterNote(undefined)).toEqual({
      doc: undefined,
      removed: false,
    });
    expect(stripInterpreterNote({})).toEqual({ doc: {}, removed: false });
    expect(stripInterpreterNote({ content: [] })).toEqual({
      doc: { content: [] },
      removed: false,
    });
  });
});

describe("classifyPublishState", () => {
  it("returns leave-draft for a never-published entry", () => {
    expect(classifyPublishState({ publishedVersion: null, version: 1 })).toBe(
      "leave-draft",
    );
  });

  it("returns leave-draft for a never-published entry with several draft saves", () => {
    expect(classifyPublishState({ publishedVersion: null, version: 3 })).toBe(
      "leave-draft",
    );
  });

  it("returns republish for the real la-paradoja shape (published, clean)", () => {
    expect(classifyPublishState({ publishedVersion: 65, version: 66 })).toBe(
      "republish",
    );
  });

  it("returns republish for the real el-deseo shape (published, clean)", () => {
    expect(classifyPublishState({ publishedVersion: 16, version: 17 })).toBe(
      "republish",
    );
  });

  it("returns skip-pending when published then 4 draft edits", () => {
    expect(classifyPublishState({ publishedVersion: 65, version: 70 })).toBe(
      "skip-pending",
    );
  });

  it("returns skip-pending when published with one pending edit", () => {
    expect(classifyPublishState({ publishedVersion: 5, version: 7 })).toBe(
      "skip-pending",
    );
  });
});
