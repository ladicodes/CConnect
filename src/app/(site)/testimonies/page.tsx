import type { Metadata } from "next";
import Link from "next/link";
import { requestTime } from "@/lib/request-time";
import { Suspense } from "react";
import { connection } from "next/server";
import { listPublicTestimonies, type PublicTestimony } from "@/lib/public-data";
import { DataUnavailable, loadOrNull } from "@/components/data-unavailable";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Testimonies" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 20;

export default function TestimoniesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="shell-narrow pt-8 md:pt-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">
            <span className="tick" style={{ ["--tick" as string]: "var(--color-yellow)" }} />
            Thanksgiving &amp; testimonies
          </p>
          <h1 className="display mt-3 text-[2.6rem] md:text-[3.5rem]">What God has done</h1>
        </div>
        <Link href="/testimonies/share" className="btn btn-primary btn-sm shrink-0 sm:mb-2">
          Share yours
        </Link>
      </header>
      <p className="mt-4 max-w-xl text-[1.0625rem] text-ink-2">
        Shared by members who chose to make them public, after review by church leaders.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <Testimonies searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Testimonies({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await connection();
  const raw = Array.isArray(params.limit) ? params.limit[0] : params.limit;
  const limit = Math.min(Math.max(Number(raw) || PAGE, PAGE), 200);
  const result = await loadOrNull("testimonies", () => listPublicTestimonies(limit));
  if ("error" in result) return <DataUnavailable error={result.error} what="testimonies" />;
  const { testimonies, hasMore } = result.data;
  const now = requestTime();

  if (testimonies.length === 0) {
    return (
      <div className="mt-10 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
        <span className="tick tick-lg mx-auto mb-4 block" style={{ ["--tick" as string]: "var(--color-yellow)" }} aria-hidden />
        <p className="font-display text-xl font-semibold">No testimonies shared yet</p>
        <p className="mx-auto mt-2 max-w-sm text-ink-2">
          When members share a thanksgiving or testimony and agree to it being published, it may appear here.
        </p>
        <Link href="/testimonies/share" className="btn btn-primary btn-sm mt-6">
          Share yours
        </Link>
      </div>
    );
  }

  const [featured, ...rest] = testimonies;
  return (
    <>
      <Featured testimony={featured} now={now} />
      {rest.length > 0 && (
        <ol className="hairline border-t border-line">
          {rest.map((testimony) => (
            <li key={testimony.id} className="py-7">
              <p className="whitespace-pre-line break-words text-[1.0625rem] leading-relaxed text-ink">{testimony.body}</p>
              <Attribution testimony={testimony} now={now} />
            </li>
          ))}
        </ol>
      )}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Link href={`/testimonies?limit=${limit + PAGE}`} scroll={false} className="btn btn-secondary btn-sm">
            Show more
          </Link>
        </div>
      )}
    </>
  );
}

function Featured({ testimony, now }: { testimony: PublicTestimony; now: number }) {
  return (
    <figure className="relative my-10 pl-6 md:pl-8">
      <span aria-hidden className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-yellow" />
      <blockquote className="whitespace-pre-line break-words font-display text-[1.5rem] font-medium leading-[1.3] tracking-[-0.01em] md:text-[1.875rem]">
        {testimony.body}
      </blockquote>
      <figcaption>
        <Attribution testimony={testimony} now={now} />
      </figcaption>
    </figure>
  );
}

function Attribution({ testimony, now }: { testimony: PublicTestimony; now: number }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span className={`badge ${testimony.kind === "testimony" ? "badge-pending" : "badge-neutral"}`}>
        {testimony.kind === "testimony" ? "Testimony" : "Thanksgiving"}
      </span>
      <span className="font-semibold text-ink-2">{testimony.displayName || "Anonymous"}</span>
      <span>{timeAgo(testimony.publishedAt, now)}</span>
    </p>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-10 space-y-8" aria-hidden="true">
      <div className="space-y-3">
        <div className="skeleton h-7 w-full" />
        <div className="skeleton h-7 w-4/5" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}
