import Link from "next/link";

export default function QuestionNotFound() {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="font-display text-2xl font-semibold">This question isn&rsquo;t on the board</p>
      <p className="mx-auto mt-3 max-w-md text-ink-2">
        It may have been moved, kept private by church leaders, or the link may be incomplete.
      </p>
      <Link href="/questions" className="btn btn-primary btn-sm mt-6">
        Browse questions
      </Link>
    </div>
  );
}
