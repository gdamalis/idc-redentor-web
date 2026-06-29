import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAudienceId } from "./resendAudience";

afterEach(() => vi.unstubAllEnvs());

describe("resolveAudienceId", () => {
  it("returns the per-locale audience for es-AR", () => {
    vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "aud_es");
    vi.stubEnv("RESEND_AUDIENCE_ID_EN_US", "aud_en");
    expect(resolveAudienceId("es-AR")).toBe("aud_es");
    expect(resolveAudienceId("en-US")).toBe("aud_en");
  });
  it("falls back to legacy RESEND_AUDIENCE_ID for the default locale only", () => {
    vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "");
    vi.stubEnv("RESEND_AUDIENCE_ID_EN_US", "");
    vi.stubEnv("RESEND_AUDIENCE_ID", "legacy");
    expect(resolveAudienceId("es-AR")).toBe("legacy");
    expect(resolveAudienceId("en-US")).toBeUndefined();
  });
  it("returns undefined when nothing is configured", () => {
    vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "");
    vi.stubEnv("RESEND_AUDIENCE_ID", "");
    expect(resolveAudienceId("es-AR")).toBeUndefined();
  });
});
