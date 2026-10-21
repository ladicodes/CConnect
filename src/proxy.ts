import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps staff sessions fresh and sends signed-out visitors to the login page.
 * This is a convenience only: every admin page, action and API route checks
 * the session and staff role again, and the database enforces roles itself.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
  const isLogin = request.nextUrl.pathname === "/admin/login";
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && !isLogin && request.nextUrl.pathname.startsWith("/admin")) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
