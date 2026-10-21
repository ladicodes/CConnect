/** Small, dependency-free date helpers. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(iso: string, now: number = Date.now(), timeZone = "UTC"): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} min ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < 2 * DAY) return "yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return formatDate(iso, timeZone);
}

export function formatDate(iso: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: sameYear(iso) ? undefined : "numeric", timeZone }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** Formats a calendar date (YYYY-MM-DD) without timezone shifting. */
export function formatServiceDate(isoDate: string, style: "short" | "long" = "short"): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    timeZone: "UTC",
  }).format(date);
}

function sameYear(iso: string): boolean {
  return new Date(iso).getUTCFullYear() === new Date().getUTCFullYear();
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en")} ${count === 1 ? one : many}`;
}
