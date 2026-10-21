import Link from "next/link";
import { SearchIcon } from "@/components/icons";

export function AdminHeader({
  title,
  description,
  actions,
  tick = "var(--color-navy)",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tick?: string;
}) {
  return (
    <header className="border-b border-line bg-paper px-4 pb-5 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[1.75rem] md:text-[2rem]">
            <span className="tick tick-lg" style={{ ["--tick" as string]: tick }} aria-hidden />
            {title}
          </h1>
          {description && <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function TabLinks<T extends string>({
  tabs,
  current,
  counts,
  labels,
  href,
}: {
  tabs: readonly T[];
  current: T;
  counts?: Partial<Record<T, number>>;
  labels: Record<T, string>;
  href: (tab: T) => string;
}) {
  return (
    <nav aria-label="Status" className="-mb-px flex gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
      {tabs.map((tab) => {
        const active = tab === current;
        const count = counts?.[tab];
        return (
          <Link
            key={tab}
            href={href(tab)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sm font-semibold transition-colors ${
              active ? "border-navy text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {labels[tab]}
            {count !== undefined && (
              <span className={`tabular-nums ${active ? "text-navy" : "text-muted"}`}>{count.toLocaleString("en")}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Plain GET search form: works without JavaScript and keeps other filters. */
export function SearchBox({
  action,
  value,
  keep,
  placeholder = "Search",
}: {
  action: string;
  value: string;
  keep: Record<string, string | undefined>;
  placeholder?: string;
}) {
  return (
    <form method="get" action={action} role="search" className="relative min-w-0 flex-1 sm:max-w-sm">
      {Object.entries(keep).map(([key, val]) => (val ? <input key={key} type="hidden" name={key} value={val} /> : null))}
      <label className="visually-hidden" htmlFor="admin-search">
        {placeholder}
      </label>
      <SearchIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        id="admin-search"
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        className="field field-sm h-10 pl-9"
        autoComplete="off"
      />
    </form>
  );
}

export function EmptyState({ title, body, tick = "var(--color-navy)" }: { title: string; body: string; tick?: string }) {
  return (
    <div className="mx-4 my-10 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center sm:mx-6 lg:mx-8">
      <span className="tick tick-lg mx-auto mb-4 block" style={{ ["--tick" as string]: tick }} aria-hidden />
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[0.9375rem] text-ink-2">{body}</p>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="border-b border-line px-4 pb-5 pt-8 sm:px-6 lg:px-8">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

export function NotPermitted() {
  return (
    <div className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-lg">
        <h1 className="text-2xl">This area is for administrators</h1>
        <p className="mt-3 text-ink-2">
          Prayer requests and testimonies are only visible to administrators. If you need access, ask an administrator to
          change your role.
        </p>
        <Link href="/admin" className="btn btn-secondary btn-sm mt-6">
          Back to overview
        </Link>
      </div>
    </div>
  );
}

export function buildHref(base: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

export function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
