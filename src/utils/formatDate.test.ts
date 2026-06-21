import { describe, it, expect } from "vitest";
import { formatDate } from "@src/utils/formatDate";

describe("formatDate", () => {
  it("includes the year for both locales", () => {
    expect(formatDate("2025-06-21", "en-US")).toMatch(/2025/);
    expect(formatDate("2025-06-21", "es-AR")).toMatch(/2025/);
  });

  it("renders the same date differently per locale (order/casing)", () => {
    const en = formatDate("2025-06-21", "en-US");
    const es = formatDate("2025-06-21", "es-AR");
    expect(es).not.toBe(en);
  });
});
