import { handleSubmission } from "@/lib/submissions";
import { questionInput } from "@/lib/validation";

export async function POST(request: Request) {
  return handleSubmission(request, {
    kind: "question",
    schema: questionInput,
    insert: (tx, input) => tx`select app.submit_question(${input.clientId}, ${input.body})`,
  });
}
