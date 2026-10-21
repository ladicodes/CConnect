import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { getPresentation } from "@/lib/admin-data";
import { siteUrl } from "@/lib/env";
import { qrMatrix } from "@/lib/qr";
import { Logo } from "@/components/logo";
import { PresentationDisplay } from "@/components/screen/presentation-display";
import { ScreenControls } from "@/components/screen/screen-controls";
import { QrSlide, displayAddress } from "@/components/screen/slides";

export const metadata: Metadata = { title: "Presentation" };

export default function PresentPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Display />
    </Suspense>
  );
}

async function Display() {
  const staff = await requireStaff();
  const site = siteUrl();
  const presentation = await getPresentation(staff);
  return (
    <main>
      <ScreenControls>
        <Link href="/admin/live" className="btn btn-quiet btn-sm bg-surface/90">
          Controls
        </Link>
      </ScreenControls>
      <PresentationDisplay
        initial={presentation}
        logo={<Logo eager maxHeight={96} className="h-[clamp(44px,7vh,96px)]" />}
        address={site.ok ? displayAddress(site.url) : ""}
        qrSlide={
          site.ok ? (
            <QrSlide matrix={qrMatrix(site.url)} url={site.url} />
          ) : (
            <div className="grid min-h-dvh place-items-center p-10 text-center">
              <p className="alert alert-error max-w-lg">QR code unavailable: {site.problem}</p>
            </div>
          )
        }
      />
    </main>
  );
}
