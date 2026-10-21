import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asStaff } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase";
import { errorKind, logEvent } from "@/lib/log";

export type StaffRole = "admin" | "moderator";

export type Staff = {
  userId: string;
  email: string;
  displayName: string | null;
  role: StaffRole;
};

export type StaffLookup =
  | { status: "signed-out" }
  | { status: "not-staff" }
  | { status: "unavailable" }
  | { status: "staff"; staff: Staff };

/** Looks up a verified Supabase user in the staff table. */
export async function staffForUser(userId: string): Promise<Staff | null> {
  const rows = await asStaff(
    userId,
    (tx) => tx<{ user_id: string; email: string; display_name: string | null; role: StaffRole }[]>`
      select user_id, email, display_name, role from app.whoami()
    `,
  );
  const row = rows[0];
  return row ? { userId: row.user_id, email: row.email, displayName: row.display_name, role: row.role } : null;
}

/**
 * The signed-in staff member for this request. `getUser()` validates the
 * session with Supabase Auth rather than trusting the cookie's contents.
 */
export const getStaff = cache(async (): Promise<StaffLookup> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    logEvent("error", "AUTH_NOT_CONFIGURED");
    return { status: "unavailable" };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    if (error && error.status !== 400 && error.status !== 401 && error.name !== "AuthSessionMissingError") {
      logEvent("warn", "AUTH_GET_USER_FAILED", { status: error.status ?? null, code: error.code ?? null, name: error.name });
    }
    return { status: "signed-out" };
  }
  try {
    const staff = await staffForUser(data.user.id);
    return staff ? { status: "staff", staff } : { status: "not-staff" };
  } catch (cause) {
    logEvent("error", "STAFF_LOOKUP_FAILED", { error: errorKind(cause) });
    return { status: "unavailable" };
  }
});

export async function requireStaff(): Promise<Staff> {
  const lookup = await getStaff();
  if (lookup.status === "staff") return lookup.staff;
  if (lookup.status === "not-staff") redirect("/admin/login?error=not-authorised");
  if (lookup.status === "unavailable") redirect("/admin/login?error=unavailable");
  redirect("/admin/login");
}

export function isAdmin(staff: Staff): boolean {
  return staff.role === "admin";
}

export function staffLabel(staff: Staff): string {
  return staff.displayName || staff.email;
}
