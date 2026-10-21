"use client";

import { useEffect, useState } from "react";
import { ExpandIcon } from "@/components/icons";

/**
 * Small floating controls for projector pages. They fade away (with the
 * cursor) after a few seconds without movement so nothing distracts the room.
 */
export function ScreenControls({ children }: { children?: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let timer = window.setTimeout(() => setVisible(false), 3500);
    const wake = () => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 3500);
    };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.cursor = visible ? "" : "none";
    return () => {
      document.documentElement.style.cursor = "";
    };
  }, [visible]);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by the browser; the page still works.
    }
  };

  return (
    <div
      className={`fixed right-4 top-4 z-50 flex items-center gap-2 transition-opacity duration-300 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {children}
      <button type="button" onClick={toggle} className="btn btn-secondary btn-sm gap-2 shadow-sm">
        <ExpandIcon size={17} />
        {fullscreen ? "Exit full screen" : "Full screen"}
      </button>
    </div>
  );
}
