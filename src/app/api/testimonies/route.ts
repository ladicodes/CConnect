import { handleSubmission } from "@/lib/submissions";
import { testimonyInput } from "@/lib/validation";

export async function POST(request: Request) {
  return handleSubmission(request, {
    kind: "testimony",
    schema: testimonyInput,
    insert: (tx, input) =>
      tx`select app.submit_testimony(${input.clientId}, ${input.kind}, ${input.body}, ${input.displayName || null}, ${input.shareConsent})`,
  });
}
