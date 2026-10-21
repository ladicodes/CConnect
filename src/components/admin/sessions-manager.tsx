"use client";

import Link from "next/link";
import { useState } from "react";
import type { SessionRow } from "@/lib/admin-data";
import { activateSession, archiveSession, closeSession, createSession } from "@/app/admin/actions";
import { ConfirmDialog, useAdminAction } from "@/components/admin/feedback";
import { formatServiceDate } from "@/lib/format";
import { LiveDot } from "@/components/status";

const KINDS = [
  { value: "sunday", label: "Sunday Service" },
  { value: "midweek", label: "Midweek Service" },
  { value: "youth", label: "Youth Service" },
  { value: "special", label: "Special Event" },
  { value: "other", label: "Other" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

export function SessionsManager({ sessions, today, showArchived }: { sessions: SessionRow[]; today: string; showArchived: boolean }) {
  const { pending, perform } = useAdminAction();
  // Sensible defaults from today's date: Sunday -> Sunday Service, otherwise Midweek.
  const defaultKind: Kind = new Date(`${today}T12:00:00Z`).getUTCDay() === 0 ? "sunday" : "midweek";
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [title, setTitle] = useState<string>(KINDS.find((k) => k.value === defaultKind)?.label ?? "");
  const [titleEdited, setTitleEdited] = useState(false);
  const [date, setDate] = useState(today);
  const [activate, setActivate] = useState(true);
  const [switching, setSwitching] = useState<SessionRow | null>(null);
  const active = sessions.find((s) => s.status === "active");

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    perform(
      () => createSession({ title, kind, serviceDate: date, activate }),
      (result) => {
        if (result.ok) {
          setTitleEdited(false);
          setTitle(KINDS.find((k) => k.value === kind)?.label ?? "");
        }
      },
    );
  };

  return (
    <div className="grid gap-10 px-4 py-6 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="services-list">
        <h2 id="services-list" className="eyebrow">
          Services
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-ink-2">No services yet. Create one to group questions by service.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {sessions.map((session) => (
              <li key={session.id} className={`flex flex-wrap items-center gap-4 p-4 ${session.status === "active" ? "bg-red-tint/40" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2.5 font-semibold text-ink">
                    {session.status === "active" && <LiveDot />}
                    {session.title}
                    <span className="font-normal text-muted">· {formatServiceDate(session.serviceDate, "long")}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[0.8125rem] text-muted">
                    <span className={session.status === "active" ? "font-semibold text-red-text" : ""}>
                      {{ draft: "Not started", active: "Live now", closed: "Closed", archived: "Archived" }[session.status]}
                    </span>
                    <Link href={`/admin/questions?session=${session.id}&tab=review`} className="hover:text-navy hover:underline">
                      {session.questions} {session.questions === 1 ? "question" : "questions"}
                    </Link>
                    <Link href={`/admin/context?session=${session.id}`} className="hover:text-navy hover:underline">
                      {session.context} context
                    </Link>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {session.status === "active" ? (
                    <button type="button" className="btn btn-secondary btn-xs" disabled={pending} onClick={() => perform(() => closeSession({ id: session.id }))}>
                      Close service
                    </button>
                  ) : session.status !== "archived" ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={pending}
                      onClick={() => (active ? setSwitching(session) : perform(() => activateSession({ id: session.id })))}
                    >
                      Make live
                    </button>
                  ) : null}
                  {session.status !== "active" && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-xs"
                      disabled={pending}
                      onClick={() => perform(() => archiveSession({ id: session.id, archived: session.status !== "archived" }))}
                    >
                      {session.status === "archived" ? "Restore" : "Archive"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          <Link href={showArchived ? "/admin/sessions" : "/admin/sessions?archived=1"} className="link font-medium">
            {showArchived ? "Hide archived services" : "Show archived services"}
          </Link>
        </p>
      </section>

      <section aria-labelledby="new-service" className="h-fit rounded-lg border border-line bg-surface p-5">
        <h2 id="new-service" className="text-[1.25rem]">
          New service
        </h2>
        <form onSubmit={create} className="mt-4 space-y-4">
          <div>
            <label htmlFor="service-kind" className="field-label">
              Type
            </label>
            <select
              id="service-kind"
              className="field field-sm h-11"
              value={kind}
              onChange={(event) => {
                const next = event.target.value as Kind;
                setKind(next);
                if (!titleEdited) setTitle(KINDS.find((k) => k.value === next)?.label ?? "");
              }}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="service-title" className="field-label">
              Name
            </label>
            <input
              id="service-title"
              className="field field-sm h-11"
              value={title}
              maxLength={80}
              required
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
            />
          </div>
          <div>
            <label htmlFor="service-date" className="field-label">
              Date
            </label>
            <input id="service-date" type="date" className="field field-sm h-11" value={date} required onChange={(event) => setDate(event.target.value)} />
          </div>
          <label className="flex items-start gap-2.5 text-[0.9375rem]">
            <input type="checkbox" className="mt-1 size-4 accent-navy" checked={activate} onChange={(event) => setActivate(event.target.checked)} />
            <span>
              Make it live now
              {active && activate && <span className="block text-[0.8125rem] text-muted">This closes {active.title}.</span>}
            </span>
          </label>
          <button type="submit" className="btn btn-primary btn-block btn-sm" disabled={pending}>
            Create service
          </button>
        </form>
        <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
          Only one service can be live at a time. New questions and context are grouped under the live service. Prayer requests
          and testimonies work whether or not a service is live.
        </p>
      </section>

      <ConfirmDialog
        open={Boolean(switching)}
        destructive={false}
        title="Switch the live service?"
        body={
          <p>
            <strong>{active?.title}</strong> is live now. Making <strong>{switching?.title}</strong> live will close it. New
            questions will be grouped under the new service.
          </p>
        }
        confirmLabel="Switch service"
        onCancel={() => setSwitching(null)}
        onConfirm={() => {
          const id = switching?.id;
          setSwitching(null);
          if (id) perform(() => activateSession({ id }));
        }}
      />
    </div>
  );
}
