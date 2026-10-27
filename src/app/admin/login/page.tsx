import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getStaff } from "@/lib/auth";
import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/logo";
import { AlertIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Leaders sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, string> = {
  "not-authorised": "This account doesn't have access to Connect-Ask admin. Ask an administrator to add you.",
  unavailable: "Sign-in is temporarily unavailable. Please try again in a moment.",
};

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[25rem]">
        <Link href="/" className="mx-auto mb-10 block w-fit rounded-md" aria-label="Connect-Ask home">
          <Logo height={56} eager />
        </Link>
        <div className="panel p-6 sm:p-8">
          <p className="eyebrow">
            <span className="tick" />
            Connect-Ask admin
          </p>
          <h1 className="mt-2 text-[1.875rem]">Leaders sign in</h1>
          <p className="mb-6 mt-2 text-[0.9375rem] text-ink-2">
            Access is by invitation from an administrator. There is no public sign-up.
          </p>
          {/* The form is rendered once and never swapped out, so nothing typed
              into it can be lost while the rest of the page loads. */}
          <Suspense fallback={null}>
            <LoginNotice searchParams={searchParams} />
          </Suspense>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/" className="font-semibold text-navy hover:underline">
            Back to Connect-Ask
          </Link>
        </p>
      </div>
    </main>
  );
}

async function LoginNotice({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const lookup = await getStaff();
  if (lookup.status === "staff") redirect("/admin");
  const key = Array.isArray(params.error) ? params.error[0] : params.error;
  const notice = key ? NOTICES[key] : undefined;
  if (!notice) return null;
  return (
    <div role="alert" className="alert alert-error mb-5">
      <AlertIcon />
      <p>{notice}</p>
    </div>
  );
}
