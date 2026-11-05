import { NextResponse } from "next/server"

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Belt-and-suspenders: never touch Next internals (avoids 404 on layout.css, main-app.js, RSC, HMR).
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  // Marketplace default: bare `/` → `/resorts`. Keep `/?o=ownerUid` for a resort’s booking site (app/page.jsx).
  if (pathname === "/") {
    const owner = request.nextUrl.searchParams.get("o")?.trim()
    if (owner) {
      return NextResponse.next()
    }
    const url = request.nextUrl.clone()
    url.pathname = "/resorts"
    return NextResponse.redirect(url)
  }

  // Single-resort booking landing at `/resort` → internal `app/page.jsx` (`/`).
  if (pathname === "/resort") {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

/**
 * Do not run middleware on `/_next/*`, `/api/*`, or common static files — otherwise dev CSS/JS chunks 404.
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
 */
export const config = {
  matcher: [
    "/",
    "/resort",
    "/((?!api|_next|favicon\\.ico|icon\\.svg|apple-icon\\.png).*)",
  ],
}
