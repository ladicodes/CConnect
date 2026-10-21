"use client";

import { useCallback, useId, useRef, useState } from "react";
import { checkBody, problemMessage } from "@/lib/text";
import { Turnstile, type TurnstileHandle } from "@/components/forms/turnstile";
import { useSubmission } from "@/components/forms/use-submission";
import {
  Counter,
  FormError,
  Honeypot,
  StickyActions,
  SubmitButton,
  SuccessPanel,
  type SuccessCopy,
} from "@/components/forms/form-parts";

type Fields = { body: string; website: string };
const INITIAL: Fields = { body: "", website: "" };
const isEmpty = (fields: Fields) => !fields.body.trim();

/**
 * The single-message form used for questions, context and prayer requests.
 */
export function MessageForm({
  endpoint,
  storageKey,
  label,
  placeholder,
  max,
  noun,
  submitLabel,
  hint,
  success,
  extraPayload,
  turnstileSiteKey,
  rows = 6,
  stickySubmit = true,
}: {
  endpoint: string;
  storageKey: string;
  label: string;
  placeholder: string;
  max: number;
  noun: string;
  submitLabel: string;
  hint?: string;
  success: SuccessCopy;
  extraPayload?: Record<string, unknown>;
  turnstileSiteKey?: string | null;
  rows?: number;
  /** Pin the submit button to the bottom on phones (not when a tab bar is shown). */
  stickySubmit?: boolean;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const { fields, update, state, send, fail, reset } = useSubmission<Fields>({
    storageKey,
    endpoint,
    initial: INITIAL,
    isEmpty,
  });

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (state.status === "sending") return;
      const problem = checkBody(fields.body, max);
      if (problem) {
        fail(problemMessage(problem, max, noun), "body");
        textarea.current?.focus();
        return;
      }
      if (turnstileSiteKey && !token) {
        fail("Please wait a moment while we check this browser, then try again.");
        return;
      }
      await send({ body: fields.body, website: fields.website, turnstileToken: token ?? undefined, ...extraPayload });
      turnstile.current?.reset();
    },
    [extraPayload, fail, fields, max, noun, send, state.status, token, turnstileSiteKey],
  );

  if (state.status === "success") {
    return <SuccessPanel copy={success} onAgain={reset} />;
  }

  const sending = state.status === "sending";
  const error = state.status === "error" ? state : null;
  const fieldError = error?.field === "body";
  const describedBy = [`${id}-hint`, `${id}-count`, fieldError ? `${id}-error` : ""].filter(Boolean).join(" ");

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={sending}>
      <div>
        <label htmlFor={`${id}-body`} className="field-label">
          {label}
        </label>
        <textarea
          ref={textarea}
          id={`${id}-body`}
          name="body"
          rows={rows}
          className="field max-h-[55vh] [field-sizing:content]"
          placeholder={placeholder}
          value={fields.body}
          onChange={(event) => update("body", event.target.value)}
          readOnly={sending}
          aria-invalid={fieldError || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck
          enterKeyHint="enter"
        />
        <div className="mt-2 flex items-start justify-between gap-4 text-[0.8125rem] leading-snug">
          <span id={`${id}-hint`} className="text-muted">
            {hint}
          </span>
          <Counter value={fields.body} max={max} id={`${id}-count`} />
        </div>
        {fieldError && (
          <p id={`${id}-error`} className="mt-2 text-sm font-semibold text-red-text">
            {error?.message}
          </p>
        )}
      </div>

      <Honeypot value={fields.website} onChange={(value) => update("website", value)} />
      {turnstileSiteKey && <Turnstile ref={turnstile} siteKey={turnstileSiteKey} onToken={setToken} />}
      {error && !fieldError && <FormError message={error.message} />}

      {stickySubmit ? (
        <StickyActions>
          <SubmitButton sending={sending} retry={Boolean(error?.retryable)} label={submitLabel} />
        </StickyActions>
      ) : (
        <SubmitButton sending={sending} retry={Boolean(error?.retryable)} label={submitLabel} />
      )}
    </form>
  );
}
