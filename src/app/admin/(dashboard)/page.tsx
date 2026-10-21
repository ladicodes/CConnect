import Link from "next/link";
import { requestTime } from "@/lib/request-time";
import { Suspense } from "react";
import { requireStaff, staffLabel } from "@/lib/auth";
import { getOverview, type Overview } from "@/lib/admin-data";
import { appTimezone, configChecks, deploymentStage } from "@/lib/env";
import { formatServiceDate, timeAgo } from "@/lib/format";
import { AdminHeader, PageSkeleton } from "@/components/admin/page-parts";
import { AlertIcon, ChevronRight, QrIcon, ScreenIcon } from "@/components/icons";
import { LiveDot } from "@/components/status";

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewContent />
    </Suspense>
  );
}

async function OverviewContent() {
  const staff = await requireStaff();
  const overview = await getOverview(staff);
  const problems = configChecks().filter((check) => !check.ok || check.problem);
  const now = requestTime();
  const zone = appTimezone();

  return (
    <>
      <AdminHeader title="Overview" description={`Signed in as ${staffLabel(staff)}. Here's what needs attention.`} />

      <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {problems.length > 0 && <ConfigPanel problems={problems} stage={deploymentStage()} isAdmin={staff.role === "admin"} />}

        <section aria-labelledby="attention">
          <h2 id="attention" className="eyebrow">
            Needs review
          </h2>
          <ul className="mt-3 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            <Tile href="/admin/questions" label="Questions to review" value={overview.questions.review} tick="var(--color-navy)" />
            <Tile href="/admin/context" label="Context to review" value={overview.context.review} tick="var(--color-cyan)" />
            {overview.prayers && (
              <Tile href="/admin/prayers" label="New prayer requests" value={overview.prayers.new} tick="var(--color-green)" />
            )}
            {overview.testimonies && (
              <Tile
                href="/admin/testimonies"
                label="Testimonies to review"
                value={overview.testimonies.review}
                tick="var(--color-yellow)"
                note={
                  overview.testimonies.review > 0
                    ? `${overview.testimonies.consentToShare} with permission to share`
                    : undefined
                }
              />
            )}
          </ul>
        </section>

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-10">
            <LivePanel session={overview.activeSession} />

            <section aria-labelledby="board">
              <h2 id="board" className="eyebrow">
                Question Board
              </h2>
              <ul className="mt-3 grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
                <Figure label="On the board" value={overview.questions.public} href="/admin/questions?tab=public" />
                <Figure
                  label="Not yet answered"
                  value={overview.questions.unanswered}
                  href="/admin/questions?tab=public&answer=unanswered"
                />
                <Figure label="Kept private" value={overview.questions.private} href="/admin/questions?tab=private" />
              </ul>
            </section>
          </div>

          <section aria-labelledby="activity">
            <h2 id="activity" className="eyebrow">
              Recent activity
            </h2>
            {overview.activity.length === 0 ? (
              <p className="mt-3 text-[0.9375rem] text-ink-2">Nothing yet. New submissions and moderation will appear here.</p>
            ) : (
              <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
                {overview.activity.map((item, index) => (
                  <li key={`${item.entityId}-${item.createdAt}-${index}`} className="flex items-start gap-3 px-4 py-3 text-[0.9375rem]">
                    <span className="tick mt-2" style={{ ["--tick" as string]: ENTITY_COLOUR[item.entity] ?? "var(--color-navy)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{describe(item)}</span>
                      <span className="block text-[0.8125rem] text-muted">
                        {item.actor ? `${item.actor} · ` : ""}
                        {timeAgo(item.createdAt, now, zone)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

const ENTITY_COLOUR: Record<string, string> = {
  question: "var(--color-navy)",
  context: "var(--color-cyan)",
  prayer: "var(--color-green)",
  testimony: "var(--color-yellow)",
  session: "var(--color-red)",
  presentation: "var(--color-magenta)",
};

const NOUN: Record<string, string> = {
  question: "Question",
  context: "Context note",
  prayer: "Prayer request",
  testimony: "Testimony",
  session: "Service",
  presentation: "Screen",
};

function describe(item: Overview["activity"][number]): string {
  const noun = NOUN[item.entity] ?? "Item";
  const [verb, value] = item.action.split(":");
  if (verb === "received") return `New ${noun.toLowerCase()} received`;
  if (verb === "deleted") return `${noun} deleted`;
  if (verb === "archived") return `${noun} archived`;
  if (verb === "restored") return `${noun} restored`;
  if (verb === "linked") return "Context linked to a question";
  if (verb === "unlinked") return "Context unlinked from a question";
  if (verb === "activated") return "Service went live";
  if (verb === "closed") return "Service closed";
  if (verb === "presented") return "Question shown on screen";
  if (verb === "mode") return value === "qr" ? "Screen switched to QR code" : "Screen cleared";
  if (verb === "visibility") {
    const map: Record<string, string> = {
      public: "approved for the board",
      private: "kept private",
      hidden: "hidden from the board",
      pending: "moved back to review",
    };
    return `${noun} ${map[value] ?? "updated"}`;
  }
  if (verb === "answer") {
    const map: Record<string, string> = { answered: "marked answered", addressing: "marked being addressed", open: "reopened" };
    return `${noun} ${map[value] ?? "updated"}`;
  }
  if (verb === "status") {
    const map: Record<string, string> = {
      approved: "approved",
      rejected: "rejected",
      hidden: "hidden",
      pending: "moved back to review",
      prayed: "marked prayed for",
      addressed: "marked addressed",
      new: "marked new",
      published: "published",
      private: "kept private",
    };
    return `${noun} ${map[value] ?? "updated"}`;
  }
  return `${noun} updated`;
}

function Tile({ href, label, value, tick, note }: { href: string; label: string; value: number; tick: string; note?: string }) {
  return (
    <li className="bg-surface">
      <Link href={href} className="group flex h-full flex-col gap-3 p-5 transition-colors hover:bg-paper">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <span className="tick" style={{ ["--tick" as string]: tick }} />
          {label}
        </span>
        <span className="flex items-end justify-between gap-2">
          <span className={`text-[2.5rem] font-semibold leading-none ${value > 0 ? "text-ink" : "text-muted"}`}>
            {value.toLocaleString("en")}
          </span>
          <ChevronRight size={18} className="mb-1 text-muted transition-transform group-hover:translate-x-0.5" />
        </span>
        {note && <span className="text-[0.8125rem] text-muted">{note}</span>}
      </Link>
    </li>
  );
}

function Figure({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li>
      <Link href={href} className="block h-full px-4 py-4 transition-colors hover:bg-paper sm:px-5">
        <span className="block text-[0.8125rem] font-semibold text-muted">{label}</span>
        <span className="mt-1 block text-[1.75rem] font-semibold leading-tight text-ink">{value.toLocaleString("en")}</span>
      </Link>
    </li>
  );
}

function LivePanel({ session }: { session: Overview["activeSession"] }) {
  return (
    <section aria-labelledby="live" className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
        <div>
          <h2 id="live" className="eyebrow">
            Live service
          </h2>
          {session ? (
            <p className="mt-2 flex items-center gap-2.5 font-display text-[1.375rem] font-semibold">
              <LiveDot />
              {session.title} · {formatServiceDate(session.serviceDate)}
            </p>
          ) : (
            <p className="mt-2 font-display text-[1.375rem] font-semibold text-ink-2">No service is live</p>
          )}
          <p className="mt-1 text-[0.9375rem] text-ink-2">
            {session
              ? `${session.questions} ${session.questions === 1 ? "question" : "questions"} so far, ${session.pending} waiting for review.`
              : "Questions still arrive and are kept as general questions. Start a service to group them."}
          </p>
        </div>
        <Link href="/admin/sessions" className="btn btn-secondary btn-sm">
          {session ? "Manage services" : "Start a service"}
        </Link>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-2">
        <Link href="/admin/live" className="flex items-center gap-3 bg-surface p-4 text-[0.9375rem] font-semibold hover:bg-paper">
          <ScreenIcon size={20} className="text-magenta-text" />
          Run Live Q&amp;A
          <ChevronRight size={16} className="ml-auto text-muted" />
        </Link>
        <Link href="/admin/qr" className="flex items-center gap-3 bg-surface p-4 text-[0.9375rem] font-semibold hover:bg-paper">
          <QrIcon size={20} className="text-navy" />
          Show the QR code
          <ChevronRight size={16} className="ml-auto text-muted" />
        </Link>
      </div>
    </section>
  );
}

function ConfigPanel({
  problems,
  stage,
  isAdmin,
}: {
  problems: { name: string; ok: boolean; problem?: string }[];
  stage: string;
  isAdmin: boolean;
}) {
  const failing = problems.some((p) => !p.ok);
  return (
    <section className={`alert ${failing ? "alert-error" : "alert-warn"}`} aria-labelledby="config">
      <AlertIcon />
      <div>
        <h2 id="config" className="font-sans text-[0.9375rem] font-semibold">
          {failing ? "Configuration needs attention" : "Configuration notes"} ({stage})
        </h2>
        {isAdmin ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p.name}>
                <code className="font-semibold">{p.name}</code>: {p.problem ?? "Problem"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">Please let an administrator know.</p>
        )}
      </div>
    </section>
  );
}
