import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlogPost } from "@src/types/BlogPost";
import type { Sermon } from "@src/types/Sermon";

vi.mock("@lib/contentful/getBlogPostPages", () => ({ getBlogPostPageById: vi.fn() }));
vi.mock("@lib/contentful/getSermons", () => ({ getSermonById: vi.fn() }));
vi.mock("@src/service/broadcast.service", () => ({ sendBroadcast: vi.fn() }));
vi.mock("@src/service/broadcast/resendBroadcast", () => ({ isResendBroadcastConfigured: vi.fn() }));

import { getBlogPostPageById } from "@lib/contentful/getBlogPostPages";
import { getSermonById } from "@lib/contentful/getSermons";
import { sendBroadcast } from "@src/service/broadcast.service";
import { isResendBroadcastConfigured } from "@src/service/broadcast/resendBroadcast";
import { notifyOnPublish } from "./post-notification.service";

afterEach(() => vi.clearAllMocks());

/** Minimal blog post fixture — only fields the orchestrator reads */
const blog = (overrides: Partial<BlogPost> = {}): BlogPost =>
  ({ title: "Hola", slug: "hola", subtitle: "s", ...overrides }) as unknown as BlogPost;

/** Minimal sermon fixture — only fields the orchestrator reads */
const sermon = (overrides: Partial<Sermon> = {}): Sermon =>
  ({ title: "S", slug: "s", excerpt: "e", ...overrides }) as unknown as Sermon;

describe("notifyOnPublish", () => {
  it("ignores unsupported content types (no send)", async () => {
    const out = await notifyOnPublish({ contentTypeId: "page", entryId: "e1" });
    expect(out.handled).toBe(false);
    expect(sendBroadcast).not.toHaveBeenCalled();
  });

  it("sends one broadcast per configured locale with content, using kind:entryId:locale", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById).mockImplementation(async (_id, locale) =>
      blog({ title: locale === "es-AR" ? "Hola" : "Hello" }),
    );
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({ contentTypeId: "blogPostPage", entryId: "e1" });
    expect(sendBroadcast).toHaveBeenCalledTimes(2);
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: "blog:e1:es-AR", locale: "es-AR" }),
    );
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: "blog:e1:en-US", locale: "en-US" }),
    );
    expect(out.handled).toBe(true);
  });

  it("skips a locale with no content", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById).mockImplementation(async (_id, locale) =>
      locale === "es-AR" ? blog() : undefined,
    );
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({ contentTypeId: "blogPostPage", entryId: "e1" });
    expect(sendBroadcast).toHaveBeenCalledTimes(1);
    expect(out.perLocale.find((p) => p.locale === "en-US")?.status).toBe("no-content");
  });

  it("skips a locale whose audience is not configured", async () => {
    vi.mocked(isResendBroadcastConfigured).mockImplementation((l: string) => l === "es-AR");
    vi.mocked(getBlogPostPageById).mockResolvedValue(blog());
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    await notifyOnPublish({ contentTypeId: "blogPostPage", entryId: "e1" });
    expect(sendBroadcast).toHaveBeenCalledTimes(1);
  });

  it("isolates a getter failure to that locale (never throws)", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(blog({ title: "Hello" }));
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({ contentTypeId: "blogPostPage", entryId: "e1" });
    expect(out.perLocale.some((p) => p.status === "failed")).toBe(true);
  });

  it("uses the sermon getter + sermon:entryId:locale id", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getSermonById).mockResolvedValue(sermon());
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    await notifyOnPublish({ contentTypeId: "sermon", entryId: "e1" });
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: "sermon:e1:es-AR" }),
    );
  });
});
