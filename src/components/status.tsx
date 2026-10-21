import { CheckIcon, EyeOffIcon, LockIcon } from "@/components/icons";

export function AnswerBadge({ status, hideOpen = false }: { status: "open" | "addressing" | "answered"; hideOpen?: boolean }) {
  if (status === "answered")
    return (
      <span className="badge badge-answered">
        <CheckIcon size={13} strokeWidth={2.6} />
        Answered
      </span>
    );
  if (status === "addressing") return <span className="badge badge-addressing badge-dot">Being addressed</span>;
  if (hideOpen) return null;
  return <span className="badge badge-neutral">Open</span>;
}

export function VisibilityBadge({ visibility }: { visibility: "pending" | "public" | "private" | "hidden" }) {
  switch (visibility) {
    case "pending":
      return <span className="badge badge-pending badge-dot">Needs review</span>;
    case "public":
      return <span className="badge badge-public">On the board</span>;
    case "private":
      return (
        <span className="badge badge-neutral">
          <LockIcon size={12} strokeWidth={2.2} />
          Private
        </span>
      );
    case "hidden":
      return (
        <span className="badge badge-neutral">
          <EyeOffIcon size={12} strokeWidth={2.2} />
          Hidden
        </span>
      );
  }
}

export function LiveDot() {
  return <span className="live-dot" aria-hidden="true" />;
}
