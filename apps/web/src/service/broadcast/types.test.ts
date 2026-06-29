import { describe, expect, it } from "vitest";
import { broadcastInputSchema } from "./types";

const valid = {
  broadcastId: "blog:hola-mundo:es-AR",
  subject: "Nuevo post",
  html: "<p>cuerpo</p>",
  text: "cuerpo",
  locale: "es-AR",
};

describe("broadcastInputSchema", () => {
  it("accepts a valid input", () => {
    expect(broadcastInputSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an empty broadcastId", () => {
    expect(broadcastInputSchema.safeParse({ ...valid, broadcastId: "" }).success).toBe(false);
  });
  it("rejects a blank subject", () => {
    expect(broadcastInputSchema.safeParse({ ...valid, subject: "   " }).success).toBe(false);
  });
  it("rejects empty html or text", () => {
    expect(broadcastInputSchema.safeParse({ ...valid, html: "" }).success).toBe(false);
    expect(broadcastInputSchema.safeParse({ ...valid, text: "" }).success).toBe(false);
  });
  it("rejects an unknown locale", () => {
    expect(broadcastInputSchema.safeParse({ ...valid, locale: "pt-BR" }).success).toBe(false);
  });
});
