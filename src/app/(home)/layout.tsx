import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { MobileTabBar, SiteFooter } from "@/components/site/chrome";
import { TopNav, TopNavView } from "@/components/site/nav";

/** The homepage leads with the logo, larger than on inner pages. */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header>
        <div className="shell flex items-center justify-between gap-4 pt-5 md:pt-7">
          <Link href="/" aria-label="Connect-Ask home" className="-ml-1 rounded-md p-1">
            <Logo eager maxHeight={68} className="h-[60px] md:h-[68px]" />
          </Link>
          <Suspense fallback={<TopNavView pathname="/" />}>
            <TopNav />
          </Suspense>
        </div>
      </header>
      <main id="main">{children}</main>
      <SiteFooter />
      <MobileTabBar />
    </>
  );
}
