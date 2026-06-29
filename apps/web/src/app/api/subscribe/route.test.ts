import { describe, expect, it, vi, beforeEach } from "vitest";

const addSubscriber = vi.hoisted(() => vi.fn());
vi.mock("@src/service/subscribe.service", () => ({ addSubscriber }));
import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://x/api/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => addSubscriber.mockReset());

describe("POST /api/subscribe", () => {
  it("200 on success and forwards locale", async () => {
    addSubscriber.mockResolvedValue({ ok: true });
    const res = await POST(req({ email: "a@b.com", locale: "en-US" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(addSubscriber).toHaveBeenCalledWith("a@b.com", "en-US");
  });
  it("defaults locale to es-AR when omitted", async () => {
    addSubscriber.mockResolvedValue({ ok: true });
    await POST(req({ email: "a@b.com" }));
    expect(addSubscriber).toHaveBeenCalledWith("a@b.com", "es-AR");
  });
  it("409 already-subscribed", async () => {
    addSubscriber.mockResolvedValue({ ok: false, reason: "already-subscribed" });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ messageKey: "SubscribeBanner.error-already-subscribed" });
  });
  it("400 on invalid email (zod) without calling the service", async () => {
    const res = await POST(req({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(addSubscriber).not.toHaveBeenCalled();
  });
});
