import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Screen", template: "%s · Connect-Ask" } };

/** Full-screen views for projectors: no dashboard chrome. */
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper">{children}</div>;
}
