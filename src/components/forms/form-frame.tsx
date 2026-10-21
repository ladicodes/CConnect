import { connection } from "next/server";
import { FocusHeader } from "@/components/site/chrome";
import { turnstileConfig } from "@/lib/env";
import { getActiveSession, type ActiveSession } from "@/lib/public-data";
import { LiveDot } from "@/components/status";

export function FormFrame({
  backHref,
  backLabel,
  tick,
  eyebrow,
  title,
  intro,
  children,
}: {
  backHref: string;
  backLabel: string;
  tick: string;
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <FocusHeader backHref={backHref} backLabel={backLabel} />
      <main id="main" className="shell-narrow pb-6 pt-8 md:pt-12">
        <p className="eyebrow">
          <span className="tick" style={{ ["--tick" as string]: tick }} />
          {eyebrow}
        </p>
        <h1 className="display mt-3 text-[2.4rem] md:text-[3.25rem]">{title}</h1>
        <div className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">{intro}</div>
        <div className="mt-8">{children}</div>
      </main>
    </>
  );
}

/** Runtime settings the forms need. Read per request, never at build time. */
export async function formRuntime(): Promise<{ turnstileSiteKey: string | null; session: ActiveSession | null }> {
  await connection();
  const turnstile = turnstileConfig();
  const session = await getActiveSession().catch(() => null);
  return { turnstileSiteKey: turnstile.enabled ? turnstile.siteKey : null, session };
}

export function SessionNote({ session, none }: { session: ActiveSession | null; none: string }) {
  if (!session) return <p className="mb-5 text-sm text-muted">{none}</p>;
  return (
    <p className="pill mb-5">
      <LiveDot />
      For {session.title} (live now)
    </p>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-13 w-full" />
    </div>
  );
}
