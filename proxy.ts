import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  BETA_EMAIL_COOKIE,
  isBetaTesterEmail,
} from "@/lib/betaAccess";

const ALLOWED_BETA_PATH_PREFIXES = [
  "/decision-layer",
  "/remix",
  "/login",
  "/signup",
  "/callback",
  "/api/decision-layer",
  "/api/decision-layer-audio",
  "/api/decision-layer-video",
  "/api/ai-generate",
  "/api/creator-agent",
  "/api/ai-suggest",
  "/api/ai-reverse",
  "/coming-soon",
];

function decodeJwtEmail(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload?.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

function getSupabaseEmailFromRequest(req: NextRequest): string | null {
  const syncedEmail = req.cookies.get(BETA_EMAIL_COOKIE)?.value;
  if (syncedEmail) {
    return decodeURIComponent(syncedEmail).toLowerCase();
  }

  const directToken =
    req.cookies.get("sb-access-token")?.value ||
    req.cookies.get("supabase-auth-token")?.value;

  if (directToken) {
    const email = decodeJwtEmail(directToken);
    if (email) return email;
  }

  const authCookie = req.cookies
    .getAll()
    .find((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));

  if (!authCookie?.value) return null;

  try {
    const parsed = JSON.parse(authCookie.value);
    const accessToken =
      typeof parsed === "string"
        ? parsed
        : Array.isArray(parsed)
          ? parsed[0]
          : parsed?.access_token;

    if (typeof accessToken !== "string") return null;
    return decodeJwtEmail(accessToken);
  } catch {
    return null;
  }
}

function isAllowedForBeta(pathname: string): boolean {
  return ALLOWED_BETA_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isDecisionLayerPage =
    pathname === "/decision-layer" ||
    pathname.startsWith("/decision-layer/");
  const isDecisionLayerApi =
    pathname === "/api/decision-layer" ||
    pathname.startsWith("/api/decision-layer/");
  const isDecisionLayerRoute = isDecisionLayerPage || isDecisionLayerApi;

  const isAuthPage =
    pathname === "/login" || pathname === "/signup";

  // Get auth token from cookies
  const token =
    req.cookies.get("sb-access-token")?.value ||
    req.cookies.get("supabase-auth-token")?.value;
  const email = getSupabaseEmailFromRequest(req);
  const isGuest = !email && !token;

  // Decision Layer always requires login.
  if (isGuest && isDecisionLayerRoute) {
    if (isDecisionLayerApi) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Non-logged users can access all other routes.
  if (isGuest) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from login/signup pages
  if ((token || email) && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const isBetaTester = isBetaTesterEmail(email);
  const shouldRestrictToBetaMode = isBetaTester;

  // Beta mode can only use Decision Layer + Remix routes; all other tabs/pages go to Coming Soon.
  if (shouldRestrictToBetaMode && !isAllowedForBeta(pathname)) {
    const comingSoonUrl = new URL("/coming-soon", req.url);
    comingSoonUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(comingSoonUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
