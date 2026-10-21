"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell-narrow flex min-h-[70dvh] flex-col justify-center py-16">
      <p className="eyebrow">
        <span className="tick" style={{ ["--tick" as string]: "var(--color-red)" }} />
        Something went wrong
      </p>
      <h1 className="display mt-3 text-[2.2rem] md:text-[2.75rem]">This page didn&rsquo;t load properly.</h1>
      <p className="mt-4 max-w-md text-[1.0625rem] text-ink-2">
        It&rsquo;s usually temporary, often a weak connection. Please try again. Anything you were typing in a form is
        still saved on this device.
      </p>
      <div className="mt-8 grid gap-3 sm:flex">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Go to home
        </Link>
      </div>
    </main>
  );
}
