"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asStaff, type Tx } from "@/lib/db";
import { getStaff, staffForUser, type Staff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase";
import { errorKind, logEvent, sqlState } from "@/lib/log";
import { searchLinkableQuestions } from "@/lib/admin-data";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const ids = z.array(z.uuid()).min(1).max(200);

/**
 * Every admin action re-checks the session and role here, then runs as the
 * staff database role, where row level security applies again.
 */
async function run(
  name: string,
  work: (tx: Tx, staff: Staff) => Promise<number | void>,
  options: { adminOnly?: boolean; success?: string } = {},
): Promise<ActionResult> {
  const lookup = await getStaff();
  if (lookup.status !== "staff") {
    return { ok: false, error: "Your sign-in has expired. Please refresh the page and sign in again." };
  }
  const staff = lookup.staff;
  if (options.adminOnly && staff.role !== "admin") {
    return { ok: false, error: "Only administrators can do that." };
  }
  try {
    const changed = await asStaff(staff.userId, (tx) => work(tx, staff));
    if (changed === 0) {
      return { ok: false, error: "Nothing was changed. The item may have been updated or removed by someone else." };
    }
    refresh();
    return { ok: true, message: options.success };
  } catch (error) {
    const state = sqlState(error);
    logEvent("warn", "ADMIN_ACTION_FAILED", { action: name, error: errorKind(error) });
    if (state === "42501") return { ok: false, error: "You don't have permission to do that." };
    if (state === "23514") {
      return name.startsWith("testimony")
        ? { ok: false, error: "This can't be published because the person didn't give permission to share it." }
        : { ok: false, error: "That change isn't allowed." };
    }
    if (state === "CA409") return { ok: false, error: "Only questions on the public board can be shown on screen. Approve it first." };
    if (state === "CA404") return { ok: false, error: "That item is no longer available." };
    if (state === "23505") return { ok: false, error: "Someone else changed this at the same moment. Please try again." };
    return { ok: false, error: "That didn't save. Please try again." };
  }
}

function invalid(): ActionResult {
  return { ok: false, error: "That request wasn't valid. Please refresh and try again." };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
const visibilityInput = z.object({ ids, visibility: z.enum(["pending", "public", "private", "hidden"]) });

export async function setQuestionVisibility(input: z.input<typeof visibilityInput>): Promise<ActionResult> {
  const parsed = visibilityInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, visibility } = parsed.data;
  const labels = { pending: "Moved back to review", public: "Approved for the board", private: "Kept private", hidden: "Hidden from the board" };
  return run(
    "question.visibility",
    async (tx) => {
      const rows = await tx`update app.questions set visibility = ${visibility} where id = any(${tx.array(list)}::uuid[]) returning id`;
      return rows.length;
    },
    { success: list.length > 1 ? `${labels[visibility]} (${list.length})` : labels[visibility] },
  );
}

const answerInput = z.object({ ids, answer: z.enum(["open", "addressing", "answered"]) });

export async function setQuestionAnswer(input: z.input<typeof answerInput>): Promise<ActionResult> {
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, answer } = parsed.data;
  const labels = { open: "Reopened", addressing: "Marked as being addressed", answered: "Marked as answered" };
  return run(
    "question.answer",
    async (tx) => {
      const rows = await tx`update app.questions set answer_status = ${answer} where id = any(${tx.array(list)}::uuid[]) returning id`;
      return rows.length;
    },
    { success: labels[answer] },
  );
}

const archiveInput = z.object({ ids, archived: z.boolean() });

export async function archiveQuestions(input: z.input<typeof archiveInput>): Promise<ActionResult> {
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, archived } = parsed.data;
  return run(
    "question.archive",
    async (tx) => {
      const rows = await tx`
        update app.questions set archived_at = ${archived ? tx`now()` : null}
        where id = any(${tx.array(list)}::uuid[]) returning id`;
      return rows.length;
    },
    { success: archived ? "Archived" : "Restored from archive" },
  );
}

const deleteInput = z.object({ ids });

export async function deleteQuestions(input: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return invalid();
  const list = parsed.data.ids;
  return run(
    "question.delete",
    async (tx) => (await tx`delete from app.questions where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { success: list.length > 1 ? `Deleted ${list.length} questions` : "Question deleted" },
  );
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const contextStatusInput = z.object({ ids, status: z.enum(["pending", "approved", "rejected", "hidden"]) });

export async function setContextStatus(input: z.input<typeof contextStatusInput>): Promise<ActionResult> {
  const parsed = contextStatusInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, status } = parsed.data;
  const labels = { pending: "Moved back to review", approved: "Approved", rejected: "Rejected", hidden: "Hidden" };
  return run(
    "context.status",
    async (tx) => (await tx`update app.context_notes set status = ${status} where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { success: labels[status] },
  );
}

const linkInput = z.object({ id: z.uuid(), questionId: z.uuid().nullable() });

export async function linkContext(input: z.input<typeof linkInput>): Promise<ActionResult> {
  const parsed = linkInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { id, questionId } = parsed.data;
  return run(
    "context.link",
    async (tx) => (await tx`update app.context_notes set question_id = ${questionId} where id = ${id} returning id`).length,
    { success: questionId ? "Linked to the question" : "Unlinked from the question" },
  );
}

export async function deleteContext(input: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return invalid();
  const list = parsed.data.ids;
  return run(
    "context.delete",
    async (tx) => (await tx`delete from app.context_notes where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { success: list.length > 1 ? `Deleted ${list.length} notes` : "Note deleted" },
  );
}

export async function findQuestionsToLink(search: string) {
  const lookup = await getStaff();
  if (lookup.status !== "staff") return [];
  const term = typeof search === "string" ? search.trim().slice(0, 100) : "";
  try {
    const rows = await searchLinkableQuestions(lookup.staff, term);
    return rows.map((row) => ({ id: row.id, body: row.body, visibility: row.visibility, sessionTitle: row.session_title }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Prayer requests (admins only)
// ---------------------------------------------------------------------------
const prayerStatusInput = z.object({ ids, status: z.enum(["new", "prayed", "addressed"]) });

export async function setPrayerStatus(input: z.input<typeof prayerStatusInput>): Promise<ActionResult> {
  const parsed = prayerStatusInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, status } = parsed.data;
  const labels = { new: "Marked as new", prayed: "Marked as prayed for", addressed: "Marked as addressed" };
  return run(
    "prayer.status",
    async (tx) => (await tx`update app.prayer_requests set status = ${status} where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { adminOnly: true, success: labels[status] },
  );
}

export async function archivePrayers(input: z.input<typeof archiveInput>): Promise<ActionResult> {
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, archived } = parsed.data;
  return run(
    "prayer.archive",
    async (tx) =>
      (
        await tx`update app.prayer_requests set archived_at = ${archived ? tx`now()` : null}
                 where id = any(${tx.array(list)}::uuid[]) returning id`
      ).length,
    { adminOnly: true, success: archived ? "Archived" : "Restored" },
  );
}

export async function deletePrayers(input: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return invalid();
  const list = parsed.data.ids;
  return run(
    "prayer.delete",
    async (tx) => (await tx`delete from app.prayer_requests where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { adminOnly: true, success: list.length > 1 ? `Deleted ${list.length} requests` : "Request deleted" },
  );
}

// ---------------------------------------------------------------------------
// Testimonies (admins only)
// ---------------------------------------------------------------------------
const testimonyStatusInput = z.object({ ids, status: z.enum(["pending", "published", "private", "rejected"]) });

export async function setTestimonyStatus(input: z.input<typeof testimonyStatusInput>): Promise<ActionResult> {
  const parsed = testimonyStatusInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, status } = parsed.data;
  const labels = { pending: "Moved back to review", published: "Published", private: "Kept private", rejected: "Rejected" };
  return run(
    "testimony.status",
    async (tx) => (await tx`update app.testimonies set status = ${status} where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { adminOnly: true, success: labels[status] },
  );
}

export async function archiveTestimonies(input: z.input<typeof archiveInput>): Promise<ActionResult> {
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return invalid();
  const { ids: list, archived } = parsed.data;
  return run(
    "testimony.archive",
    async (tx) =>
      (
        await tx`update app.testimonies set archived_at = ${archived ? tx`now()` : null}
                 where id = any(${tx.array(list)}::uuid[]) returning id`
      ).length,
    { adminOnly: true, success: archived ? "Archived" : "Restored" },
  );
}

export async function deleteTestimonies(input: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return invalid();
  const list = parsed.data.ids;
  return run(
    "testimony.delete",
    async (tx) => (await tx`delete from app.testimonies where id = any(${tx.array(list)}::uuid[]) returning id`).length,
    { adminOnly: true, success: list.length > 1 ? `Deleted ${list.length} messages` : "Deleted" },
  );
}

// ---------------------------------------------------------------------------
// Service sessions
// ---------------------------------------------------------------------------
const sessionInput = z.object({
  title: z.string().trim().min(2, "Please give the service a name.").max(80, "Please keep the name under 80 characters."),
  kind: z.enum(["sunday", "midweek", "youth", "special", "other"]),
  serviceDate: z.iso.date({ error: "Please choose a date." }),
  activate: z.boolean(),
});

export async function createSession(input: z.input<typeof sessionInput>): Promise<ActionResult> {
  const parsed = sessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the details." };
  const { title, kind, serviceDate, activate } = parsed.data;
  return run(
    "session.create",
    async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into app.service_sessions (title, kind, service_date) values (${title}, ${kind}, ${serviceDate}) returning id`;
      if (activate && row) await tx`select app.activate_session(${row.id})`;
    },
    { success: activate ? "Service created and now live" : "Service created" },
  );
}

const sessionId = z.object({ id: z.uuid() });

export async function activateSession(input: z.input<typeof sessionId>): Promise<ActionResult> {
  const parsed = sessionId.safeParse(input);
  if (!parsed.success) return invalid();
  return run("session.activate", async (tx) => void (await tx`select app.activate_session(${parsed.data.id})`), {
    success: "Service is now live",
  });
}

export async function closeSession(input: z.input<typeof sessionId>): Promise<ActionResult> {
  const parsed = sessionId.safeParse(input);
  if (!parsed.success) return invalid();
  return run("session.close", async (tx) => void (await tx`select app.close_session(${parsed.data.id})`), {
    success: "Service closed",
  });
}

const sessionArchive = z.object({ id: z.uuid(), archived: z.boolean() });

export async function archiveSession(input: z.input<typeof sessionArchive>): Promise<ActionResult> {
  const parsed = sessionArchive.safeParse(input);
  if (!parsed.success) return invalid();
  return run(
    "session.archive",
    async (tx) => void (await tx`select app.archive_session(${parsed.data.id}, ${parsed.data.archived})`),
    { success: parsed.data.archived ? "Service archived" : "Service restored" },
  );
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------
const presentInput = z.object({ id: z.uuid(), showContext: z.boolean() });

export async function presentQuestion(input: z.input<typeof presentInput>): Promise<ActionResult> {
  const parsed = presentInput.safeParse(input);
  if (!parsed.success) return invalid();
  return run(
    "presentation.question",
    async (tx) => void (await tx`select app.present_question(${parsed.data.id}, ${parsed.data.showContext})`),
    { success: "Now on screen" },
  );
}

const modeInput = z.object({ mode: z.enum(["qr", "blank"]) });

export async function presentMode(input: z.input<typeof modeInput>): Promise<ActionResult> {
  const parsed = modeInput.safeParse(input);
  if (!parsed.success) return invalid();
  return run("presentation.mode", async (tx) => void (await tx`select app.present_mode(${parsed.data.mode})`), {
    success: parsed.data.mode === "qr" ? "Screen shows the QR code" : "Screen cleared",
  });
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------
const signInInput = z.object({
  email: z.email({ error: "Please enter your email address." }).max(200),
  password: z.string().min(1, "Please enter your password.").max(200),
});

export type SignInState = { error?: string; email?: string };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = signInInput.safeParse({ email, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    logEvent("error", "AUTH_NOT_CONFIGURED");
    return { error: "Sign-in isn't configured yet. Please contact whoever set up Connect-Ask.", email };
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    logEvent("info", "AUTH_SIGN_IN_FAILED", { reason: error?.code ?? "unknown" });
    return { error: "That email and password don't match an account.", email };
  }

  let staff: Staff | null = null;
  try {
    staff = await staffForUser(data.user.id);
  } catch (cause) {
    logEvent("error", "AUTH_STAFF_LOOKUP_FAILED", { error: errorKind(cause) });
    await supabase.auth.signOut();
    return { error: "We couldn't check your access just now. Please try again.", email };
  }
  if (!staff) {
    await supabase.auth.signOut();
    logEvent("warn", "AUTH_NOT_STAFF");
    return { error: "This account doesn't have access to Connect-Ask admin. Ask an administrator to add you.", email };
  }
  logEvent("info", "AUTH_SIGNED_IN", { role: staff.role });
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/admin/login");
}
