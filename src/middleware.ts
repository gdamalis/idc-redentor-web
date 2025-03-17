import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export function middleware(request: NextRequest) {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200 });
  }

  // Extract file extension if present
  const pathname = request.nextUrl.pathname;
  const fileExtension = pathname.split(".").pop()?.toLowerCase();

  // Common safe assets to bypass middleware
  const safeExtensions = [
    "ico",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "webp",
    "css",
    "js",
    "json",
    "xml",
    "woff",
    "woff2",
    "ttf",
    "eot",
  ];

  // Skip middleware for safe asset extensions
  if (fileExtension && safeExtensions.includes(fileExtension)) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!_next|_vercel|api|trpc).*)",
  ],
};
