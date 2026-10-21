"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarIcon,
  CloseIcon,
  GridIcon,
  HeartIcon,
  LogOutIcon,
  MenuIcon,
  NoteIcon,
  QrIcon,
  QuestionIcon,
  ScreenIcon,
  SunriseIcon,
} from "@/components/icons";
import { signOut } from "@/app/admin/actions";

type Counts = { questions: number; context: number; prayers: number; testimonies: number };

type Item = {
  href: string;
  label: string;
  Icon: (props: { size?: number }) => React.ReactNode;
  count?: keyof Counts;
  adminOnly?: boolean;
  exact?: boolean;
};

const SECTIONS: { label: string; items: Item[] }[] = [
  {
    label: "Moderation",
    items: [
      { href: "/admin", label: "Overview", Icon: GridIcon, exact: true },
      { href: "/admin/questions", label: "Questions", Icon: QuestionIcon, count: "questions" },
      { href: "/admin/context", label: "Context", Icon: NoteIcon, count: "context" },
      { href: "/admin/prayers", label: "Prayer requests", Icon: HeartIcon, count: "prayers", adminOnly: true },
      { href: "/admin/testimonies", label: "Testimonies", Icon: SunriseIcon, count: "testimonies", adminOnly: true },
    ],
  },
  {
    label: "Services",
    items: [
      { href: "/admin/sessions", label: "Services", Icon: CalendarIcon },
      { href: "/admin/live", label: "Live Q&A", Icon: ScreenIcon },
      { href: "/admin/qr", label: "QR code", Icon: QrIcon },
    ],
  },
];

function NavList({ role, counts, onNavigate }: { role: "admin" | "moderator"; counts: Counts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-3 text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted">{section.label}</p>
          <ul className="mt-2 space-y-0.5">
            {section.items
              .filter((item) => !item.adminOnly || role === "admin")
              .map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const count = item.count ? counts[item.count] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium transition-colors ${
                        active ? "bg-navy-tint font-semibold text-navy" : "text-ink-2 hover:bg-sunken hover:text-ink"
                      }`}
                    >
                      <item.Icon size={18} />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={`min-w-6 rounded-full px-1.5 text-center text-xs font-bold leading-5 tabular-nums ${
                            active ? "bg-navy text-white" : "bg-sunken text-ink"
                          }`}
                        >
                          <span className="visually-hidden">, </span>
                          {count}
                          <span className="visually-hidden"> waiting</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Account({ name, role }: { name: string; role: "admin" | "moderator" }) {
  return (
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="text-xs text-muted">{role === "admin" ? "Administrator" : "Moderator"}</p>
      </div>
      <form action={signOut}>
        <button type="submit" className="btn btn-quiet btn-xs gap-1.5 text-ink-2" title="Sign out">
          <LogOutIcon size={16} />
          <span className="visually-hidden sm:not-sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}

export function AdminNav({
  role,
  counts,
  name,
  logo,
}: {
  role: "admin" | "moderator";
  counts: Counts;
  name: string;
  logo: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const waiting = counts.questions + counts.context + (role === "admin" ? counts.prayers + counts.testimonies : 0);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link href="/admin" className="mx-2 mb-1 block w-fit rounded-md">
          {logo}
        </Link>
        <p className="mx-3 mb-6 text-xs font-semibold text-muted">Connect-Ask admin</p>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto">
          <NavList role={role} counts={counts} />
        </nav>
        <div className="mx-1 space-y-3">
          <Link href="/" className="block px-2 text-sm font-semibold text-navy hover:underline" target="_blank" rel="noreferrer">
            View public site ↗
          </Link>
          <Account name={name} role={role} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-3 backdrop-blur-sm lg:hidden">
        <Link href="/admin" className="rounded-md">
          {logo}
        </Link>
        <button type="button" className="btn btn-quiet btn-sm gap-2" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <MenuIcon size={20} />
          Menu
          {waiting > 0 && <span className="rounded-full bg-navy px-1.5 text-xs font-bold leading-5 text-white">{waiting}</span>}
        </button>
      </div>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        aria-label="Admin menu"
        className="ml-auto mr-0 mt-0 h-dvh max-h-dvh w-[min(20rem,88vw)] border-l border-line bg-surface p-0 backdrop:bg-ink/40"
      >
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">Connect-Ask admin</p>
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => setOpen(false)} aria-label="Close menu">
              <CloseIcon size={20} />
            </button>
          </div>
          <nav aria-label="Admin" className="flex-1 overflow-y-auto">
            <NavList role={role} counts={counts} onNavigate={() => setOpen(false)} />
          </nav>
          <Account name={name} role={role} />
        </div>
      </dialog>
    </>
  );
}
