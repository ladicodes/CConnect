import "server-only";

/**
 * The time at which this request is being rendered. Server Components that
 * show relative times ("8 min ago") render once per request (they always sit
 * behind a runtime API), so reading the clock here is deterministic for that
 * render and never re-runs on the client.
 */
export function requestTime(): number {
  return Date.now();
}
