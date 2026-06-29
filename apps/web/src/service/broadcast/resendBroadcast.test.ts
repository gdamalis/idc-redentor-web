import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock so these are available inside the factory closure
const { create, send } = vi.hoisted(() => ({
  create: vi.fn(),
  send: vi.fn(),
}));

// Use a regular (non-arrow) function for the constructor mock so `new MockResend()`
// works — vitest 4.x calls the implementation with `new`, which fails for arrow fns.
vi.mock("resend", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Resend: vi.fn(function MockResend(this: any) {
    this.broadcasts = { create, send };
  }),
}));

import {
  BROADCAST_REPLY_TO,
  createAndSendBroadcast,
  isResendBroadcastConfigured,
} from "./resendBroadcast";

const ENV = {
  RESEND_API_KEY: "SECRET_KEY_123",
  RESEND_AUDIENCE_ID: "aud_1",
  FROM_EMAIL: "no-reply@notifications.idcredentor.org",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
  create.mockResolvedValue({ data: { id: "bcast_1" }, error: null });
  send.mockResolvedValue({ data: { id: "bcast_1" }, error: null });
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete (process.env as Record<string, string | undefined>)[k];
});

describe("isResendBroadcastConfigured", () => {
  it("true when key + audience set", () => expect(isResendBroadcastConfigured()).toBe(true));
  it("false when RESEND_AUDIENCE_ID missing", () => {
    delete (process.env as Record<string, string | undefined>).RESEND_AUDIENCE_ID;
    expect(isResendBroadcastConfigured()).toBe(false);
  });
});

describe("createAndSendBroadcast", () => {
  it("creates then sends and returns ok result with broadcast id", async () => {
    const result = await createAndSendBroadcast({ subject: "S", name: "broadcast b1", html: "<p>x</p>", text: "x" });
    expect(result).toEqual({ ok: true, id: "bcast_1" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "aud_1",
        from: expect.stringContaining("no-reply@notifications.idcredentor.org"),
        replyTo: BROADCAST_REPLY_TO,
        subject: "S",
        html: "<p>x</p>",
        text: "x",
        name: "broadcast b1",
      }),
    );
    expect(send).toHaveBeenCalledWith("bcast_1");
  });

  it("returns resend-not-configured and never calls the SDK when unconfigured", async () => {
    delete (process.env as Record<string, string | undefined>).RESEND_AUDIENCE_ID;
    const result = await createAndSendBroadcast({ subject: "S", name: "n", html: "h", text: "t" });
    expect(result).toEqual({ ok: false, reason: "resend-not-configured" });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns send-failed and skips send when create returns an error", async () => {
    create.mockResolvedValueOnce({ data: null, error: { message: "bad", name: "validation_error" } });
    const result = await createAndSendBroadcast({ subject: "S", name: "n", html: "h", text: "t" });
    expect(result).toMatchObject({ ok: false, reason: "send-failed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns send-failed when send returns an error", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "nope", name: "application_error" } });
    const result = await createAndSendBroadcast({ subject: "S", name: "n", html: "h", text: "t" });
    expect(result).toMatchObject({ ok: false, reason: "send-failed" });
  });
});
