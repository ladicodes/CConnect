import type { Metadata } from "next";
import { Suspense } from "react";
import { FormFrame, FormSkeleton, SessionNote, formRuntime } from "@/components/forms/form-frame";
import { MessageForm } from "@/components/forms/message-form";
import { LIMITS } from "@/lib/text";

export const metadata: Metadata = { title: "Ask a question" };

export default function AskPage() {
  return (
    <FormFrame
      backHref="/"
      backLabel="Home"
      tick="var(--color-navy)"
      eyebrow="Anonymous question"
      title="Ask a question"
      intro={
        <p>
          We never ask for your name. Church leaders read every question, and some are shared on the Question Board for
          others to see.
        </p>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <AskForm />
      </Suspense>
    </FormFrame>
  );
}

async function AskForm() {
  const { session, turnstileSiteKey } = await formRuntime();
  return (
    <>
      <SessionNote session={session} none="No service is live right now. Leaders will still see your question." />
      <MessageForm
        endpoint="/api/questions"
        storageKey="connect-ask:draft:question"
        label="Your question"
        placeholder="e.g. How does today’s message apply when…"
        hint="Please don’t include other people’s names."
        max={LIMITS.question}
        noun="question"
        submitLabel="Send question"
        turnstileSiteKey={turnstileSiteKey}
        success={{
          title: "Your question was received.",
          body: "Church leaders will read it. If it’s shared on the Question Board, others can say they have the same question.",
          primary: { href: "/questions", label: "Explore questions" },
          againLabel: "Ask another question",
          ticks: ["var(--color-navy)", "var(--color-magenta)", "var(--color-cyan)"],
        }}
      />
    </>
  );
}
