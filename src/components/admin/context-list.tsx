"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AdminContextNote, ContextStatus, ContextTab, Visibility } from "@/lib/admin-data";
import { deleteContext, findQuestionsToLink, linkContext, setContextStatus } from "@/app/admin/actions";
import { ConfirmDialog, useAdminAction } from "@/components/admin/feedback";
import { formatDateTime, formatServiceDate } from "@/lib/format";
import { CloseIcon, LinkIcon, SearchIcon } from "@/components/icons";
import { VisibilityBadge } from "@/components/status";

export function ContextList({ tab, notes, timeZone }: { tab: ContextTab; notes: AdminContextNote[]; timeZone: string }) {
  const { pending, perform } = useAdminAction();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [linking, setLinking] = useState<AdminContextNote | null>(null);

  const visible = new Set(notes.map((n) => n.id));
  const selection = [...checked].filter((id) => visible.has(id));
  const clear = () => setChecked(new Set());
  const status = (ids: string[], next: ContextStatus) =>
    perform(() => setContextStatus({ ids, status: next }), (r) => r.ok && clear());

  return (
    <>
      <ul className="divide-y divide-line border-b border-line">
        {notes.map((note) => (
          <li key={note.id} className="flex gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <input
              type="checkbox"
              aria-label="Select note"
              checked={checked.has(note.id)}
              onChange={() =>
                setChecked((current) => {
                  const next = new Set(current);
                  if (next.has(note.id)) next.delete(note.id);
                  else next.add(note.id);
                  return next;
                })
              }
              className="mt-1 size-4 shrink-0 accent-navy"
            />
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-line break-words text-[0.9375rem] leading-relaxed text-ink">{note.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
                <span>{formatDateTime(note.createdAt, timeZone)}</span>
                {note.sessionTitle && (
                  <span>
                    {note.sessionTitle}
                    {note.sessionDate ? ` · ${formatServiceDate(note.sessionDate)}` : ""}
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-md bg-sunken px-3 py-2 text-[0.8125rem]">
                {note.questionId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <LinkIcon size={14} className="text-cyan-text" />
                    <span className="font-semibold text-ink-2">Linked to:</span>
                    <Link href={`/admin/questions?id=${note.questionId}&tab=${tabFor(note.questionVisibility)}`} className="line-clamp-1 min-w-0 flex-1 text-navy hover:underline">
                      {note.questionBody}
                    </Link>
                    {note.questionVisibility && <VisibilityBadge visibility={note.questionVisibility} />}
                  </div>
                ) : (
                  <span className="text-ink-2">Independent context (not linked to a question). Only leaders see it.</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {note.status !== "approved" && (
                  <button type="button" className="btn btn-secondary btn-xs" disabled={pending} onClick={() => status([note.id], "approved")}>
                    Approve
                  </button>
                )}
                {note.status === "pending" && (
                  <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([note.id], "rejected")}>
                    Reject
                  </button>
                )}
                {note.status === "approved" && (
                  <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([note.id], "hidden")}>
                    Hide
                  </button>
                )}
                {(note.status === "rejected" || note.status === "hidden") && (
                  <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([note.id], "pending")}>
                    Back to review
                  </button>
                )}
                <button type="button" className="btn btn-quiet btn-xs gap-1" disabled={pending} onClick={() => setLinking(note)}>
                  <LinkIcon size={14} />
                  {note.questionId ? "Change link" : "Link to a question"}
                </button>
                <button type="button" className="btn btn-quiet btn-xs text-red-text" disabled={pending} onClick={() => setConfirm([note.id])}>
                  Delete…
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {selection.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="enter fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-xl bg-ink p-2.5 pl-4 text-white shadow-[0_12px_40px_rgb(29_31_34/0.35)] lg:left-[calc(15.5rem+1.5rem)] lg:right-6"
        >
          <span className="mr-auto text-sm font-semibold">{selection.length} selected</span>
          {tab !== "approved" && (
            <button type="button" className="btn btn-xs bg-white text-navy" disabled={pending} onClick={() => status(selection, "approved")}>
              Approve
            </button>
          )}
          {tab === "review" && (
            <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => status(selection, "rejected")}>
              Reject
            </button>
          )}
          {tab === "approved" && (
            <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => status(selection, "hidden")}>
              Hide
            </button>
          )}
          <button type="button" className="btn btn-xs bg-red-text text-white" disabled={pending} onClick={() => setConfirm(selection)}>
            Delete…
          </button>
          <button type="button" className="btn btn-xs text-white/80" onClick={clear}>
            Clear
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} notes?` : "Delete this note?"}
        body="This permanently removes the context. It can't be undone."
        confirmLabel="Delete permanently"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const ids = confirm ?? [];
          setConfirm(null);
          perform(() => deleteContext({ ids }), (r) => r.ok && clear());
        }}
      />

      {linking && (
        <LinkDialog
          note={linking}
          onClose={() => setLinking(null)}
          onLink={(questionId) => {
            const id = linking.id;
            setLinking(null);
            perform(() => linkContext({ id, questionId }));
          }}
        />
      )}
    </>
  );
}

function tabFor(visibility: Visibility | null): string {
  if (visibility === "pending" || !visibility) return "review";
  return visibility;
}

function LinkDialog({
  note,
  onClose,
  onLink,
}: {
  note: AdminContextNote;
  onClose: () => void;
  onLink: (questionId: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof findQuestionsToLink>>>([]);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startLoading(async () => setResults(await findQuestionsToLink(search)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      aria-labelledby="link-title"
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_rgb(29_31_34/0.25)] backdrop:bg-ink/40"
    >
      <div className="flex max-h-[80dvh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <h2 id="link-title" className="text-xl">
              Link context to a question
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-ink-2">&ldquo;{note.body}&rdquo;</p>
          </div>
          <button type="button" className="btn btn-quiet btn-xs" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="border-b border-line p-4">
          <label htmlFor="link-search" className="visually-hidden">
            Search questions
          </label>
          <div className="relative">
            <SearchIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="link-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions"
              className="field field-sm h-10 pl-9"
              autoFocus
              autoComplete="off"
            />
          </div>
          <p className="mt-2 text-[0.8125rem] text-muted">
            If the question is on the public board and this note is approved, it will appear publicly under that question.
          </p>
        </div>
        <ul className="flex-1 divide-y divide-line overflow-y-auto" aria-busy={loading}>
          {results.length === 0 && !loading && <li className="p-5 text-sm text-muted">No matching questions.</li>}
          {results.map((question) => (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onLink(question.id)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-paper"
                aria-current={question.id === note.questionId ? "true" : undefined}
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[0.9375rem] font-medium">{question.body}</span>
                  <span className="mt-1 flex items-center gap-2 text-[0.75rem] text-muted">
                    <VisibilityBadge visibility={question.visibility} />
                    {question.sessionTitle}
                  </span>
                </span>
                {question.id === note.questionId && <span className="badge badge-public">Current</span>}
              </button>
            </li>
          ))}
        </ul>
        {note.questionId && (
          <div className="border-t border-line p-4">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onLink(null)}>
              Unlink (keep as independent context)
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
