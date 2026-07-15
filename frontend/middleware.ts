import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Paths reachable WITHOUT a session:
//  - /login            the login page itself
//  - /kiosk            unattended wall-mounted check-in device (runs without login)
//  - /api/auth/*       login/logout/me must work pre-session
// NOTE: other /api/* routes are intentionally NOT redirected in Phase 1
// (per "do not protect individual API routes yet") — only page navigation is guarded.
const PUBLIC_PATHS = ["/login", "/kiosk", "/api/auth", "/join", "/api/public"];

function isPublic(path: string): boolean {
  if (path.startsWith("/api")) return true; // don't redirect API calls (Phase 1)
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
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
  const path = request.nextUrl.pathname;

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
