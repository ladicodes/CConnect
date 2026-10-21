"use client";

import { useState } from "react";
import type { AdminTestimony, TestimonyStatus, TestimonyTab } from "@/lib/admin-data";
import { archiveTestimonies, deleteTestimonies, setTestimonyStatus } from "@/app/admin/actions";
import { ConfirmDialog, useAdminAction } from "@/components/admin/feedback";
import { formatDateTime } from "@/lib/format";
import { CheckIcon, LockIcon } from "@/components/icons";

const STATUS_LABEL: Record<TestimonyStatus, string> = {
  pending: "Needs review",
  published: "Published",
  private: "Kept private",
  rejected: "Rejected",
};

export function TestimonyList({ tab, testimonies, timeZone }: { tab: TestimonyTab; testimonies: AdminTestimony[]; timeZone: string }) {
  const { pending, perform } = useAdminAction();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);

  const byId = new Map(testimonies.map((t) => [t.id, t]));
  const selection = [...checked].filter((id) => byId.has(id));
  const publishable = selection.filter((id) => byId.get(id)?.shareConsent);
  const clear = () => setChecked(new Set());
  const status = (ids: string[], next: TestimonyStatus) => perform(() => setTestimonyStatus({ ids, status: next }), (r) => r.ok && clear());
  const archive = (ids: string[], archived: boolean) => perform(() => archiveTestimonies({ ids, archived }), (r) => r.ok && clear());

  return (
    <>
      <ul className="divide-y divide-line border-b border-line">
        {testimonies.map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <input
              type="checkbox"
              aria-label="Select message"
              checked={checked.has(item.id)}
              onChange={() =>
                setChecked((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
              className="mt-1 size-4 shrink-0 accent-navy"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
                <span className={`badge ${item.kind === "testimony" ? "badge-pending" : "badge-neutral"}`}>
                  {item.kind === "testimony" ? "Testimony" : "Thanksgiving"}
                </span>
                <span className={`badge ${item.status === "published" ? "badge-public" : "badge-neutral"}`}>{STATUS_LABEL[item.status]}</span>
                {item.shareConsent ? (
                  <span className="badge badge-answered">
                    <CheckIcon size={12} strokeWidth={2.6} />
                    May be shared publicly
                  </span>
                ) : (
                  <span className="badge badge-neutral">
                    <LockIcon size={12} strokeWidth={2.2} />
                    Leaders only
                  </span>
                )}
                <span>{formatDateTime(item.createdAt, timeZone)}</span>
              </div>
              <p className="mt-2 max-w-3xl whitespace-pre-line break-words leading-relaxed text-ink">{item.body}</p>
              <p className="mt-1.5 text-[0.8125rem] text-muted">
                Name to show: <span className="font-semibold text-ink-2">{item.displayName || "Anonymous"}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {item.status !== "published" &&
                  (item.shareConsent ? (
                    <button type="button" className="btn btn-secondary btn-xs" disabled={pending} onClick={() => status([item.id], "published")}>
                      Publish
                    </button>
                  ) : (
                    <span className="text-[0.8125rem] text-muted">Can&rsquo;t be published: the person asked to keep it private.</span>
                  ))}
                {item.status === "published" && (
                  <button type="button" className="btn btn-secondary btn-xs" disabled={pending} onClick={() => status([item.id], "private")}>
                    Unpublish
                  </button>
                )}
                {item.status === "pending" && (
                  <>
                    <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([item.id], "private")}>
                      Keep private
                    </button>
                    <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([item.id], "rejected")}>
                      Reject
                    </button>
                  </>
                )}
                {(item.status === "private" || item.status === "rejected") && (
                  <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([item.id], "pending")}>
                    Back to review
                  </button>
                )}
                <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => archive([item.id], !item.archivedAt)}>
                  {item.archivedAt ? "Restore" : "Archive"}
                </button>
                <button type="button" className="btn btn-quiet btn-xs text-red-text" disabled={pending} onClick={() => setConfirm([item.id])}>
                  Delete…
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {selection.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="enter fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-xl bg-ink p-2.5 pl-4 text-white shadow-[0_12px_40px_rgb(29_31_34/0.35)] lg:left-[calc(15.5rem+1.5rem)] lg:right-6"
        >
          <span className="mr-auto text-sm font-semibold">{selection.length} selected</span>
          {tab !== "published" && (
            <button
              type="button"
              className="btn btn-xs bg-white text-navy"
              disabled={pending || publishable.length === 0}
              title={publishable.length < selection.length ? "Only items with permission to share will be published" : undefined}
              onClick={() => status(publishable, "published")}
            >
              Publish {publishable.length < selection.length ? `(${publishable.length} allowed)` : ""}
            </button>
          )}
          <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => status(selection, "private")}>
            Keep private
          </button>
          <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => archive(selection, tab !== "archived")}>
            {tab === "archived" ? "Restore" : "Archive"}
          </button>
          <button type="button" className="btn btn-xs bg-red-text text-white" disabled={pending} onClick={() => setConfirm(selection)}>
            Delete…
          </button>
          <button type="button" className="btn btn-xs text-white/80" onClick={clear}>
            Clear
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} messages?` : "Delete this message?"}
        body="This permanently removes it. It can't be undone."
        confirmLabel="Delete permanently"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const ids = confirm ?? [];
          setConfirm(null);
          perform(() => deleteTestimonies({ ids }), (r) => r.ok && clear());
        }}
      />
    </>
  );
}
