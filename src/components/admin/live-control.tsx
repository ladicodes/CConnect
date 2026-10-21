"use client";

import { useState } from "react";
import type { AdminQuestion, Presentation } from "@/lib/admin-data";
import { presentMode, presentQuestion, setQuestionAnswer } from "@/app/admin/actions";
import { useAdminAction } from "@/components/admin/feedback";
import { AnswerBadge } from "@/components/status";
import { QrIcon, ScreenIcon } from "@/components/icons";

export function LiveControl({
  presentation,
  questions,
  scope,
  hasSession,
}: {
  presentation: Presentation;
  questions: AdminQuestion[];
  scope: "session" | "all";
  hasSession: boolean;
}) {
  const { pending, perform } = useAdminAction();
  const [withContext, setWithContext] = useState(true);

  return (
    <div className="grid gap-8 px-4 py-6 sm:px-6 lg:px-8 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-labelledby="on-screen" className="h-fit space-y-4 xl:sticky xl:top-6">
        <h2 id="on-screen" className="eyebrow">
          On screen now
        </h2>
        <div className="aspect-video overflow-hidden rounded-lg border border-line bg-paper p-4 shadow-[inset_0_0_0_6px_var(--color-surface)]">
          {presentation.mode === "question" && presentation.body ? (
            <div className="flex h-full flex-col justify-center">
              <p className="line-clamp-5 font-display text-[1.0625rem] font-semibold leading-snug">&ldquo;{presentation.body}&rdquo;</p>
              {presentation.showContext && presentation.context.length > 0 && (
                <p className="mt-2 text-xs text-muted">+ {presentation.context.length} context</p>
              )}
            </div>
          ) : presentation.mode === "qr" ? (
            <div className="grid h-full place-items-center text-center text-sm text-ink-2">
              <span className="flex flex-col items-center gap-2">
                <QrIcon size={36} />
                QR code (join screen)
              </span>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">Logo only</div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm gap-1.5"
            disabled={pending || presentation.mode === "qr"}
            onClick={() => perform(() => presentMode({ mode: "qr" }))}
          >
            <QrIcon size={16} /> Show QR
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pending || presentation.mode === "blank"}
            onClick={() => perform(() => presentMode({ mode: "blank" }))}
          >
            Clear screen
          </button>
        </div>
        <a href="/admin/present" target="_blank" rel="noreferrer" className="btn btn-primary btn-sm w-full gap-2">
          <ScreenIcon size={17} />
          Open the display
        </a>
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Open the display on the computer connected to the projector, then press Full screen. It updates within a few
          seconds of any change here. Only questions on the public board can be shown.
        </p>
      </section>

      <section aria-labelledby="live-questions" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="live-questions" className="eyebrow">
            {scope === "session" && hasSession ? "Questions from the live service" : "Questions on the board"}
          </h2>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="size-4 accent-navy" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
            Include approved context on screen
          </label>
        </div>
        {questions.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line-strong p-8 text-center text-ink-2">
            No questions are on the public board{scope === "session" && hasSession ? " for this service" : ""} yet. Approve
            questions in Questions first.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {questions.map((question) => {
              const onScreen = presentation.mode === "question" && presentation.questionId === question.id;
              return (
                <li key={question.id} className={`flex flex-wrap items-start gap-4 p-4 ${onScreen ? "bg-magenta-tint/60" : ""}`}>
                  <div className="w-14 shrink-0 text-center">
                    <span className="block text-xl font-semibold text-ink">{question.supportCount}</span>
                    <span className="block text-[0.6875rem] text-muted">me too</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[0.9375rem] font-medium leading-snug">{question.body}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
                      <AnswerBadge status={question.answerStatus} />
                      {question.contextTotal > 0 && <span>{question.contextTotal} context</span>}
                      {onScreen && <span className="badge badge-danger badge-dot">On screen</span>}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      type="button"
                      className={`btn btn-sm flex-1 sm:flex-none ${onScreen ? "btn-secondary" : "btn-primary"}`}
                      disabled={pending}
                      onClick={() => perform(() => presentQuestion({ id: question.id, showContext: withContext }))}
                    >
                      {onScreen ? "Refresh" : "Show"}
                    </button>
                    {question.answerStatus !== "answered" && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm flex-1 sm:flex-none"
                        disabled={pending}
                        onClick={() => perform(() => setQuestionAnswer({ ids: [question.id], answer: "answered" }))}
                      >
                        Answered
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
