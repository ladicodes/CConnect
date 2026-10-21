"use client";

import { useState } from "react";
import { CheckIcon, ShareIcon } from "@/components/icons";

export function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled or unavailable; fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <button type="button" onClick={share} className="btn btn-quiet gap-2 text-[0.9375rem]">
      {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}
