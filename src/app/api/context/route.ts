import { handleSubmission } from "@/lib/submissions";
import { contextInput } from "@/lib/validation";

export async function POST(request: Request) {
  return handleSubmission(request, {
    kind: "context",
    schema: contextInput,
    insert: (tx, input) => tx`select app.submit_context(${input.clientId}, ${input.questionId ?? null}, ${input.body})`,
  });
}
