import type { Metadata } from "next";
import { Suspense } from "react";
import { FormFrame, FormSkeleton, formRuntime } from "@/components/forms/form-frame";
import { TestimonyForm } from "@/components/forms/testimony-form";

export const metadata: Metadata = { title: "Share thanksgiving or a testimony" };

export default function ShareTestimonyPage() {
  return (
    <FormFrame
      backHref="/testimonies"
      backLabel="Testimonies"
      tick="var(--color-yellow)"
      eyebrow="Thanksgiving & testimony"
      title="Share what God has done"
      intro={
        <p>
          Share something you&rsquo;re grateful for or a testimony. You don&rsquo;t need to give your name, and you choose
          whether it may be shared publicly.
        </p>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <ShareForm />
      </Suspense>
    </FormFrame>
  );
}

async function ShareForm() {
  const { turnstileSiteKey } = await formRuntime();
  return <TestimonyForm turnstileSiteKey={turnstileSiteKey} />;
}
