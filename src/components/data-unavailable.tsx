import { DatabaseNotConfiguredError } from "@/lib/db";
import { errorKind, logEvent } from "@/lib/log";
import { AlertIcon } from "@/components/icons";

/** Loads data for a page section, returning null (and logging) instead of crashing the page. */
export async function loadOrNull<T>(label: string, load: () => Promise<T>): Promise<{ data: T } | { error: unknown }> {
  try {
    return { data: await load() };
  } catch (error) {
    logEvent("error", "PAGE_DATA_FAILED", { section: label, error: errorKind(error) });
    return { error };
  }
}

export function DataUnavailable({ error, what = "this" }: { error: unknown; what?: string }) {
  const notConfigured = error instanceof DatabaseNotConfiguredError;
  const development = process.env.NODE_ENV !== "production";
  return (
    <div role="alert" className="alert alert-error my-6">
      <AlertIcon />
      <div>
        <p className="font-semibold">We can&rsquo;t load {what} right now.</p>
        <p className="mt-1">Please try again in a moment.</p>
        {development && notConfigured && (
          <p className="mt-2 text-sm">
            Developer note: no database is configured. Run <code className="font-semibold">npm run dev</code> (it starts a
            local database automatically) or set <code className="font-semibold">DATABASE_URL</code> in{" "}
            <code className="font-semibold">.env.local</code>.
          </p>
        )}
      </div>
    </div>
  );
}
