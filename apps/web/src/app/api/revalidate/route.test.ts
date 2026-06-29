import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@src/service/post-notification.service", () => ({ notifyOnPublish: vi.fn() }));

import { revalidateTag } from "next/cache";
import { notifyOnPublish } from "@src/service/post-notification.service";
import { POST } from "./route";

const SECRET = "s3cret";

const req = (body: unknown, secret = SECRET) =>
  new Request("http://x/api/revalidate", {
    method: "POST",
    headers: { "x-vercel-reval-key": secret },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("CONTENTFUL_REVALIDATE_SECRET", SECRET);
  vi.mocked(revalidateTag).mockReset();
  vi.mocked(notifyOnPublish).mockReset();
  vi.mocked(notifyOnPublish).mockResolvedValue({
    contentTypeId: "blogPostPage",
    handled: true,
    perLocale: [],
  });
});

describe("POST /api/revalidate", () => {
  it("401 on bad secret, no revalidate, no notify", async () => {
    const res = await POST(req({}, "wrong"));
    expect(res.status).toBe(401);
    expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("revalidates and notifies on a blog publish payload", async () => {
    const res = await POST(
      req({ sys: { id: "e1", contentType: { sys: { id: "blogPostPage" } } } }),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith("site-content", "max");
    expect(vi.mocked(notifyOnPublish)).toHaveBeenCalledWith({
      contentTypeId: "blogPostPage",
      entryId: "e1",
    });
  });

  it("revalidates but does not notify when sys is absent", async () => {
    const res = await POST(req({ hello: "world" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith("site-content", "max");
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("still 200 + revalidates when notify throws", async () => {
    vi.mocked(notifyOnPublish).mockRejectedValue(new Error("boom"));
    const res = await POST(
      req({ sys: { id: "e1", contentType: { sys: { id: "blogPostPage" } } } }),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalled();
  });
});
