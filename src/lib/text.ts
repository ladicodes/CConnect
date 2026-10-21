/**
 * Text rules shared by the browser (instant feedback) and the server (the
 * authority). The database enforces the same limits again with CHECK
 * constraints. Lengths are counted in Unicode code points, matching Postgres.
 */

export const LIMITS = {
  question: 1000,
  context: 1000,
  prayer: 2000,
  testimony: 2000,
  displayName: 60,
  minimum: 3,
} as const;

export type SubmissionKind = "question" | "context" | "prayer" | "testimony";

// Control characters except tab and newline.
// Built from escapes so no invisible characters live in the source.
const CONTROL = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]",
  "g",
);

export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeName(input: string): string {
  return input.normalize("NFC").replace(CONTROL, "").replace(/\s+/g, " ").trim();
}

export function characterCount(input: string): number {
  return Array.from(input).length;
}

/** Rejects empty or meaningless input such as "...", "???" or "aaaaaa". */
export function isMeaningful(input: string): boolean {
  const meaningful = input.match(/[\p{L}\p{N}]/gu) ?? [];
  if (meaningful.length < 2) return false;
  const distinct = new Set(meaningful.map((c) => c.toLowerCase()));
  return distinct.size >= 2;
}

export type TextProblem = "empty" | "too_short" | "too_long" | "meaningless";

export function checkBody(input: string, max: number): TextProblem | null {
  const text = normalizeText(input);
  if (!text) return "empty";
  const length = characterCount(text);
  if (length < LIMITS.minimum) return "too_short";
  if (length > max) return "too_long";
  if (!isMeaningful(text)) return "meaningless";
  return null;
}

export function problemMessage(problem: TextProblem, max: number, noun = "message"): string {
  switch (problem) {
    case "empty":
      return `Please write your ${noun} first.`;
    case "too_short":
      return `Your ${noun} looks a little short. Could you add a few more words?`;
    case "too_long":
      return `Please keep your ${noun} under ${max.toLocaleString("en")} characters.`;
    case "meaningless":
      return `Please write your ${noun} in words so leaders can understand it.`;
  }
}
