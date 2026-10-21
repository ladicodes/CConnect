"use client";

import { useState, useTransition } from "react";
import { HandIcon } from "@/components/icons";

type Props = {
  questionId: string;
  initialSupported: boolean;
  initialCount: number;
  variant?: "compact" | "full";
};

/**
 * "I have this question too". Optimistic, but always reconciled with the
 * count the server returns; failures roll back and explain.
 */
export function SupportButton({ questionId, initialSupported, initialCount, variant = "compact" }: Props) {
  const [supported, setSupported] = useState(initialSupported);
  const [count, setCount] = useState(initialCount);
  const [message, setMessage] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !supported;
    const previous = { supported, count };
    setSupported(next);
    setCount((value) => Math.max(0, value + (next ? 1 : -1)));
    setMessage(null);
    if (next) setBump((value) => value + 1);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/questions/${questionId}/support`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supported: next }),
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as
          | { ok: true; supported: boolean; supportCount: number }
          | { ok: false; error: string }
          | null;
        if (response.ok && data?.ok) {
          setSupported(data.supported);
          setCount(data.supportCount);
        } else {
          setSupported(previous.supported);
          setCount(previous.count);
          setMessage(data && !data.ok ? data.error : "That didn't go through. Please try again.");
        }
      } catch {
        setSupported(previous.supported);
        setCount(previous.count);
        setMessage("You seem to be offline. Please try again.");
      }
    });
  };

  const people = `${count} ${count === 1 ? "person has" : "people have"} this question`;
  const label = supported
    ? `${count} You too: you have this question too. ${people}. Select to undo.`
    : `${count} Me too: I have this question too. ${people}.`;

  if (variant === "full") {
    return (
      <div className="w-full sm:w-auto">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={supported}
          aria-busy={pending}
          className={`group inline-flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 text-left transition-colors sm:w-auto sm:min-w-[22rem] ${
            supported
              ? "border-magenta bg-magenta-tint text-magenta-text"
              : "border-line-strong bg-surface text-ink hover:border-magenta hover:bg-magenta-tint/50"
          }`}
        >
          <span
            key={bump}
            className={`grid size-9 shrink-0 place-items-center rounded-full ${supported ? "bg-magenta text-white" : "bg-sunken text-ink-2"}`}
            style={bump ? { animation: "pop 380ms var(--ease-out)" } : undefined}
          >
            <HandIcon size={19} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{supported ? "You have this question too" : "I have this question too"}</span>
            <span className="block text-sm opacity-80">
              {count === 0
                ? "Be the first to say so"
                : `${count.toLocaleString("en")} ${count === 1 ? "person has" : "people have"} this question`}
            </span>
          </span>
          {supported && <span className="text-sm font-semibold underline-offset-2 group-hover:underline">Undo</span>}
        </button>
        <p role="status" className="text-sm text-red-text empty:hidden [&:not(:empty)]:mt-2">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={supported}
        aria-label={label}
        aria-busy={pending}
        className={`flex min-h-[3.25rem] w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-[0.6875rem] font-semibold leading-none transition-colors ${
          supported
            ? "border-magenta bg-magenta-tint text-magenta-text"
            : "border-line-strong bg-surface text-ink-2 hover:border-magenta hover:text-magenta-text"
        }`}
      >
        <span
          key={bump}
          className="font-display text-[1.0625rem] font-bold tabular-nums"
          style={bump ? { animation: "pop 380ms var(--ease-out)" } : undefined}
        >
          {count.toLocaleString("en")}
        </span>
        {supported ? "You too" : "Me too"}
      </button>
      {message && (
        <p role="status" className="mt-1 max-w-[9rem] text-right text-xs text-red-text">
          {message}
        </p>
      )}
    </div>
  );
}
