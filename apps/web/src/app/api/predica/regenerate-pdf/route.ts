import { NextResponse } from "next/server";
import { z } from "zod";

import { getSermonById } from "@lib/contentful/getSermons";
import { markDirty } from "@src/service/predica/pdfJobs";
import { computeSermonContentHash } from "@src/utils/predica/regenContent";

/**
 * Contentful draft-save/auto_save webhook for `sermon` entries. Marks the
 * corresponding `pdf_jobs` doc dirty and returns fast — it never renders
 * (rendering is the debounced cron, see CP7). Non-sermon payloads (and
 * entries that no longer exist) are no-ops, not errors.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-predica-regen-key");
  if (key !== process.env.PREDICA_REGEN_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const { sys } = parsed.data;
  if (sys.contentType.sys.id !== "sermon") {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  try {
    // No draft cookie on a webhook request — pass `isDraftMode: true` explicitly
    // so both fetches read the DRAFT (unpublished edit that triggered this webhook).
    const [sermonEsAR, sermonEnUS] = await Promise.all([
      getSermonById(sys.id, "es-AR", true),
      getSermonById(sys.id, "en-US", true),
    ]);

    if (!sermonEsAR && !sermonEnUS) {
      return NextResponse.json({ ignored: true, reason: "not-found" }, { status: 200 });
    }

    const contentHash = computeSermonContentHash(sermonEsAR, sermonEnUS);
    const queued = await markDirty(sys.id, contentHash);
    if (!queued) {
      // Enqueue write failed (Mongo down / upsert error) — 5xx so Contentful retries
      // rather than silently dropping the edit.
      return NextResponse.json({ message: "Failed to enqueue regen job" }, { status: 500 });
    }

    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    console.error(
      "[predica/regenerate-pdf] failed to process webhook:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ message: "Failed to process regen webhook" }, { status: 500 });
  }
}

const bodySchema = z.object({
  sys: z.object({
    id: z.string().min(1),
    contentType: z.object({ sys: z.object({ id: z.string() }) }),
  }),
});
