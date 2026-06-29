import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./broadcast/broadcastLog", () => ({
  claimBroadcast: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
}));
vi.mock("./broadcast/resendBroadcast", () => ({
  createAndSendBroadcast: vi.fn(),
  isResendBroadcastConfigured: vi.fn(),
}));

import { sendBroadcast } from "./broadcast.service";
import { claimBroadcast, markFailed, markSent } from "./broadcast/broadcastLog";
import { isResendBroadcastConfigured, createAndSendBroadcast } from "./broadcast/resendBroadcast";

const input = {
  broadcastId: "blog:hola:es-AR",
  subject: "Nuevo post",
  html: "<p>cuerpo</p>",
  text: "cuerpo",
  locale: "es-AR" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://www.idcredentor.org";
  process.env.RESEND_API_KEY = "SECRET_KEY_123";
  process.env.BROADCAST_POSTAL_ADDRESS = "Calle Falsa 123, Buenos Aires, Argentina";
  vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
  vi.mocked(claimBroadcast).mockResolvedValue("claimed");
  vi.mocked(createAndSendBroadcast).mockResolvedValue({ ok: true, id: "camp_1" });
});

describe("sendBroadcast", () => {
  it("sends and marks sent on the happy path", async () => {
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "sent", campaignId: "camp_1" });
    expect(createAndSendBroadcast).toHaveBeenCalledOnce();
    expect(markSent).toHaveBeenCalledWith("blog:hola:es-AR", "camp_1");
  });

  it("skips without sending when already sent", async () => {
    vi.mocked(claimBroadcast).mockResolvedValue("already-sent");
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "skipped", reason: "already-sent" });
    expect(createAndSendBroadcast).not.toHaveBeenCalled();
  });

  it("fails safe (no send) when the dedupe store is unavailable", async () => {
    vi.mocked(claimBroadcast).mockResolvedValue("error");
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "dedupe-unavailable" });
    expect(createAndSendBroadcast).not.toHaveBeenCalled();
  });

  it("marks failed and returns failed when the transport returns a failure result", async () => {
    vi.mocked(createAndSendBroadcast).mockResolvedValue({
      ok: false,
      reason: "send-failed",
      message: "api down",
    });
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "send-failed" });
    expect(markFailed).toHaveBeenCalledWith("blog:hola:es-AR", "send-failed");
  });

  it("marks failed and returns failed when the transport throws unexpectedly", async () => {
    vi.mocked(createAndSendBroadcast).mockRejectedValueOnce(new Error("boom"));
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "send-failed" });
    expect(markFailed).toHaveBeenCalledWith("blog:hola:es-AR", "send-failed");
  });

  it("rejects invalid input without claiming or sending", async () => {
    const result = await sendBroadcast({ ...input, subject: "" });
    expect(result).toEqual({ status: "failed", reason: "invalid-input" });
    expect(claimBroadcast).not.toHaveBeenCalled();
    expect(createAndSendBroadcast).not.toHaveBeenCalled();
  });

  it("returns resend-not-configured without claiming", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(false);
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "resend-not-configured" });
    expect(claimBroadcast).not.toHaveBeenCalled();
  });

  it("returns postal-address-missing without claiming or sending when BROADCAST_POSTAL_ADDRESS is unset", async () => {
    delete (process.env as Record<string, string | undefined>).BROADCAST_POSTAL_ADDRESS;
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "postal-address-missing" });
    expect(claimBroadcast).not.toHaveBeenCalled();
    expect(createAndSendBroadcast).not.toHaveBeenCalled();
  });

  it("never leaks the API key to the console", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(createAndSendBroadcast).mockResolvedValueOnce({
      ok: false,
      reason: "send-failed",
      message: "api down",
    });
    await sendBroadcast(input);
    const all = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String).join(" ");
    expect(all).not.toContain("SECRET_KEY_123");
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
