import { MobileTabBar, SiteFooter, SiteHeader } from "@/components/site/chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <MobileTabBar />
    </>
  );
}
