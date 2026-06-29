import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template-engine";
import { BROADCAST_CHROME } from "./broadcast.template";

describe("broadcast template", () => {
  it("wraps the body and sets es-AR lang + chrome", () => {
    const html = renderTemplate("broadcast", {
      lang: "es-AR",
      body: "<p>Hola comunidad</p>",
      logoAlt: BROADCAST_CHROME["es-AR"].logoAlt,
      footer: BROADCAST_CHROME["es-AR"].footer,
      postalAddress: "Av. Corrientes 1234, Buenos Aires, Argentina",
      unsubscribeLabel: BROADCAST_CHROME["es-AR"].unsubscribeLabel,
    });
    expect(html).toContain('lang="es-AR"');
    expect(html).toContain("<p>Hola comunidad</p>");
    expect(html).toContain("Iglesia de Cristo Redentor");
    expect(html).not.toContain("{{body}}");
    expect(html).not.toContain("{{currentYear}}");
    // CAN-SPAM address must appear
    expect(html).toContain("Av. Corrientes 1234, Buenos Aires, Argentina");
    // Locale unsubscribe label must appear
    expect(html).toContain(BROADCAST_CHROME["es-AR"].unsubscribeLabel);
    // Resend substitutes {{{RESEND_UNSUBSCRIBE_URL}}} per-recipient — the placeholder must survive rendering
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });

  it("renders en-US chrome", () => {
    const html = renderTemplate("broadcast", {
      lang: "en-US",
      body: "<p>Hello church</p>",
      logoAlt: BROADCAST_CHROME["en-US"].logoAlt,
      footer: BROADCAST_CHROME["en-US"].footer,
      postalAddress: "1234 Main St, Buenos Aires, Argentina",
      unsubscribeLabel: BROADCAST_CHROME["en-US"].unsubscribeLabel,
    });
    expect(html).toContain('lang="en-US"');
    expect(html).toContain("<p>Hello church</p>");
    expect(html).toContain("Church of Christ the Redeemer");
    // CAN-SPAM address must appear
    expect(html).toContain("1234 Main St, Buenos Aires, Argentina");
    // Locale unsubscribe label must appear
    expect(html).toContain(BROADCAST_CHROME["en-US"].unsubscribeLabel);
    // Triple-brace placeholder must survive renderTemplate (it's for Resend's per-recipient substitution)
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });
});
