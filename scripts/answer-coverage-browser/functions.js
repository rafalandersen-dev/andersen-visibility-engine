// Synthetic replacement of src/lib/answer-evidence.functions.ts. The read returns the in-page dataset
// for the requested project, validated by the real row schema; every write is recorded and refused.
import { evidencePromptRowSchema, evidenceRowSchema } from "@/lib/answer-evidence";
import { fixture } from "./fixture.js";
const refuse = (name) => async () => {
  fixture.invoked.push({ name, read: false });
  throw Error(`Fixture refuses ${name}: no writes.`);
};
export const readAnswerEvidenceFn = async ({ data }) => {
  fixture.invoked.push({ name: "readAnswerEvidenceFn", read: true, projectId: data.projectId });
  if (fixture.variant === "error") throw Error("Synthetic read failure");
  const set = fixture.datasets[data.projectId] ?? { prompts: [], answers: [] };
  return structuredClone({
    prompts: set.prompts.map((p) => evidencePromptRowSchema.parse(p)),
    answers: set.answers.map((a) => evidenceRowSchema.parse(a)),
  });
};
export const saveEvidencePromptFn = refuse("saveEvidencePromptFn");
export const importAnswerEvidenceFn = refuse("importAnswerEvidenceFn");
export const removeAnswerEvidenceFn = refuse("removeAnswerEvidenceFn");
