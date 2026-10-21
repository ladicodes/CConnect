import type { Metadata } from "next";
import Link from "next/link";
import { requestTime } from "@/lib/request-time";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { ANON_COOKIE, getPublicQuestion, listPublicContext, supportedQuestionIds } from "@/lib/public-data";
import { timeAgo } from "@/lib/format";
import { DataUnavailable, loadOrNull } from "@/components/data-unavailable";
import { SupportButton } from "@/components/questions/support-button";
import { ShareButton } from "@/components/questions/share-button";
import { AnswerBadge, LiveDot } from "@/components/status";
import { ChevronLeft, PlusIcon } from "@/components/icons";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = { title: "Question" };

export default function QuestionPage({ params }: { params: Params }) {
  return (
    <div className="shell-narrow pt-4 md:pt-8">
      <Link href="/questions" className="btn btn-quiet -ml-2 gap-1 text-[0.9375rem]">
        <ChevronLeft size={18} />
        All questions
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <QuestionDetail params={params} />
      </Suspense>
    </div>
  );
}

async function QuestionDetail({ params }: { params: Params }) {
  const { id } = await params;
  await connection();
  // Only public, unarchived questions resolve. Hidden or private ones 404.
  const cookie = (await cookies()).get(ANON_COOKIE)?.value;
  const result = await loadOrNull("question", async () => {
    const found = await getPublicQuestion(id);
    if (!found) return null;
    const [notes, ids] = await Promise.all([listPublicContext(found.id), supportedQuestionIds(cookie, [found.id])]);
    return { question: found, context: notes, supported: ids };
  });
  if ("error" in result) return <DataUnavailable error={result.error} what="this question" />;
  if (!result.data) notFound();
  const { question, context, supported } = result.data;
  const now = requestTime();

  return (
    <article className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        {question.sessionTitle && (
          <span className="inline-flex items-center gap-2 font-semibold text-ink-2">
            {question.sessionIsActive && <LiveDot />}
            {question.sessionTitle}
          </span>
        )}
        <AnswerBadge status={question.answerStatus} />
        <span>Shared {timeAgo(question.publishedAt, now)}</span>
      </div>

      <h1 className="display mt-5 whitespace-pre-line break-words text-[1.9rem] leading-[1.15] tracking-[-0.02em] md:text-[2.6rem]">
        {question.body}
      </h1>

      <div className="mt-8 flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
        <SupportButton
          questionId={question.id}
          initialSupported={supported.has(question.id)}
          initialCount={question.supportCount}
          variant="full"
        />
        <ShareButton path={`/questions/${question.id}`} title="A question on Connect-Ask" />
      </div>

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="context-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="context-heading" className="flex items-center gap-2.5 text-[1.5rem]">
            <span className="tick" style={{ ["--tick" as string]: "var(--color-cyan)" }} />
            Context
          </h2>
          <Link href={`/questions/${question.id}/context`} className="btn btn-secondary btn-sm gap-1.5">
            <PlusIcon size={17} />
            Add context
          </Link>
        </div>
        {context.length === 0 ? (
          <p className="mt-4 max-w-prose text-ink-2">
            No context has been shared for this question yet. If you have an insight, a scripture or a clarification, you can
            add it. Leaders review it first.
          </p>
        ) : (
          <ul className="mt-6 space-y-5">
            {context.map((note) => (
              <li key={note.id} className="border-l-[3px] border-cyan pl-4">
                <p className="whitespace-pre-line break-words text-[1.0625rem] leading-relaxed text-ink">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-hidden="true">
      <div className="skeleton h-4 w-48" />
      <div className="skeleton h-9 w-full" />
      <div className="skeleton h-9 w-4/5" />
      <div className="skeleton mt-6 h-14 w-full sm:w-[22rem]" />
    </div>
  );
}
