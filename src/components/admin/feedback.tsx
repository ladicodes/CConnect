"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, CheckIcon, CloseIcon } from "@/components/icons";
import type { ActionResult } from "@/app/admin/actions";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; tone: "success" | "error"; message: string };
const ToastContext = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  const show = useCallback(
    (tone: Toast["tone"], message: string) => {
      const id = next.current++;
      setToasts((list) => [...list.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-[0.9375rem] shadow-[0_8px_30px_rgb(29_31_34/0.18)] ${
              toast.tone === "error" ? "bg-red-text text-white" : "bg-ink text-white"
            }`}
          >
            {toast.tone === "error" ? (
              <AlertIcon size={18} className="mt-0.5 shrink-0" />
            ) : (
              <CheckIcon size={18} className="mt-0.5 shrink-0 text-green" />
            )}
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Running server actions with feedback
// ---------------------------------------------------------------------------
export function useAdminAction() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const perform = useCallback(
    (action: () => Promise<ActionResult>, onDone?: (result: ActionResult) => void) => {
      startTransition(async () => {
        let result: ActionResult;
        try {
          result = await action();
        } catch {
          result = { ok: false, error: "That didn't reach the server. Check your connection and try again." };
        }
        if (result.ok) {
          if (result.message) toast("success", result.message);
        } else {
          toast("error", result.error);
        }
        onDone?.(result);
      });
    },
    [toast],
  );

  return { pending, perform };
}

// ---------------------------------------------------------------------------
// Confirmation dialog (native <dialog>: focus trapping and Escape built in)
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_rgb(29_31_34/0.25)] backdrop:bg-ink/40"
      aria-labelledby="confirm-title"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-xl">
          {title}
        </h2>
        <div className="mt-3 text-[0.9375rem] text-ink-2">{body}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${destructive ? "btn-danger-solid" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Auto refresh: keeps the dashboard current without resetting filters,
// selection or scroll position. Pauses while someone is typing, while a
// dialog is open, and when the tab is in the background.
// ---------------------------------------------------------------------------
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
      if (typing || document.querySelector("dialog[open]")) return;
      router.refresh();
    };
    const timer = window.setInterval(tick, seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
  return null;
}
