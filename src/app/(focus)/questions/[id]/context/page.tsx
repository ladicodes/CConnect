import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { FormFrame, FormSkeleton, formRuntime } from "@/components/forms/form-frame";
import { DataUnavailable, loadOrNull } from "@/components/data-unavailable";
import { MessageForm } from "@/components/forms/message-form";
import { getPublicQuestion } from "@/lib/public-data";
import { LIMITS } from "@/lib/text";

export const metadata: Metadata = { title: "Add context" };

type Params = Promise<{ id: string }>;

export default function LinkedContextPage({ params }: { params: Params }) {
  return (
    <FormFrame
      backHref="/questions"
      backLabel="Questions"
      tick="var(--color-cyan)"
      eyebrow="Context for a question"
      title="Add context"
      intro={<p>Your note will be attached to this question. Church leaders review it before it&rsquo;s shared.</p>}
    >
      <Suspense fallback={<FormSkeleton />}>
        <LinkedContextForm params={params} />
      </Suspense>
    </FormFrame>
  );
}

async function LinkedContextForm({ params }: { params: Params }) {
  const { id } = await params;
  await connection();
  const result = await loadOrNull("context-question", () => getPublicQuestion(id));
  if ("error" in result) return <DataUnavailable error={result.error} what="this question" />;
  const question = result.data;
  if (!question) notFound();
  const { turnstileSiteKey } = await formRuntime();
  return (
    <>
      <figure className="mb-7 border-l-[3px] border-navy pl-4">
        <figcaption className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-muted">The question</figcaption>
        <blockquote className="mt-1.5 whitespace-pre-line break-words font-display text-[1.25rem] font-semibold leading-snug">
          {question.body}
        </blockquote>
      </figure>
      <MessageForm
        endpoint="/api/context"
        storageKey={`connect-ask:draft:context:${question.id}`}
        label="Your context"
        placeholder="e.g. A verse that helped me with this is…"
        hint="Anonymous. Please don’t include other people’s names."
        max={LIMITS.context}
        noun="note"
        submitLabel="Send context"
        extraPayload={{ questionId: question.id }}
        turnstileSiteKey={turnstileSiteKey}
        success={{
          title: "Thank you for adding context.",
          body: "Church leaders will review it. If it’s approved, it will appear under this question.",
          primary: { href: `/questions/${question.id}`, label: "Back to the question" },
          againLabel: "Add more context",
          ticks: ["var(--color-cyan)", "var(--color-navy)", "var(--color-green)"],
        }}
      />
    </>
  );
}
