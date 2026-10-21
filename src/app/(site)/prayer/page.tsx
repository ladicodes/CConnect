import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton, formRuntime } from "@/components/forms/form-frame";
import { MessageForm } from "@/components/forms/message-form";
import { LockIcon } from "@/components/icons";
import { LIMITS } from "@/lib/text";

export const metadata: Metadata = { title: "Prayer request" };

export default function PrayerPage() {
  return (
    <div className="shell-narrow pt-8 md:pt-12">
      <p className="eyebrow">
        <span className="tick" style={{ ["--tick" as string]: "var(--color-green)" }} />
        Prayer request
      </p>
      <h1 className="display mt-3 text-[2.4rem] md:text-[3.25rem]">What can we pray about?</h1>
      <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">
        Share what&rsquo;s on your heart with church leaders. You don&rsquo;t need to give your name.
      </p>

      <div className="mt-6 flex gap-3 rounded-lg border border-green/40 bg-green-tint px-4 py-3.5 text-[0.9375rem] text-ink">
        <LockIcon size={18} className="mt-0.5 shrink-0 text-green-text" />
        <p>
          <strong className="font-semibold">Private to church leaders.</strong> Prayer requests are never shown on the
          website, the Question Board or the screens in church.
        </p>
      </div>

      <div className="mt-8">
        <Suspense fallback={<FormSkeleton />}>
          <PrayerForm />
        </Suspense>
      </div>
    </div>
  );
}

async function PrayerForm() {
  const { turnstileSiteKey } = await formRuntime();
  return (
    <MessageForm
      endpoint="/api/prayer"
      storageKey="connect-ask:draft:prayer"
      label="Your prayer request"
      placeholder="e.g. Please pray for my family as we…"
      hint="Only share what you're comfortable with. Leaders can't reply, as we don't collect contact details."
      max={LIMITS.prayer}
      noun="prayer request"
      submitLabel="Send prayer request"
      rows={7}
      stickySubmit={false}
      turnstileSiteKey={turnstileSiteKey}
      success={{
        title: "Your prayer request was received.",
        body: "It has been shared privately with church leaders and won't be shown publicly. If you'd like to talk with someone, please speak to a leader at church.",
        primary: { href: "/", label: "Back to home" },
        againLabel: "Send another request",
        ticks: ["var(--color-green)", "var(--color-navy)", "var(--color-green)"],
      }}
    />
  );
}
