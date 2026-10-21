import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormFrame, FormSkeleton, SessionNote, formRuntime } from "@/components/forms/form-frame";
import { MessageForm } from "@/components/forms/message-form";
import { LIMITS } from "@/lib/text";

export const metadata: Metadata = { title: "Add context" };

export default function ContextPage() {
  return (
    <FormFrame
      backHref="/"
      backLabel="Home"
      tick="var(--color-cyan)"
      eyebrow="Context"
      title="Add context"
      intro={
        <>
          <p>
            Share an insight, a scripture reference or a clarification about the service. Church leaders review every
            contribution before anything is shared.
          </p>
          <p className="mt-3 text-[0.9375rem] text-muted">
            Adding to a particular question? Open it on the{" "}
            <Link href="/questions" className="link">
              Question Board
            </Link>{" "}
            and choose &ldquo;Add context&rdquo;.
          </p>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <ContextForm />
      </Suspense>
    </FormFrame>
  );
}

async function ContextForm() {
  const { session, turnstileSiteKey } = await formRuntime();
  return (
    <>
      <SessionNote session={session} none="No service is live right now. Leaders will still see your note." />
      <MessageForm
        endpoint="/api/context"
        storageKey="connect-ask:draft:context"
        label="Your context"
        placeholder="e.g. The verse on the screen during the second point was…"
        hint="Anonymous. Please don’t include other people’s names."
        max={LIMITS.context}
        noun="note"
        submitLabel="Send context"
        turnstileSiteKey={turnstileSiteKey}
        success={{
          title: "Thank you for adding context.",
          body: "Church leaders will review it before anything is shared.",
          primary: { href: "/questions", label: "Explore questions" },
          againLabel: "Add more context",
          ticks: ["var(--color-cyan)", "var(--color-navy)", "var(--color-green)"],
        }}
      />
    </>
  );
}
