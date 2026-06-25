// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseArgs,
  assertGuards,
  canonical,
  diffById,
  compareContentTypes,
  resolvePublishAction,
  directionOf,
} from "./sync-entries.mjs";

describe("parseArgs", () => {
  it("defaults to production -> staging dry-run", () => {
    const o = parseArgs([]);
    expect(o.from).toBe("production");
    expect(o.to).toBe("staging");
    expect(o.apply).toBe(false);
    expect(o.revalidate).toBe(false); // auto off when target !== production
  });

  it("parses direction, ids, content-type, and apply", () => {
    const o = parseArgs([
      "--from",
      "staging",
      "--to",
      "production",
      "--ids",
      "a, b ,c",
      "--content-type",
      "sermon",
      "--apply",
    ]);
    expect(o.from).toBe("staging");
    expect(o.to).toBe("production");
    expect(o.ids).toEqual(["a", "b", "c"]);
    expect(o.contentTypes).toEqual(["sermon"]);
    expect(o.apply).toBe(true);
    expect(o.revalidate).toBe(true); // auto on when target === production
  });

  it("honours --no-revalidate and --no-assets and --skip-model-check", () => {
    const o = parseArgs([
      "--to",
      "production",
      "--no-revalidate",
      "--no-assets",
      "--skip-model-check",
    ]);
    expect(o.revalidate).toBe(false);
    expect(o.assets).toBe(false);
    expect(o.modelCheck).toBe(false);
  });

  it("throws on unknown flags and bare args", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/);
    expect(() => parseArgs(["bare"])).toThrow(/unexpected argument/);
  });
});

describe("assertGuards", () => {
  it("refuses the master alias on either side", () => {
    expect(() => assertGuards({ from: "master", to: "staging" })).toThrow(
      /master/,
    );
    expect(() => assertGuards({ from: "staging", to: "master-0.0.1" })).toThrow(
      /master/,
    );
  });
  it("refuses identical envs", () => {
    expect(() => assertGuards({ from: "staging", to: "staging" })).toThrow(
      /differ/,
    );
  });
  it("allows production <-> staging", () => {
    expect(() =>
      assertGuards({ from: "production", to: "staging" }),
    ).not.toThrow();
    expect(() =>
      assertGuards({ from: "staging", to: "production" }),
    ).not.toThrow();
  });
});

describe("canonical", () => {
  it("is key-order independent", () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });
});

describe("diffById", () => {
  const item = (
    id,
    fields,
    published = false,
    updatedAt = "2026-01-01T00:00:00Z",
  ) => ({ id, fields, published, updatedAt });
  it("classifies created / changed / unchanged / deleted", () => {
    const source = [
      item("keep", { t: 1 }),
      item("edit", { t: 2 }),
      item("new", { t: 3 }),
    ];
    const target = [
      item("keep", { t: 1 }),
      item("edit", { t: 99 }),
      item("gone", { t: 0 }),
    ];
    const d = diffById(source, target);
    expect(d.created.map((i) => i.id)).toEqual(["new"]);
    expect(d.changed.map((i) => i.source.id)).toEqual(["edit"]);
    expect(d.unchanged.map((i) => i.source.id)).toEqual(["keep"]);
    expect(d.deleted.map((i) => i.id)).toEqual(["gone"]);
  });
  it("treats a publish-state change as changed", () => {
    const source = [item("x", { t: 1 }, true)];
    const target = [item("x", { t: 1 }, false)];
    expect(diffById(source, target).changed.map((i) => i.source.id)).toEqual([
      "x",
    ]);
  });
});

describe("compareContentTypes", () => {
  const ct = (id, fields) => ({ id, fields });
  const f = (id, type, extra = {}) => ({ id, type, ...extra });
  it("passes when shapes match", () => {
    const s = [
      ct("sermon", [
        f("title", "Symbol"),
        f("preacher", "Link", { linkType: "Entry" }),
      ]),
    ];
    const t = [
      ct("sermon", [
        f("title", "Symbol"),
        f("preacher", "Link", { linkType: "Entry" }),
      ]),
    ];
    expect(compareContentTypes(s, t, null).compatible).toBe(true);
  });
  it("flags a missing type", () => {
    const r = compareContentTypes([ct("sermon", [])], [], ["sermon"]);
    expect(r.compatible).toBe(false);
    expect(r.problems[0]).toMatch(/missing in target/);
  });
  it("flags a missing field and a shape difference", () => {
    const s = [ct("sermon", [f("title", "Symbol"), f("body", "Text")])];
    const t = [ct("sermon", [f("title", "Text")])];
    const r = compareContentTypes(s, t, ["sermon"]);
    expect(r.compatible).toBe(false);
    expect(r.problems.some((p) => /field 'body' missing/.test(p))).toBe(true);
    expect(r.problems.some((p) => /field 'title' shape differs/.test(p))).toBe(
      true,
    );
  });
});

describe("resolvePublishAction", () => {
  it("promote: draft by default, publish with the flag", () => {
    expect(
      resolvePublishAction({
        direction: "promote",
        sourcePublished: true,
        publishFlag: false,
      }),
    ).toBe("draft");
    expect(
      resolvePublishAction({
        direction: "promote",
        sourcePublished: true,
        publishFlag: true,
      }),
    ).toBe("publish");
  });
  it("promote: draft regardless of source publish state", () => {
    expect(
      resolvePublishAction({
        direction: "promote",
        sourcePublished: false,
        publishFlag: false,
      }),
    ).toBe("draft");
  });
  it("refresh: mirrors source state", () => {
    expect(
      resolvePublishAction({
        direction: "refresh",
        sourcePublished: true,
        publishFlag: false,
      }),
    ).toBe("publish");
    expect(
      resolvePublishAction({
        direction: "refresh",
        sourcePublished: false,
        publishFlag: false,
      }),
    ).toBe("leave");
  });
});

describe("directionOf", () => {
  it("is promote only when targeting production", () => {
    expect(directionOf({ to: "production" })).toBe("promote");
    expect(directionOf({ to: "staging" })).toBe("refresh");
  });
});
