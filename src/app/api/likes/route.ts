import { getLikes, toggleLike } from "@src/service/like.service";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const VISITOR_COOKIE = "_visitor_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year in seconds

function generateVisitorId(): string {
  return crypto.randomUUID();
}

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug");

    if (!slug) {
      return NextResponse.json(
        { error: "slug is required" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const visitorId = cookieStore.get(VISITOR_COOKIE)?.value;

    const result = await getLikes(slug, visitorId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching likes:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { slug } = await request.json();

    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "slug is required" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value;

    const isNewVisitor = !visitorId;
    if (!visitorId) {
      visitorId = generateVisitorId();
    }

    const result = await toggleLike(slug, visitorId);

    const response = NextResponse.json(result);

    if (isNewVisitor) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Error toggling like:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
