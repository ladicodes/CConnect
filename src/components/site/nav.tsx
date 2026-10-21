"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon, HomeIcon, QuestionIcon, SunriseIcon } from "@/components/icons";

const ITEMS = [
  { href: "/", label: "Home", Icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/questions", label: "Questions", Icon: QuestionIcon, match: (p: string) => p.startsWith("/questions") },
  { href: "/prayer", label: "Prayer", Icon: HeartIcon, match: (p: string) => p.startsWith("/prayer") },
  { href: "/testimonies", label: "Testimonies", Icon: SunriseIcon, match: (p: string) => p.startsWith("/testimonies") },
] as const;

/** Desktop top navigation. */
export function TopNav() {
  return <TopNavView pathname={usePathname()} />;
}

export function TopNavView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {ITEMS.map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex min-h-11 items-center rounded-md px-3.5 text-[0.9375rem] font-semibold transition-colors ${
                  active ? "text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink"
                }`}
              >
                {label}
                {active && <span aria-hidden className="absolute inset-x-3.5 -bottom-[17px] h-[2px] rounded-full bg-navy" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile bottom tab bar: four labelled destinations within thumb reach. */
export function TabBar() {
  return <TabBarView pathname={usePathname()} />;
}

export function TabBarView({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.375rem)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 pt-1.5 text-[0.6875rem] font-semibold tracking-[0.01em] transition-colors ${
                  active ? "text-navy" : "text-muted hover:text-ink"
                }`}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.9} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
