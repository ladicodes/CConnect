import { z } from "zod";
import { LIMITS, checkBody, normalizeName, normalizeText, problemMessage, characterCount } from "@/lib/text";

function body(max: number, noun: string) {
  return z
    .string({ error: `Please write your ${noun} first.` })
    .max(max * 4 + 100, { error: problemMessage("too_long", max, noun) })
    .superRefine((value, ctx) => {
      const problem = checkBody(value, max);
      if (problem) ctx.addIssue({ code: "custom", message: problemMessage(problem, max, noun) });
    })
    .transform(normalizeText);
}

const clientId = z.uuid({ error: "Please refresh the page and try again." });

// Hidden field that people never see or fill in. Bots usually do.
const honeypot = z.string().max(200).optional().default("");

const turnstileToken = z.string().max(4096).optional();

export const questionInput = z.object({
  clientId,
  body: body(LIMITS.question, "question"),
  website: honeypot,
  turnstileToken,
});

export const contextInput = z.object({
  clientId,
  body: body(LIMITS.context, "context"),
  questionId: z.uuid().nullish(),
  website: honeypot,
  turnstileToken,
});

export const prayerInput = z.object({
  clientId,
  body: body(LIMITS.prayer, "prayer request"),
  website: honeypot,
  turnstileToken,
});

export const testimonyInput = z.object({
  clientId,
  kind: z.enum(["thanksgiving", "testimony"], { error: "Please choose thanksgiving or testimony." }),
  body: body(LIMITS.testimony, "message"),
  displayName: z
    .string()
    .max(LIMITS.displayName * 4)
    .optional()
    .default("")
    .transform(normalizeName)
    .refine((value) => characterCount(value) <= LIMITS.displayName, {
      error: `Please keep the name under ${LIMITS.displayName} characters.`,
    }),
  shareConsent: z.boolean({ error: "Please choose how your message may be shared." }),
  website: honeypot,
  turnstileToken,
});

export const supportInput = z.object({ supported: z.boolean() });

export type QuestionInput = z.infer<typeof questionInput>;
export type ContextInput = z.infer<typeof contextInput>;
export type PrayerInput = z.infer<typeof prayerInput>;
export type TestimonyInput = z.infer<typeof testimonyInput>;

export function firstIssue(error: z.ZodError): { message: string; field?: string } {
  const issue = error.issues[0];
  return { message: issue?.message ?? "Please check your message and try again.", field: issue?.path[0]?.toString() };
}
