import { getStaff } from "@/lib/auth";
import { getPresentation } from "@/lib/admin-data";
import { errorKind, logEvent } from "@/lib/log";

/** What the projector should show right now (staff only, polled by the display). */
export async function GET() {
  const lookup = await getStaff();
  if (lookup.status !== "staff") {
    return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const presentation = await getPresentation(lookup.staff);
    return Response.json({ ok: true, presentation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logEvent("error", "PRESENTATION_READ_FAILED", { error: errorKind(error) });
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
