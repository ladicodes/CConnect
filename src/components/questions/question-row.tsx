import Link from "next/link";
import type { PublicQuestion } from "@/lib/public-data";
import { timeAgo } from "@/lib/format";
import { SupportButton } from "@/components/questions/support-button";
import { AnswerBadge } from "@/components/status";

export function QuestionRow({
  question,
  supported,
  now,
  showSession = false,
}: {
  question: PublicQuestion;
  supported: boolean;
  now: number;
  showSession?: boolean;
}) {
  return (
    <li className="flex items-start gap-4 py-5">
      <div className="min-w-0 flex-1">
        <Link
          href={`/questions/${question.id}`}
          className="group block rounded-sm text-[1.0625rem] font-medium leading-[1.45] text-ink"
        >
          <span className="line-clamp-5 whitespace-pre-line break-words group-hover:text-navy">{question.body}</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-muted">
          <AnswerBadge status={question.answerStatus} hideOpen />
          {question.contextCount > 0 && (
            <span>
              {question.contextCount} context {question.contextCount === 1 ? "note" : "notes"}
            </span>
          )}
          {showSession && question.sessionTitle ? <span>{question.sessionTitle}</span> : null}
          <span>{timeAgo(question.publishedAt, now)}</span>
        </div>
      </div>
      <SupportButton questionId={question.id} initialSupported={supported} initialCount={question.supportCount} />
    </li>
  );
}
