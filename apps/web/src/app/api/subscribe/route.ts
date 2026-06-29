import { NextResponse } from "next/server";
import { z } from "zod";
import { addSubscriber } from "@src/service/subscribe.service";
import { BROADCAST_LOCALES, DEFAULT_BROADCAST_LOCALE } from "@src/service/broadcast/types";

const bodySchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(BROADCAST_LOCALES).optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ messageKey: "SubscribeBanner.error-unexpected" }, { status: 400 });
  }
  const locale = parsed.data.locale ?? DEFAULT_BROADCAST_LOCALE;
  const outcome = await addSubscriber(parsed.data.email, locale);
  if (outcome.ok) return NextResponse.json({ success: true }, { status: 200 });
  if (outcome.reason === "already-subscribed") {
    return NextResponse.json(
      { messageKey: "SubscribeBanner.error-already-subscribed" },
      { status: 409 },
    );
  }
  if (outcome.reason === "invalid-input") {
    return NextResponse.json({ messageKey: "SubscribeBanner.error-unexpected" }, { status: 400 });
  }
  return NextResponse.json({ messageKey: "SubscribeBanner.error-unexpected" }, { status: 500 });
}
