import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="shell-narrow flex min-h-dvh flex-col justify-center py-16">
      <Logo height={52} />
      <p className="eyebrow mt-12">
        <span className="tick" style={{ ["--tick" as string]: "var(--color-red)" }} />
        Page not found
      </p>
      <h1 className="display mt-3 text-[2.4rem] md:text-[3rem]">We couldn&rsquo;t find that page.</h1>
      <p className="mt-4 max-w-md text-[1.0625rem] text-ink-2">
        The link may be incomplete, or the page may have moved. Everything you need is on the home page.
      </p>
      <div className="mt-8 grid gap-3 sm:flex">
        <Link href="/" className="btn btn-primary">
          Go to home
        </Link>
        <Link href="/questions" className="btn btn-secondary">
          Browse questions
        </Link>
      </div>
    </main>
  );
}
