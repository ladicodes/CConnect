import { handleSubmission } from "@/lib/submissions";
import { prayerInput } from "@/lib/validation";

export async function POST(request: Request) {
  return handleSubmission(request, {
    kind: "prayer",
    schema: prayerInput,
    insert: (tx, input) => tx`select app.submit_prayer(${input.clientId}, ${input.body})`,
  });
}
