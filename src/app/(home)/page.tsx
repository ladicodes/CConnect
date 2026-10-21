import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getActiveSession, listPublicQuestions, type PublicQuestion } from "@/lib/public-data";
import { plural } from "@/lib/format";
import { ChevronRight, HeartIcon, LockIcon, NoteIcon, SunriseIcon } from "@/components/icons";
import { AnswerBadge, LiveDot } from "@/components/status";

export default function HomePage() {
  return (
    <>
      <section className="shell grid gap-12 pb-4 pt-9 md:pt-14 lg:grid-cols-12 lg:gap-16 lg:pt-20">
        <div className="lg:col-span-7">
          <Suspense fallback={<div className="h-8" />}>
            <ServiceLine />
          </Suspense>
          <h1 className="display mt-5 text-[clamp(2.6rem,9.5vw,4.9rem)] text-ink">
            Ask what you&rsquo;ve been wondering<span className="text-red">.</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-[1.125rem] leading-relaxed text-ink-2 md:text-[1.1875rem]">
            Send an anonymous question about the message, share a prayer request, or tell us what God has done. No
            account needed.
          </p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
            <Link href="/ask" className="btn btn-primary sm:min-w-[13rem]">
              Ask a question
            </Link>
            <Link href="/questions" className="btn btn-secondary sm:min-w-[13rem]">
              Explore questions
            </Link>
          </div>
          <p className="mt-5 flex items-start gap-2 text-sm text-muted">
            <LockIcon size={16} className="mt-0.5 shrink-0" />
            <span>Anonymous. Church leaders review every question before it&rsquo;s shared on the board.</span>
          </p>
        </div>

        <aside className="lg:col-span-5 lg:pt-3" aria-labelledby="being-asked">
          <Suspense fallback={<PreviewSkeleton />}>
            <BeingAsked />
          </Suspense>
        </aside>
      </section>

      <section className="shell mt-16 md:mt-24" aria-labelledby="ways">
        <h2 id="ways" className="eyebrow">
          More ways to take part
        </h2>
        <ul className="mt-4 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
          <Way
            href="/context"
            colour="var(--color-cyan)"
            Icon={NoteIcon}
            title="Add context"
            text="Share an insight, a scripture or a clarification about the service."
          />
          <Way
            href="/prayer"
            colour="var(--color-green)"
            Icon={HeartIcon}
            title="Prayer request"
            text="Share what you'd like church leaders to pray about. It stays private."
          />
          <Way
            href="/testimonies/share"
            colour="var(--color-yellow)"
            Icon={SunriseIcon}
            title="Thanksgiving & testimony"
            text="Tell us what you're grateful for or what God has done."
          />
        </ul>
      </section>

      <section className="shell mt-16 md:mt-20" aria-labelledby="promises">
        <h2 id="promises" className="visually-hidden">
          How Connect-Ask looks after you
        </h2>
        <dl className="grid gap-8 sm:grid-cols-3">
          <Assurance colour="var(--color-navy)" title="No account, no names">
            You don&rsquo;t sign up or log in, and we never ask who you are.
          </Assurance>
          <Assurance colour="var(--color-red)" title="Reviewed before it’s shared">
            Nothing appears publicly until a church leader has read it. Not everything is published.
          </Assurance>
          <Assurance colour="var(--color-green)" title="Prayer stays private">
            Prayer requests are only ever seen by church leaders. They are never shown publicly.
          </Assurance>
        </dl>
      </section>
    </>
  );
}

async function ServiceLine() {
  await connection();
  const session = await getActiveSession().catch(() => null);
  if (!session) {
    return (
      <p className="eyebrow">
        <span className="tick" style={{ ["--tick" as string]: "var(--color-red)" }} />
        Covenant Connect
      </p>
    );
  }
  return (
    <p className="pill">
      <LiveDot />
      <span>
        <span className="visually-hidden">Live now: </span>
        {session.title}
      </span>
    </p>
  );
}

async function loadPreview(): Promise<{ heading: string; questions: PublicQuestion[] } | null> {
  try {
    const session = await getActiveSession();
    if (session) {
      const { questions } = await listPublicQuestions(
        { scope: "current", filter: "all", sort: "support", search: "", limit: 3 },
        session.id,
      );
      if (questions.length > 0) return { heading: "Being asked today", questions };
    }
    const { questions } = await listPublicQuestions(
      { scope: "all", filter: "all", sort: session ? "newest" : "support", search: "", limit: 3 },
      null,
    );
    return { heading: session ? "Recently asked" : "From the Question Board", questions };
  } catch {
    return null;
  }
}

async function BeingAsked() {
  await connection();
  const preview = await loadPreview();
  return (
    <div className="panel px-5 pb-2 pt-5 sm:px-6">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <h2 id="being-asked" className="eyebrow">
          <span className="tick" />
          {preview?.heading ?? "From the Question Board"}
        </h2>
        <Link href="/questions" className="inline-flex min-h-10 items-center gap-0.5 text-sm font-semibold text-navy">
          See all <ChevronRight size={16} />
        </Link>
      </div>
      {!preview ? (
        <p className="py-6 text-ink-2">Questions can&rsquo;t be loaded right now. Please try again shortly.</p>
      ) : preview.questions.length === 0 ? (
        <p className="py-6 text-ink-2">
          No questions have been shared yet. Questions appear here once church leaders have reviewed them.
        </p>
      ) : (
        <ol className="hairline">
          {preview.questions.map((question) => (
            <li key={question.id}>
              <Link href={`/questions/${question.id}`} className="group block rounded-sm py-4">
                <p className="line-clamp-3 text-[1.0625rem] font-medium leading-snug text-ink group-hover:text-navy">
                  {question.body}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
                  <span className="font-semibold text-magenta-text">
                    {question.supportCount > 0
                      ? `${plural(question.supportCount, "person", "people")} ${question.supportCount === 1 ? "has" : "have"} this too`
                      : "Be the first to say “me too”"}
                  </span>
                  <AnswerBadge status={question.answerStatus} hideOpen />
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="panel space-y-5 p-6" aria-hidden="true">
      <div className="skeleton h-4 w-40" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function Way({
  href,
  colour,
  Icon,
  title,
  text,
}: {
  href: string;
  colour: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <li className="border-line [&:not(:first-child)]:border-t md:px-6 md:first:pl-0 md:last:pr-0 md:[&:not(:first-child)]:border-t-0">
      <Link
        href={href}
        className="group flex h-full items-start gap-4 rounded-sm py-5 transition-colors md:flex-col md:gap-5 md:py-7"
      >
        <span className="mt-1 flex items-center gap-2 md:mt-0">
          <span className="tick tick-lg" style={{ ["--tick" as string]: colour }} />
          <Icon size={22} className="text-ink-2 md:hidden" />
        </span>
        <span className="flex-1">
          <span className="flex items-center justify-between gap-2 text-[1.0625rem] font-semibold text-ink group-hover:text-navy">
            {title}
            <ChevronRight size={18} className="text-muted transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-[0.9375rem] leading-snug text-ink-2">{text}</span>
        </span>
      </Link>
    </li>
  );
}

function Assurance({ colour, title, children }: { colour: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-2.5 font-display text-[1.1875rem] font-semibold text-ink">
        <span className="tick" style={{ ["--tick" as string]: colour }} />
        {title}
      </dt>
      <dd className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}
