import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Paths reachable WITHOUT a session:
//  - /login            the login page itself
//  - /kiosk            unattended wall-mounted check-in device (runs without login)
//  - /api/auth/*       login/logout/me must work pre-session
// NOTE: other /api/* routes are intentionally NOT redirected in Phase 1
// (per "do not protect individual API routes yet") — only page navigation is guarded.
const PUBLIC_PATHS = ["/login", "/kiosk", "/api/auth", "/join", "/api/public", "/demo-ended"];

function isPublic(path: string): boolean {
  if (path.startsWith("/api")) return true; // don't redirect API calls (Phase 1)
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

// Self-expiring demo gate. Cached ~60s (module scope) so this doesn't add a
// round trip to every single request — a no-op for production, since that
// project has no is_demo row (see erp_api/demo_guard.py for the equivalent
// on the API side; both read the SAME is_demo/demo_expires_at settings but
// can't share a cache across separate processes).
let demoCache: { checkedAt: number; expired: boolean } = { checkedAt: 0, expired: false };
const DEMO_CACHE_TTL_MS = 60_000;

async function isDemoExpired(origin: string): Promise<boolean> {
  const now = Date.now();
  if (now - demoCache.checkedAt < DEMO_CACHE_TTL_MS) return demoCache.expired;
  try {
    const res = await fetch(`${origin}/api/demo/status`, { cache: "no-store" });
    const data = await res.json();
    demoCache = { checkedAt: now, expired: Boolean(data.expired) };
  } catch {
    demoCache = { checkedAt: now, expired: false }; // fail open
  }
  return demoCache.expired;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Block the whole app once the demo window has passed — before anything
  // else, including auth. /demo-ended and /api/* stay reachable so the page
  // itself can render and its own status check keeps working.
  if (path !== "/demo-ended" && !path.startsWith("/api")) {
    if (await isDemoExpired(request.nextUrl.origin)) {
      const url = request.nextUrl.clone();
      url.pathname = "/demo-ended";
      return NextResponse.rewrite(url);
    }
  }

  // Refresh session cookies on every request (official @supabase/ssr pattern).
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated → send to /login (except public paths).
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already signed in and hitting /login → go to dashboard.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
