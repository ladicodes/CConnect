import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { qrMatrix } from "@/lib/qr";
import { QrSlide } from "@/components/screen/slides";
import { ScreenControls } from "@/components/screen/screen-controls";
import { DownloadIcon } from "@/components/icons";

export const metadata: Metadata = { title: "QR code" };

export default function QrPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <QrScreen />
    </Suspense>
  );
}

async function QrScreen() {
  await requireStaff();
  const site = siteUrl();
  if (!site.ok) {
    return (
      <main className="shell-narrow py-20">
        <h1 className="text-3xl">The QR code can&rsquo;t be shown yet</h1>
        <p className="alert alert-error mt-6">{site.problem}</p>
        <p className="mt-4 text-ink-2">
          Set <code className="font-semibold">SITE_URL</code> to the permanent public address (for example
          https://ask.example.org) and redeploy. The QR code always points to that address.
        </p>
        <Link href="/admin" className="btn btn-secondary btn-sm mt-8">
          Back to admin
        </Link>
      </main>
    );
  }
  return (
    <main>
      <ScreenControls>
        <Link href="/admin" className="btn btn-quiet btn-sm bg-surface/90">
          Back to admin
        </Link>
        <a href="/api/qr?format=png" className="btn btn-secondary btn-sm gap-1.5">
          <DownloadIcon size={16} /> PNG
        </a>
        <a href="/api/qr?format=svg" className="btn btn-secondary btn-sm gap-1.5">
          <DownloadIcon size={16} /> SVG
        </a>
      </ScreenControls>
      {site.warning && (
        <p className="alert alert-warn fixed bottom-4 left-4 z-50 max-w-md text-sm" role="status">
          {site.warning}
        </p>
      )}
      <QrSlide matrix={qrMatrix(site.url)} url={site.url} />
    </main>
  );
}
