import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { authService } from "@/lib/env";
import { logEvent } from "@/lib/log";

/** Supabase client bound to the current request's cookies (staff auth only). */
export async function createSupabaseServerClient() {
  // Request-time only: an auth decision (or a missing-configuration result)
  // must never be baked into a prerendered page or run during a speculative
  // prefetch render, where Next.js aborts network requests.
  await connection();
  const cookieStore = await cookies();
  const service = authService();
  if (!service.ok) {
    logEvent("error", "AUTH_SERVICE_REFUSED", { problem: service.problem });
    return null;
  }
  return createServerClient(service.url, service.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}
