import { describe, it, expect } from "vitest";
import {
  FEATURED_WIDTH,
  FEATURED_HEIGHT,
  stripScriptureVersion,
  pickPrimaryScripture,
  composeImageBrief,
  titleFontSize,
  buildFeaturedCardHtml,
} from "./featuredCard";

describe("stripScriptureVersion", () => {
  it("removes a trailing version parenthetical", () => {
    expect(stripScriptureVersion("Efesios 2:11-22 (RVR1960)")).toBe("Efesios 2:11-22");
    expect(stripScriptureVersion("Ephesians 2:14 (NIV)")).toBe("Ephesians 2:14");
  });

  it("leaves a plain reference untouched", () => {
    expect(stripScriptureVersion("Salmo 27:4")).toBe("Salmo 27:4");
  });
});

describe("pickPrimaryScripture", () => {
  it("returns the first non-empty ref without its version", () => {
    expect(
      pickPrimaryScripture({ scriptureRefs: ["Efesios 2:11-22 (RVR1960)", "Juan 17:20-23"] }),
    ).toBe("Efesios 2:11-22");
  });

  it("skips empty entries", () => {
    expect(pickPrimaryScripture({ scriptureRefs: ["", "  ", "Romanos 8:1 (RVR1960)"] })).toBe(
      "Romanos 8:1",
    );
  });

  it("returns undefined when there is nothing usable", () => {
    expect(pickPrimaryScripture({ scriptureRefs: [] })).toBeUndefined();
    expect(pickPrimaryScripture({})).toBeUndefined();
    expect(pickPrimaryScripture(null)).toBeUndefined();
    expect(pickPrimaryScripture(undefined)).toBeUndefined();
  });
});

describe("composeImageBrief", () => {
  it("interpolates the title, thesis, and scripture into the theme", () => {
    const brief = composeImageBrief({
      title: "El amor que derriba muros",
      thesis: "Cristo es nuestra paz",
      scripture: "Efesios 2:14",
    });
    expect(brief).toContain("El amor que derriba muros");
    expect(brief).toContain("Cristo es nuestra paz");
    expect(brief).toContain("Efesios 2:14");
  });

  it("works with only a title", () => {
    const brief = composeImageBrief({ title: "La gracia de Dios" });
    expect(brief).toContain("La gracia de Dios");
  });

  it("bakes in the church-appropriate guardrails", () => {
    const brief = composeImageBrief({ title: "x" });
    // No text in the image
    expect(brief).toMatch(/NO text/i);
    // No depiction of deity / faces
    expect(brief).toMatch(/NO depiction of God, Jesus/i);
    expect(brief).toMatch(/human faces/i);
    // Non-figurative
    expect(brief).toMatch(/Non-figurative/i);
  });

  it("includes the brand palette hexes", () => {
    const brief = composeImageBrief({ title: "x" });
    expect(brief).toContain("#0070B3");
    expect(brief).toContain("#EBE2D6");
    expect(brief).toContain("#0F1729");
  });
});

describe("titleFontSize", () => {
  it("steps down the size as the title grows", () => {
    const short = titleFontSize("La gracia"); // 9
    const medium = titleFontSize("El amor que derriba muros del corazón hoy"); // ~41
    const long = titleFontSize(
      "Un título notablemente largo que necesita reducir el tamaño para caber en dos líneas",
    );
    expect(short).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThanOrEqual(long);
    expect(long).toBeGreaterThanOrEqual(40);
    expect(short).toBeLessThanOrEqual(76);
  });
});

describe("buildFeaturedCardHtml", () => {
  const base = {
    title: "El amor que derriba muros",
    sermonDate: "2026-06-07",
    preacher: "Jonathan Hanegan",
    scripture: "Efesios 2:14",
    logoDataUri: "data:image/png;base64,LOGO",
  };

  it("renders at 1200×630 and includes the title", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain(`width: ${FEATURED_WIDTH}px`);
    expect(html).toContain(`height: ${FEATURED_HEIGHT}px`);
    expect(html).toContain("El amor que derriba muros");
  });

  it("builds the es-AR eyebrow with kicker + long date, uppercased", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain("PRÉDICA · 7 DE JUNIO DE 2026");
  });

  it("uses the AI background when provided and does not apply the fallback gradient element", () => {
    const html = buildFeaturedCardHtml(
      { ...base, backgroundDataUri: "data:image/png;base64,BG" },
      "es-AR",
    );
    expect(html).toContain("background-image:url('data:image/png;base64,BG')");
    // The .bg--fallback CSS rule always exists; assert the element doesn't use it.
    expect(html).not.toContain('class="bg bg--fallback"');
  });

  it("uses the on-brand gradient fallback element when there is no AI background", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain('class="bg bg--fallback"');
    expect(html).not.toContain("background-image:url(");
  });

  it("always renders the legibility scrim", () => {
    expect(buildFeaturedCardHtml(base, "es-AR")).toContain('class="scrim"');
  });

  it("renders the logo image when a data URI is given", () => {
    expect(buildFeaturedCardHtml(base, "es-AR")).toContain('src="data:image/png;base64,LOGO"');
  });

  it("falls back to the wordmark when no logo is given", () => {
    const html = buildFeaturedCardHtml({ ...base, logoDataUri: undefined }, "es-AR");
    expect(html).toContain("logo-fallback");
    expect(html).toContain("Iglesia de Cristo Redentor");
  });

  it("omits the meta line when scripture and preacher are both absent", () => {
    const html = buildFeaturedCardHtml(
      { title: base.title, sermonDate: base.sermonDate },
      "es-AR",
    );
    expect(html).not.toContain('class="meta"');
  });

  it("includes both meta parts with a separator when present", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain('class="meta"');
    expect(html).toContain("Efesios 2:14");
    expect(html).toContain("Jonathan Hanegan");
  });

  it("escapes HTML in the title to prevent injection", () => {
    const html = buildFeaturedCardHtml(
      { ...base, title: '<script>alert("x")</script>' },
      "es-AR",
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the en-US kicker for the en-US locale", () => {
    const html = buildFeaturedCardHtml(base, "en-US");
    expect(html).toContain("SERMON · JUNE 7, 2026");
  });
});
