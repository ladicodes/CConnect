"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success" }
  | { status: "error"; message: string; retryable: boolean; field?: string };

const TIMEOUT_MS = 20_000;

/** RFC 4122 v4 id. Falls back when crypto.randomUUID is unavailable (non-HTTPS LAN testing). */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Draft<F> = { fields: F; clientId: string | null };

function readDraft<F>(key: string): Draft<F> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft<F>) : null;
  } catch {
    return null;
  }
}

function writeDraft<F>(key: string, draft: Draft<F> | null) {
  try {
    if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode); the form still works.
  }
}

function fallbackMessage(status: number): { message: string; retryable: boolean } {
  if (status === 429) return { message: "You've sent several messages in a short time. Please wait a few minutes, then try again.", retryable: true };
  if (status >= 500 || status === 0)
    return { message: "We couldn't send that. Your message is still here, so please try again.", retryable: true };
  return { message: "Please check your message and try again.", retryable: false };
}

/**
 * Sending logic shared by every public form.
 *
 * - The draft (and its submission id) is kept in sessionStorage, so a reload
 *   or crashed tab doesn't lose what someone typed.
 * - The same submission id is reused for every retry of a draft, so a retry
 *   after an ambiguous failure (e.g. a timeout after the server saved it)
 *   can never create a duplicate.
 * - Success is only shown when the server confirms the database saved it.
 */
export function useSubmission<F extends Record<string, unknown>>({
  storageKey,
  endpoint,
  initial,
  isEmpty,
}: {
  storageKey: string;
  endpoint: string;
  initial: F;
  isEmpty: (fields: F) => boolean;
}) {
  const [fields, setFields] = useState<F>(initial);
  const [state, setState] = useState<SendState>({ status: "idle" });
  const clientId = useRef<string | null>(null);
  const restored = useRef(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    const draft = readDraft<F>(storageKey);
    if (draft) {
      clientId.current = draft.clientId;
      // Restoring a saved draft from browser storage after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFields((current) => ({ ...current, ...draft.fields }));
    }
    restored.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!restored.current) return;
    writeDraft(storageKey, isEmpty(fields) ? null : { fields, clientId: clientId.current });
  }, [fields, storageKey, isEmpty]);

  const update = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setState((current) => (current.status === "error" && !current.retryable ? { status: "idle" } : current));
  }, []);

  const fail = useCallback((message: string, field?: string) => {
    setState({ status: "error", message, retryable: false, field });
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      if (!clientId.current) clientId.current = newClientId();
      writeDraft(storageKey, { fields, clientId: clientId.current });
      setState({ status: "sending" });

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, clientId: clientId.current }),
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        let data: { ok?: boolean; error?: string; retryable?: boolean; field?: string } | null = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        if (response.ok && data?.ok) {
          writeDraft(storageKey, null);
          clientId.current = null;
          setFields(initialRef.current);
          setState({ status: "success" });
          return true;
        }
        const fallback = fallbackMessage(response.status);
        setState({
          status: "error",
          message: data?.error || fallback.message,
          retryable: data?.retryable ?? fallback.retryable,
          field: data?.field,
        });
        return false;
      } catch (error) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        const timedOut = error instanceof DOMException && error.name === "AbortError";
        setState({
          status: "error",
          retryable: true,
          message: offline
            ? "You seem to be offline. Your message is still here, so send it again when you're connected."
            : timedOut
              ? "This is taking longer than usual. Your message is still here, so please try again."
              : "We couldn't reach Connect-Ask. Your message is still here, so please try again.",
        });
        return false;
      } finally {
        window.clearTimeout(timer);
      }
    },
    [endpoint, fields, storageKey],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { fields, update, state, send, fail, reset };
}
