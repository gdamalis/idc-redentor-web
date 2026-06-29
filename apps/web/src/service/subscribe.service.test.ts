import { afterEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { contacts: { create: createMock } };
  }),
}));
import { addSubscriber } from "./subscribe.service";

afterEach(() => { vi.unstubAllEnvs(); createMock.mockReset(); });

function configure() {
  vi.stubEnv("RESEND_API_KEY", "key");
  vi.stubEnv("RESEND_AUDIENCE_ID_ES_AR", "aud_es");
}

describe("addSubscriber", () => {
  it("adds the contact to the locale audience and returns ok", async () => {
    configure();
    createMock.mockResolvedValue({ data: { id: "c1" }, error: null });
    const out = await addSubscriber("a@b.com", "es-AR");
    expect(out).toEqual({ ok: true });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ audienceId: "aud_es", email: "a@b.com", unsubscribed: false }),
    );
  });
  it("maps a duplicate error to already-subscribed", async () => {
    configure();
    createMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Contact already exists", statusCode: 422 },
    });
    expect(await addSubscriber("a@b.com", "es-AR")).toEqual({ ok: false, reason: "already-subscribed" });
  });
  it("returns not-configured when the audience is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    expect(await addSubscriber("a@b.com", "en-US")).toEqual({ ok: false, reason: "not-configured" });
  });
  it("rejects an invalid email before any Resend call", async () => {
    configure();
    expect(await addSubscriber("nope", "es-AR")).toEqual({ ok: false, reason: "invalid-input" });
    expect(createMock).not.toHaveBeenCalled();
  });
});
