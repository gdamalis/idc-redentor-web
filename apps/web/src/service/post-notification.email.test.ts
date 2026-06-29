import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPostNotificationEmail } from "./post-notification.email";

afterEach(() => vi.unstubAllEnvs());

describe("buildPostNotificationEmail", () => {
  it("builds an es-AR blog email with absolute URL and subject prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://www.idcredentor.org");
    const out = buildPostNotificationEmail({
      kind: "blog",
      content: {
        title: "Hola",
        slug: "hola",
        excerpt: "Resumen",
        imageUrl: "https://img/x.jpg",
      },
      locale: "es-AR",
    });
    expect(out.subject).toBe("Nueva publicación: Hola");
    expect(out.html).toContain("https://www.idcredentor.org/es-AR/blog/hola");
    expect(out.html).toContain("Leer más");
    expect(out.html).toContain("Resumen");
    expect(out.html).toContain("<img");
    expect(out.text).toContain("https://www.idcredentor.org/es-AR/blog/hola");
  });

  it("uses the sermon segment + copy and omits image block when no image", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://www.idcredentor.org");
    const out = buildPostNotificationEmail({
      kind: "sermon",
      content: { title: "Sermón", slug: "sermon", excerpt: "x" },
      locale: "en-US",
    });
    expect(out.subject).toBe("New sermon: Sermón");
    expect(out.html).toContain("/en-US/predicas/sermon");
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain("Watch the sermon");
  });
});
