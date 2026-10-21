"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertIcon } from "@/components/icons";
import { characterCount } from "@/lib/text";

export function Counter({ value, max, id }: { value: string; max: number; id: string }) {
  const count = characterCount(value);
  const over = count > max;
  const near = count > max * 0.9;
  return (
    <span
      id={id}
      className={`shrink-0 tabular-nums ${over ? "font-semibold text-red-text" : near ? "text-yellow-text" : "text-muted"}`}
      aria-live={near ? "polite" : "off"}
    >
      <span className="visually-hidden">Characters used: </span>
      {count.toLocaleString("en")} / {max.toLocaleString("en")}
    </span>
  );
}

/** Invisible to people and assistive tech; bots tend to fill it in. */
export function Honeypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="visually-hidden">
      <label>
        Leave this field empty
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="alert alert-error enter">
      <AlertIcon />
      <p>{message}</p>
    </div>
  );
}

export function SubmitButton({
  sending,
  retry,
  label,
  sendingLabel = "Sending…",
}: {
  sending: boolean;
  retry: boolean;
  label: string;
  sendingLabel?: string;
}) {
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={sending} aria-disabled={sending}>
      {sending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {sendingLabel}
        </>
      ) : retry ? (
        "Try sending again"
      ) : (
        label
      )}
    </button>
  );
}

/** Keeps the primary action within thumb reach on phones. */
export function StickyActions({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-[var(--gutter)] mt-2 border-t border-line/70 bg-paper/95 px-[var(--gutter)] pt-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.875rem)" }}
    >
      {children}
    </div>
  );
}

export type SuccessCopy = {
  title: string;
  body: string;
  primary: { href: string; label: string };
  againLabel: string;
  ticks?: string[];
};

export function SuccessPanel({ copy, onAgain }: { copy: SuccessCopy; onAgain: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const ticks = copy.ticks ?? ["var(--color-green)", "var(--color-navy)", "var(--color-yellow)"];
  return (
    <div className="rise py-6 sm:py-10">
      <div className="mb-6 flex gap-1.5" aria-hidden="true">
        {ticks.map((colour, index) => (
          <span
            key={colour + index}
            className="tick tick-lg"
            style={{ ["--tick" as string]: colour, animation: `ray-in 520ms var(--ease-out) ${120 + index * 90}ms both` }}
          />
        ))}
      </div>
      <h2 ref={heading} tabIndex={-1} className="display text-[2.125rem] outline-none sm:text-[2.75rem]">
        {copy.title}
      </h2>
      <p className="mt-4 max-w-prose text-[1.0625rem] text-ink-2">{copy.body}</p>
      <div className="mt-8 grid gap-3 sm:flex">
        <Link href={copy.primary.href} className="btn btn-primary">
          {copy.primary.label}
        </Link>
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          {copy.againLabel}
        </button>
      </div>
    </div>
  );
}
