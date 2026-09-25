import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, demoToken } from "@/lib/auth";

// Pages a phone reaches from a QR code are public; they are guarded by one-time codes instead.
function isPublic(req: NextRequest): boolean {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === "/login" || pathname === "/recycle" || pathname.startsWith("/api/recycle/claim")) return true;
  if (pathname === "/play" && searchParams.has("g")) return true;
  if (pathname.startsWith("/game/") || pathname.startsWith("/api/game/join")) return true;
  return false;
}

export async function proxy(req: NextRequest) {
  if (isPublic(req)) return NextResponse.next();
  if (req.cookies.get(AUTH_COOKIE)?.value === (await demoToken())) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Password required" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
