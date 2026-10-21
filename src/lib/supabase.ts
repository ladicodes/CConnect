import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseKey } from "@/lib/env";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && supabaseKey());
}

/** Supabase client bound to the current request's cookies (staff auth only). */
export async function createSupabaseServerClient() {
  // Request-time only: an auth decision (or a missing-configuration result)
  // must never be baked into a prerendered page or run during a speculative
  // prefetch render, where Next.js aborts network requests.
  await connection();
  const cookieStore = await cookies();
  if (!supabaseConfigured()) return null;
  return createServerClient(process.env.SUPABASE_URL!.trim(), supabaseKey(), {
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
