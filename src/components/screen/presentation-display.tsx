"use client";

import { useEffect, useState } from "react";
import type { Presentation } from "@/lib/admin-data";

const POLL_MS = 3000;

/**
 * The projector view. It only ever renders what the presentation endpoint
 * returns, and that endpoint only returns a question a leader explicitly put
 * on screen that is still public. Prayer requests and testimonies are never
 * part of it.
 */
export function PresentationDisplay({
  initial,
  qrSlide,
  logo,
  address,
}: {
  initial: Presentation;
  qrSlide: React.ReactNode;
  logo: React.ReactNode;
  address: string;
}) {
  const [state, setState] = useState(initial);
  const [problem, setProblem] = useState<"signed-out" | "offline" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/presentation", { cache: "no-store", credentials: "same-origin" });
        if (cancelled) return;
        if (response.status === 401) return setProblem("signed-out");
        const data = (await response.json()) as { ok: boolean; presentation?: Presentation };
        if (data.ok && data.presentation) {
          setProblem(null);
          setState((current) => (current.updatedAt === data.presentation!.updatedAt && current.supportCount === data.presentation!.supportCount ? current : data.presentation!));
        } else {
          setProblem("offline");
        }
      } catch {
        if (!cancelled) setProblem("offline");
      }
    };
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      {state.mode === "qr" && qrSlide}
      {state.mode === "blank" && (
        <div className="grid min-h-dvh place-items-center">
          <div className="opacity-90">{logo}</div>
        </div>
      )}
      {state.mode === "question" && state.body && (
        <QuestionSlide key={state.questionId} presentation={state} logo={logo} address={address} />
      )}
      {problem && (
        <p className="fixed bottom-3 left-3 rounded-md bg-ink/80 px-3 py-1.5 text-xs text-white" role="status">
          {problem === "signed-out" ? "Signed out: sign in again on this computer to keep the screen updating." : "Reconnecting…"}
        </p>
      )}
    </>
  );
}

function QuestionSlide({ presentation, logo, address }: { presentation: Presentation; logo: React.ReactNode; address: string }) {
  const length = presentation.body?.length ?? 0;
  const size =
    length < 90 ? "text-[clamp(2.5rem,5.6vw,7rem)]" : length < 200 ? "text-[clamp(2rem,4.3vw,5.25rem)]" : length < 400 ? "text-[clamp(1.75rem,3.3vw,4rem)]" : "text-[clamp(1.5rem,2.6vw,3.25rem)]";
  const context = presentation.showContext ? presentation.context.slice(0, 3) : [];
  return (
    <div className="rise flex min-h-dvh flex-col px-[6vw] py-[5vh]">
      <div className="flex items-center justify-between">
        {logo}
        <span className="eyebrow text-[clamp(0.875rem,1.4vw,1.5rem)]">
          <span className="tick tick-lg" style={{ ["--tick" as string]: "var(--color-magenta)" }} />
          Live Q&amp;A
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center py-[4vh]">
        <p className={`display max-w-[88vw] whitespace-pre-line break-words leading-[1.1] tracking-[-0.02em] ${size}`}>
          &ldquo;{presentation.body}&rdquo;
        </p>
        {context.length > 0 && (
          <ul className="mt-[4vh] max-w-[80vw] space-y-[1.8vh]">
            {context.map((note) => (
              <li key={note.id} className="border-l-[0.5vh] border-cyan pl-[1.5vw] text-[clamp(1.125rem,1.9vw,2.25rem)] leading-snug text-ink-2">
                <span className="line-clamp-3">{note.body}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-[2.5vh] text-[clamp(1rem,1.7vw,2rem)] text-ink-2">
        <span>
          {presentation.supportCount > 0 ? (
            <>
              <b className="font-semibold text-magenta-text">{presentation.supportCount}</b>{" "}
              {presentation.supportCount === 1 ? "person has" : "people have"} this question too
            </>
          ) : (
            "From the Question Board"
          )}
        </span>
        <span>
          Ask yours at <b className="font-semibold text-ink">{address}</b>
        </span>
      </div>
    </div>
  );
}
