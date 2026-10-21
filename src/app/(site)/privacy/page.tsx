import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="shell-narrow pt-8 md:pt-12">
      <p className="eyebrow">
        <span className="tick" />
        Privacy
      </p>
      <h1 className="display mt-3 text-[2.4rem] md:text-[3.25rem]">How Connect-Ask handles what you share</h1>
      <p className="mt-4 text-[1.0625rem] text-ink-2">
        Connect-Ask is built so you can take part without telling us who you are. This page explains, in plain words, what
        is stored and who can see it.
      </p>

      <div className="mt-10 space-y-10 text-[1.0625rem] leading-relaxed text-ink-2 [&_h2]:mb-3 [&_h2]:text-[1.375rem] [&_strong]:font-semibold [&_strong]:text-ink">
        <section>
          <h2>What we don&rsquo;t ask for</h2>
          <p>
            You don&rsquo;t create an account, and none of the forms ask for your name, email address or phone number. The
            optional name on a testimony is the only exception, and you decide what to put there.
          </p>
        </section>

        <section>
          <h2>Who can see what</h2>
          <ul className="list-disc space-y-2 pl-5 marker:text-line-strong">
            <li>
              <strong>Questions and context</strong> are read by church leaders. They appear on the public Question Board
              only if a leader approves them, and leaders can remove them at any time.
            </li>
            <li>
              <strong>Prayer requests</strong> are only ever seen by church leaders with administrator access. They are never
              published.
            </li>
            <li>
              <strong>Thanksgiving and testimonies</strong> stay with church leaders unless you chose &ldquo;Leaders may
              share it publicly&rdquo; <em>and</em> a leader approves it. Both are required.
            </li>
          </ul>
        </section>

        <section>
          <h2>The small cookie we use</h2>
          <p>
            When you send something or tap &ldquo;Me too&rdquo;, your browser receives a random code in a cookie. It lets the
            site remember which questions you&rsquo;ve supported and stops anyone flooding the forms. It contains nothing
            about you. We store only a scrambled (hashed) form of it, which can&rsquo;t be traced back to your device or to
            you. Clearing your browser&rsquo;s cookies resets it.
          </p>
        </section>

        <section>
          <h2>Network addresses</h2>
          <p>
            To protect the forms from abuse, we briefly count requests from each network using a hashed form of its address.
            The address itself is never stored, and these counts are cleared out regularly, usually within a day.
          </p>
        </section>

        <section>
          <h2>Please be careful with details</h2>
          <p>
            What you write is stored as you wrote it. If you mention names or personal details, church leaders will be able to
            read them, so please avoid naming other people.
          </p>
        </section>

        <section>
          <h2>Questions about your data</h2>
          <p>
            Because nothing is linked to your identity, we can&rsquo;t look up what a particular person sent. If something you
            shared needs to be removed, please speak to a church leader and describe what you sent.
          </p>
        </section>
      </div>
    </div>
  );
}
