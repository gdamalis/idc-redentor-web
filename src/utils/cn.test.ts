import { describe, it, expect } from "vitest";
import { cn } from "@src/utils/cn";

describe("cn", () => {
  it("joins truthy classes and drops falsey ones", () => {
    const maybe = (cond: boolean) => cond && "b";
    expect(cn("a", maybe(false), undefined, "c")).toBe("a c");
  });

  it("merges conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
