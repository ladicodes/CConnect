"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Optional Cloudflare Turnstile widget, rendered only when the site is
 * configured with a site key. Exposes reset() so every attempt gets a fresh,
 * single-use token.
 */

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"))));
    script.addEventListener("error", () => reject(new Error("turnstile")));
  });
}

export type TurnstileHandle = { reset: () => void };

export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (token: string | null) => void }>(
  function Turnstile({ siteKey, onToken }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);

    useEffect(() => {
      onTokenRef.current = onToken;
    }, [onToken]);

    useImperativeHandle(ref, () => ({
      reset() {
        onTokenRef.current(null);
        if (widget.current) window.turnstile?.reset(widget.current);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadScript()
        .then((api) => {
          if (cancelled || !container.current) return;
          widget.current = api.render(container.current, {
            sitekey: siteKey,
            action: "submission",
            appearance: "interaction-only",
            callback: (token: string) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          });
        })
        .catch(() => onTokenRef.current(null));
      return () => {
        cancelled = true;
        if (widget.current) window.turnstile?.remove(widget.current);
      };
    }, [siteKey]);

    return <div ref={container} className="min-h-0" />;
  },
);
