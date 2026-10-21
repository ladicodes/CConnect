import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { ChevronLeft } from "@/components/icons";
import { TabBar, TabBarView, TopNav, TopNavView } from "@/components/site/nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/92 backdrop-blur-sm md:static md:bg-paper">
      <div className="shell flex h-16 items-center justify-between gap-4 md:h-[4.5rem]">
        <Link href="/" aria-label="Connect-Ask home" className="-ml-1 rounded-md p-1">
          <Logo height={38} eager />
        </Link>
        <Suspense fallback={<TopNavView pathname="" />}>
          <TopNav />
        </Suspense>
        <Link href="/ask" className="btn btn-primary btn-sm hidden md:inline-flex">
          Ask a question
        </Link>
      </div>
    </header>
  );
}

/** Header for focused tasks (forms): a way back and the logo, nothing else. */
export function FocusHeader({ backHref, backLabel = "Back" }: { backHref: string; backLabel?: string }) {
  return (
    <header className="border-b border-line/80 bg-paper">
      <div className="shell-narrow flex h-16 items-center justify-between">
        <Link href={backHref} className="btn btn-quiet -ml-2 gap-1 text-[0.9375rem]">
          <ChevronLeft size={18} />
          {backLabel}
        </Link>
        <Link href="/" aria-label="Connect-Ask home" className="rounded-md p-1">
          <Logo height={36} eager />
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line pb-28 pt-10 md:pb-12">
      <div className="shell flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Logo height={40} />
          <p className="max-w-sm text-sm text-muted">
            Connect-Ask is how Covenant Connect gathers questions, prayer requests and testimonies. No account needed.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/privacy" className="font-semibold text-ink-2 hover:text-ink">
            Privacy
          </Link>
          <Link href="/context" className="font-semibold text-ink-2 hover:text-ink">
            Add context
          </Link>
          <Link href="/admin/login" className="text-muted hover:text-ink">
            Leaders sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function MobileTabBar() {
  return (
    <Suspense fallback={<TabBarView pathname="" />}>
      <TabBar />
    </Suspense>
  );
}
