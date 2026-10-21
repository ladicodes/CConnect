"use client";

import { useCallback, useId, useRef, useState } from "react";
import { LIMITS, characterCount, checkBody, problemMessage } from "@/lib/text";
import { Turnstile, type TurnstileHandle } from "@/components/forms/turnstile";
import { useSubmission } from "@/components/forms/use-submission";
import { Counter, FormError, Honeypot, StickyActions, SubmitButton, SuccessPanel } from "@/components/forms/form-parts";

type Fields = {
  kind: "thanksgiving" | "testimony";
  body: string;
  displayName: string;
  sharing: "private" | "public";
  website: string;
};

const INITIAL: Fields = { kind: "thanksgiving", body: "", displayName: "", sharing: "private", website: "" };
const isEmpty = (fields: Fields) => !fields.body.trim() && !fields.displayName.trim();

export function TestimonyForm({ turnstileSiteKey }: { turnstileSiteKey?: string | null }) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const [lastSharing, setLastSharing] = useState<Fields["sharing"]>("private");
  const { fields, update, state, send, fail, reset } = useSubmission<Fields>({
    storageKey: "connect-ask:draft:testimony",
    endpoint: "/api/testimonies",
    initial: INITIAL,
    isEmpty,
  });

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (state.status === "sending") return;
      const problem = checkBody(fields.body, LIMITS.testimony);
      if (problem) {
        fail(problemMessage(problem, LIMITS.testimony, "message"), "body");
        textarea.current?.focus();
        return;
      }
      if (characterCount(fields.displayName.trim()) > LIMITS.displayName) {
        fail(`Please keep the name under ${LIMITS.displayName} characters.`, "displayName");
        return;
      }
      if (turnstileSiteKey && !token) {
        fail("Please wait a moment while we check this browser, then try again.");
        return;
      }
      setLastSharing(fields.sharing);
      await send({
        kind: fields.kind,
        body: fields.body,
        displayName: fields.displayName,
        shareConsent: fields.sharing === "public",
        website: fields.website,
        turnstileToken: token ?? undefined,
      });
      turnstile.current?.reset();
    },
    [fail, fields, send, state.status, token, turnstileSiteKey],
  );

  if (state.status === "success") {
    return (
      <SuccessPanel
        onAgain={reset}
        copy={{
          title: "Thank you for sharing.",
          body:
            lastSharing === "public"
              ? "Church leaders will read it. Because you said it may be shared, they may also choose to publish it on the Testimonies page."
              : "Church leaders will read it. It will stay between you and them, and it won't be published.",
          primary: { href: "/testimonies", label: "Read testimonies" },
          againLabel: "Share another",
          ticks: ["var(--color-yellow)", "var(--color-green)", "var(--color-navy)"],
        }}
      />
    );
  }

  const sending = state.status === "sending";
  const error = state.status === "error" ? state : null;
  const bodyError = error?.field === "body";
  const nameError = error?.field === "displayName";

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-7" aria-busy={sending}>
      <fieldset>
        <legend className="field-label">What would you like to share?</legend>
        <div className="segmented mt-1 w-full sm:w-auto" role="radiogroup" aria-label="Type of message">
          {(["thanksgiving", "testimony"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={fields.kind === kind}
              className="flex-1 sm:flex-none"
              onClick={() => update("kind", kind)}
              disabled={sending}
            >
              {kind === "thanksgiving" ? "Thanksgiving" : "Testimony"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.8125rem] text-muted">
          {fields.kind === "thanksgiving"
            ? "Something you're grateful for, big or small."
            : "A story of what God has done in your life."}
        </p>
      </fieldset>

      <div>
        <label htmlFor={`${id}-body`} className="field-label">
          {fields.kind === "thanksgiving" ? "Your thanksgiving" : "Your testimony"}
        </label>
        <textarea
          ref={textarea}
          id={`${id}-body`}
          rows={7}
          className="field max-h-[55vh] [field-sizing:content]"
          placeholder={
            fields.kind === "thanksgiving"
              ? "e.g. I'm thankful for a safe journey home this week…"
              : "e.g. A few months ago I was struggling with…"
          }
          value={fields.body}
          onChange={(event) => update("body", event.target.value)}
          readOnly={sending}
          aria-invalid={bodyError || undefined}
          aria-describedby={`${id}-count${bodyError ? ` ${id}-body-error` : ""}`}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck
        />
        <div className="mt-2 flex justify-end text-[0.8125rem]">
          <Counter value={fields.body} max={LIMITS.testimony} id={`${id}-count`} />
        </div>
        {bodyError && (
          <p id={`${id}-body-error`} className="mt-1 text-sm font-semibold text-red-text">
            {error?.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-name`} className="field-label">
          Name to show <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${id}-name`}
          type="text"
          className="field"
          value={fields.displayName}
          onChange={(event) => update("displayName", event.target.value)}
          readOnly={sending}
          maxLength={LIMITS.displayName + 20}
          autoComplete="off"
          placeholder="Leave blank to stay anonymous"
          aria-invalid={nameError || undefined}
          aria-describedby={`${id}-name-hint${nameError ? ` ${id}-name-error` : ""}`}
        />
        <p id={`${id}-name-hint`} className="mt-2 text-[0.8125rem] text-muted">
          A first name or initials is plenty. This is only shown if your message is published.
        </p>
        {nameError && (
          <p id={`${id}-name-error`} className="mt-1 text-sm font-semibold text-red-text">
            {error?.message}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="field-label">Who may see it?</legend>
        <div className="mt-1 grid gap-3">
          <label className="choice">
            <input
              type="radio"
              name={`${id}-sharing`}
              value="private"
              checked={fields.sharing === "private"}
              onChange={() => update("sharing", "private")}
              disabled={sending}
            />
            <span>
              <span className="block font-semibold">Church leaders only</span>
              <span className="mt-0.5 block text-sm text-ink-2">It stays private and is never published.</span>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name={`${id}-sharing`}
              value="public"
              checked={fields.sharing === "public"}
              onChange={() => update("sharing", "public")}
              disabled={sending}
            />
            <span>
              <span className="block font-semibold">Leaders may share it publicly</span>
              <span className="mt-0.5 block text-sm text-ink-2">
                It may appear on the Testimonies page after a leader approves it.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <Honeypot value={fields.website} onChange={(value) => update("website", value)} />
      {turnstileSiteKey && <Turnstile ref={turnstile} siteKey={turnstileSiteKey} onToken={setToken} />}
      {error && !bodyError && !nameError && <FormError message={error.message} />}

      <StickyActions>
        <SubmitButton sending={sending} retry={Boolean(error?.retryable)} label="Send to church leaders" />
      </StickyActions>
    </form>
  );
}
