"use client";

import { useState } from "react";
import type { AdminPrayer, PrayerStatus, PrayerTab } from "@/lib/admin-data";
import { archivePrayers, deletePrayers, setPrayerStatus } from "@/app/admin/actions";
import { ConfirmDialog, useAdminAction } from "@/components/admin/feedback";
import { formatDateTime } from "@/lib/format";

const STATUS_BADGE: Record<PrayerStatus, { label: string; className: string }> = {
  new: { label: "New", className: "badge badge-pending badge-dot" },
  prayed: { label: "Prayed for", className: "badge badge-prayer" },
  addressed: { label: "Addressed", className: "badge badge-neutral" },
};

export function PrayerList({ tab, prayers, timeZone }: { tab: PrayerTab; prayers: AdminPrayer[]; timeZone: string }) {
  const { pending, perform } = useAdminAction();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);

  const visible = new Set(prayers.map((p) => p.id));
  const selection = [...checked].filter((id) => visible.has(id));
  const clear = () => setChecked(new Set());
  const status = (ids: string[], next: PrayerStatus) => perform(() => setPrayerStatus({ ids, status: next }), (r) => r.ok && clear());
  const archive = (ids: string[], archived: boolean) => perform(() => archivePrayers({ ids, archived }), (r) => r.ok && clear());

  return (
    <>
      <ul className="divide-y divide-line border-b border-line">
        {prayers.map((prayer) => {
          const badge = STATUS_BADGE[prayer.status];
          return (
            <li key={prayer.id} className="flex gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <input
                type="checkbox"
                aria-label="Select prayer request"
                checked={checked.has(prayer.id)}
                onChange={() =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (next.has(prayer.id)) next.delete(prayer.id);
                    else next.add(prayer.id);
                    return next;
                  })
                }
                className="mt-1 size-4 shrink-0 accent-navy"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
                  <span className={badge.className}>{badge.label}</span>
                  <span>{formatDateTime(prayer.createdAt, timeZone)}</span>
                  {prayer.archivedAt && <span className="badge badge-neutral">Archived</span>}
                </div>
                <p className="mt-2 max-w-3xl whitespace-pre-line break-words text-[1rem] leading-relaxed text-ink">{prayer.body}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {prayer.status !== "prayed" && (
                    <button type="button" className="btn btn-secondary btn-xs" disabled={pending} onClick={() => status([prayer.id], "prayed")}>
                      Mark prayed for
                    </button>
                  )}
                  {prayer.status !== "addressed" && (
                    <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([prayer.id], "addressed")}>
                      Mark addressed
                    </button>
                  )}
                  {prayer.status !== "new" && (
                    <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => status([prayer.id], "new")}>
                      Mark new
                    </button>
                  )}
                  <button type="button" className="btn btn-quiet btn-xs" disabled={pending} onClick={() => archive([prayer.id], !prayer.archivedAt)}>
                    {prayer.archivedAt ? "Restore" : "Archive"}
                  </button>
                  <button type="button" className="btn btn-quiet btn-xs text-red-text" disabled={pending} onClick={() => setConfirm([prayer.id])}>
                    Delete…
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {selection.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="enter fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-xl bg-ink p-2.5 pl-4 text-white shadow-[0_12px_40px_rgb(29_31_34/0.35)] lg:left-[calc(15.5rem+1.5rem)] lg:right-6"
        >
          <span className="mr-auto text-sm font-semibold">{selection.length} selected</span>
          <button type="button" className="btn btn-xs bg-white text-navy" disabled={pending} onClick={() => status(selection, "prayed")}>
            Mark prayed for
          </button>
          <button type="button" className="btn btn-xs bg-white/10 text-white hover:bg-white/20" disabled={pending} onClick={() => status(selection, "addressed")}>
            Mark addressed
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
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} prayer requests?` : "Delete this prayer request?"}
        body="This permanently removes the request. It can't be undone. To keep it but take it out of the list, archive it instead."
        confirmLabel="Delete permanently"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const ids = confirm ?? [];
          setConfirm(null);
          perform(() => deletePrayers({ ids }), (r) => r.ok && clear());
        }}
      />
    </>
  );
}
