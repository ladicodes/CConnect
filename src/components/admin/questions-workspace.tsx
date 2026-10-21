"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminContextNote, AdminQuestion, AnswerStatus, QuestionTab, Visibility } from "@/lib/admin-data";
import {
  archiveQuestions,
  deleteQuestions,
  presentQuestion,
  setContextStatus,
  setQuestionAnswer,
  setQuestionVisibility,
} from "@/app/admin/actions";
import { ConfirmDialog, useAdminAction } from "@/components/admin/feedback";
import { AnswerBadge, VisibilityBadge } from "@/components/status";
import { formatDateTime, formatServiceDate } from "@/lib/format";
import { ArchiveIcon, ChevronLeft, ScreenIcon, TrashIcon } from "@/components/icons";

type Detail = { question: AdminQuestion; context: AdminContextNote[]; onScreen: boolean } | null;

const VISIBILITY_OPTIONS: { value: Visibility; label: string; key: string }[] = [
  { value: "pending", label: "Review", key: "" },
  { value: "public", label: "On board", key: "A" },
  { value: "private", label: "Private", key: "P" },
  { value: "hidden", label: "Hidden", key: "H" },
];

const ANSWER_OPTIONS: { value: AnswerStatus; label: string; key: string }[] = [
  { value: "open", label: "Open", key: "O" },
  { value: "addressing", label: "Being addressed", key: "B" },
  { value: "answered", label: "Answered", key: "D" },
];

export function QuestionsWorkspace({
  tab,
  questions,
  hasMore,
  limit,
  detail,
  selectedId,
  explicitSelection,
  query,
  timeZone,
  filtered,
}: {
  tab: QuestionTab;
  questions: AdminQuestion[];
  hasMore: boolean;
  limit: number;
  detail: Detail;
  selectedId: string | null;
  explicitSelection: boolean;
  query: Record<string, string | undefined>;
  timeZone: string;
  filtered: boolean;
}) {
  const router = useRouter();
  const { pending, perform } = useAdminAction();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { ids: string[] }>(null);

  const href = useCallback(
    (changes: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...query, ...changes })) if (value) params.set(key, value);
      const text = params.toString();
      return text ? `/admin/questions?${text}` : "/admin/questions";
    },
    [query],
  );

  // Drop selections that are no longer in the list after a refresh.
  const visibleIds = useMemo(() => new Set(questions.map((q) => q.id)), [questions]);
  const selection = useMemo(() => [...checked].filter((id) => visibleIds.has(id)), [checked, visibleIds]);

  const index = questions.findIndex((q) => q.id === selectedId);
  const goTo = useCallback(
    (id: string | undefined) => {
      if (id) router.push(href({ id }), { scroll: false });
    },
    [href, router],
  );

  const nextAfter = useCallback(
    (id: string) => {
      const position = questions.findIndex((q) => q.id === id);
      return questions[position + 1]?.id ?? questions[position - 1]?.id;
    },
    [questions],
  );

  const changeVisibility = useCallback(
    (ids: string[], visibility: Visibility) => {
      const advance = ids.length === 1 && tab !== "archived" && visibility !== tabVisibility(tab) ? nextAfter(ids[0]) : undefined;
      perform(
        () => setQuestionVisibility({ ids, visibility }),
        (result) => {
          if (!result.ok) return;
          setChecked(new Set());
          if (advance) goTo(advance);
        },
      );
    },
    [goTo, nextAfter, perform, tab],
  );

  const changeAnswer = useCallback(
    (ids: string[], answer: AnswerStatus) => perform(() => setQuestionAnswer({ ids, answer }), (r) => r.ok && setChecked(new Set())),
    [perform],
  );

  // Keyboard moderation (ignored while typing or when a dialog is open).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable], dialog")) return;
      const key = event.key.toLowerCase();
      if (key === "j") goTo(questions[Math.min(index + 1, questions.length - 1)]?.id);
      else if (key === "k") goTo(questions[Math.max(index - 1, 0)]?.id);
      else if (!detail || pending) return;
      else if (key === "a") changeVisibility([detail.question.id], "public");
      else if (key === "p") changeVisibility([detail.question.id], "private");
      else if (key === "h") changeVisibility([detail.question.id], "hidden");
      else if (key === "o") changeAnswer([detail.question.id], "open");
      else if (key === "b") changeAnswer([detail.question.id], "addressing");
      else if (key === "d") changeAnswer([detail.question.id], "answered");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeAnswer, changeVisibility, detail, goTo, index, pending, questions]);

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChecked = selection.length > 0 && selection.length === questions.length;

  const showDetailOnMobile = explicitSelection && detail;

  return (
    <div className="lg:grid lg:min-h-[calc(100dvh-14rem)] lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
      {/* List */}
      <section aria-label="Questions" className={`min-w-0 border-line lg:border-r ${showDetailOnMobile ? "hidden lg:block" : ""}`}>
        {questions.length === 0 ? (
          <div className="mx-4 my-10 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center sm:mx-6 lg:mx-8">
            <p className="font-display text-lg font-semibold">
              {filtered ? "No questions match these filters" : tab === "review" ? "All caught up" : "Nothing here"}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[0.9375rem] text-ink-2">
              {filtered
                ? "Try clearing the search or filters."
                : tab === "review"
                  ? "New questions will appear here for review. This page refreshes automatically."
                  : "Questions will appear here when they're moved to this status."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm text-muted sm:px-6 lg:px-8">
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={allChecked}
                onChange={() => setChecked(allChecked ? new Set() : new Set(questions.map((q) => q.id)))}
                className="size-4 accent-navy"
              />
              <span>{selection.length > 0 ? `${selection.length} selected` : `${questions.length}${hasMore ? "+" : ""} shown`}</span>
              <span className="ml-auto hidden items-center gap-1.5 xl:flex">
                <span className="kbd">J</span>
                <span className="kbd">K</span> move · <span className="kbd">A</span> approve · <span className="kbd">P</span> private ·{" "}
                <span className="kbd">H</span> hide · <span className="kbd">D</span> answered
              </span>
            </div>
            <ol>
              {questions.map((question) => {
                const active = question.id === selectedId;
                return (
                  <li
                    key={question.id}
                    className={`relative flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-6 lg:px-8 ${
                      active ? "bg-navy-tint/70 shadow-[inset_3px_0_0_var(--color-navy)]" : "hover:bg-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select question"
                      checked={checked.has(question.id)}
                      onChange={() => toggle(question.id)}
                      className="relative z-10 mt-1 size-4 shrink-0 accent-navy"
                    />
                    <Link
                      href={href({ id: question.id })}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className="min-w-0 flex-1 rounded-sm after:absolute after:inset-0"
                    >
                      <p className="line-clamp-3 break-words text-[0.9375rem] font-medium leading-snug text-ink">{question.body}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
                        <VisibilityBadge visibility={question.visibility} />
                        <AnswerBadge status={question.answerStatus} hideOpen />
                        <span>{formatDateTime(question.createdAt, timeZone)}</span>
                        {question.sessionTitle && <span className="hidden sm:inline">· {question.sessionTitle}</span>}
                        {question.contextPending > 0 && (
                          <span className="font-semibold text-cyan-text">· {question.contextPending} context to review</span>
                        )}
                      </p>
                    </Link>
                    <span className="shrink-0 text-right">
                      <span className="block text-[0.9375rem] font-semibold text-ink">{question.supportCount}</span>
                      <span className="block text-[0.6875rem] text-muted">me too</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {hasMore && (
              <div className="flex justify-center p-4">
                <Link href={href({ limit: String(limit + 50) })} scroll={false} className="btn btn-secondary btn-sm">
                  Show more
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      {/* Detail */}
      <section
        aria-label="Selected question"
        className={`bg-surface ${showDetailOnMobile ? "" : "hidden lg:block"} lg:sticky lg:top-[2.8rem] lg:max-h-[calc(100dvh-2.8rem)] lg:overflow-y-auto`}
      >
        {detail ? (
          <QuestionDetail
            key={detail.question.id}
            detail={detail}
            pending={pending}
            timeZone={timeZone}
            backHref={href({ id: undefined })}
            onVisibility={(v) => changeVisibility([detail.question.id], v)}
            onAnswer={(a) => changeAnswer([detail.question.id], a)}
            onArchive={(archived) => perform(() => archiveQuestions({ ids: [detail.question.id], archived }))}
            onDelete={() => setConfirm({ ids: [detail.question.id] })}
            onPresent={(showContext) => perform(() => presentQuestion({ id: detail.question.id, showContext }))}
            onContext={(id, status) => perform(() => setContextStatus({ ids: [id], status }))}
          />
        ) : (
          <p className="p-8 text-ink-2">Select a question to see its details.</p>
        )}
      </section>

      {/* Bulk actions */}
      {selection.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="enter fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-xl bg-ink p-2.5 pl-4 text-white shadow-[0_12px_40px_rgb(29_31_34/0.35)] lg:left-[calc(15.5rem+1.5rem)] lg:right-6"
        >
          <span className="mr-auto text-sm font-semibold">{selection.length} selected</span>
          <button type="button" className="btn btn-xs bg-white text-navy" disabled={pending} onClick={() => changeVisibility(selection, "public")}>
            Approve
          </button>
          <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => changeVisibility(selection, "private")}>
            Keep private
          </button>
          <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => changeVisibility(selection, "hidden")}>
            Hide
          </button>
          <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => changeAnswer(selection, "answered")}>
            Mark answered
          </button>
          <button
            type="button"
            className="btn btn-xs bg-white/10 text-white hover:bg-white/20"
            disabled={pending}
            onClick={() => perform(() => archiveQuestions({ ids: selection, archived: tab !== "archived" }), (r) => r.ok && setChecked(new Set()))}
          >
            {tab === "archived" ? "Restore" : "Archive"}
          </button>
          <button type="button" className="btn btn-xs bg-red-text text-white hover:bg-[#8f2424]" disabled={pending} onClick={() => setConfirm({ ids: selection })}>
            Delete…
          </button>
          <button type="button" className="btn btn-xs text-white/80 hover:text-white" onClick={() => setChecked(new Set())}>
            Clear
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm && confirm.ids.length > 1 ? `Delete ${confirm.ids.length} questions?` : "Delete this question?"}
        body="This permanently removes the question and its “me too” count. Any linked context notes are kept but become unlinked. This can't be undone. To take a question out of view but keep it, archive it instead."
        confirmLabel="Delete permanently"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const ids = confirm?.ids ?? [];
          setConfirm(null);
          const advance = ids.length === 1 ? nextAfter(ids[0]) : undefined;
          perform(
            () => deleteQuestions({ ids }),
            (result) => {
              if (!result.ok) return;
              setChecked(new Set());
              router.push(href({ id: advance }), { scroll: false });
            },
          );
        }}
      />
    </div>
  );
}

function tabVisibility(tab: QuestionTab): Visibility | null {
  if (tab === "review") return "pending";
  if (tab === "archived") return null;
  return tab;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; key: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="segmented flex w-full">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => value !== option.value && onChange(option.value)}
          className="flex-1 px-2 disabled:cursor-wait"
          title={option.key ? `Shortcut: ${option.key}` : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function QuestionDetail({
  detail,
  pending,
  timeZone,
  backHref,
  onVisibility,
  onAnswer,
  onArchive,
  onDelete,
  onPresent,
  onContext,
}: {
  detail: NonNullable<Detail>;
  pending: boolean;
  timeZone: string;
  backHref: string;
  onVisibility: (value: Visibility) => void;
  onAnswer: (value: AnswerStatus) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  onPresent: (showContext: boolean) => void;
  onContext: (id: string, status: "approved" | "rejected" | "hidden" | "pending") => void;
}) {
  const { question, context, onScreen } = detail;
  const approvedContext = context.filter((c) => c.status === "approved").length;
  const [withContext, setWithContext] = useState(approvedContext > 0);
  const isPublic = question.visibility === "public" && !question.archivedAt;

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-6">
      <Link href={backHref} scroll={false} className="btn btn-quiet btn-xs -ml-1 w-fit gap-1 lg:hidden">
        <ChevronLeft size={16} />
        All questions
      </Link>

      <div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted">
          <span>
            Received <b className="font-semibold text-ink">{formatDateTime(question.createdAt, timeZone)}</b>
          </span>
          {question.sessionTitle && (
            <span>
              Service{" "}
              <b className="font-semibold text-ink">
                {question.sessionTitle}
                {question.sessionDate ? ` · ${formatServiceDate(question.sessionDate)}` : ""}
              </b>
            </span>
          )}
          <span>
            Me too <b className="font-semibold text-ink">{question.supportCount}</b>
          </span>
        </p>
        <p className="mt-3 whitespace-pre-line break-words font-display text-[1.375rem] font-semibold leading-snug">{question.body}</p>
        {question.archivedAt && (
          <p className="alert alert-warn mt-3">
            Archived {formatDateTime(question.archivedAt, timeZone)}. It&rsquo;s hidden everywhere until restored.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted">Board visibility</h3>
        <Segmented label="Board visibility" value={question.visibility} options={VISIBILITY_OPTIONS} disabled={pending} onChange={onVisibility} />
        <p className="mt-2 text-[0.8125rem] text-muted">
          {question.visibility === "public"
            ? "Shown on the public Question Board."
            : question.visibility === "private"
              ? "Leaders only. Never shown publicly."
              : question.visibility === "hidden"
                ? "Removed from the public board. Its link no longer works."
                : "Waiting for review. Not public."}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted">Answer status</h3>
        <Segmented label="Answer status" value={question.answerStatus} options={ANSWER_OPTIONS} disabled={pending} onChange={onAnswer} />
      </div>

      <div className="rounded-lg border border-line p-4">
        <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <ScreenIcon size={18} className="text-magenta-text" />
          Live Q&amp;A screen
          {onScreen && <span className="badge badge-danger badge-dot ml-auto">On screen now</span>}
        </h3>
        {isPublic ? (
          <>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={withContext}
                onChange={(event) => setWithContext(event.target.checked)}
                disabled={approvedContext === 0}
                className="size-4 accent-navy"
              />
              Include approved context ({approvedContext})
            </label>
            <button type="button" className="btn btn-secondary btn-sm mt-3 w-full" disabled={pending} onClick={() => onPresent(withContext && approvedContext > 0)}>
              {onScreen ? "Update screen" : "Show on screen"}
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Only questions on the public board can be shown on screen.</p>
        )}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted">
          Linked context ({context.length})
        </h3>
        {context.length === 0 ? (
          <p className="text-sm text-muted">No context has been added to this question.</p>
        ) : (
          <ul className="space-y-3">
            {context.map((note) => (
              <ContextItem key={note.id} note={note} pending={pending} onStatus={(status) => onContext(note.id, status)} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        <button type="button" className="btn btn-secondary btn-sm gap-1.5" disabled={pending} onClick={() => onArchive(!question.archivedAt)}>
          <ArchiveIcon size={16} />
          {question.archivedAt ? "Restore" : "Archive"}
        </button>
        <button type="button" className="btn btn-danger btn-sm gap-1.5" disabled={pending} onClick={onDelete}>
          <TrashIcon size={16} />
          Delete…
        </button>
      </div>
    </div>
  );
}

function ContextItem({
  note,
  pending,
  onStatus,
  timeZone,
}: {
  note: AdminContextNote;
  pending: boolean;
  onStatus: (status: "approved" | "rejected" | "hidden" | "pending") => void;
  timeZone: string;
}) {
  const badge =
    note.status === "approved" ? (
      <span className="badge badge-answered">Approved</span>
    ) : note.status === "pending" ? (
      <span className="badge badge-pending badge-dot">Needs review</span>
    ) : (
      <span className="badge badge-neutral">{note.status === "hidden" ? "Hidden" : "Rejected"}</span>
    );
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2 text-[0.75rem] text-muted">
        {badge}
        <span>{formatDateTime(note.createdAt, timeZone)}</span>
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-[0.9375rem] text-ink">{note.body}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {note.status !== "approved" && (
          <button type="button" className="btn btn-secondary btn-xs" disabled={pending} onClick={() => onStatus("approved")}>
            Approve
          </button>
        )}
        {note.status === "pending" && (
          <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => onStatus("rejected")}>
            Reject
          </button>
        )}
        {note.status === "approved" && (
          <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => onStatus("hidden")}>
            Hide
          </button>
        )}
      </div>
    </li>
  );
}
