// Synthetic replacement of src/lib/answer-evidence.functions.ts: the panel only reads saved prompts here.
import { fixture } from "./fixture.js";
const refuse = (name) => async () => {
  fixture.calls.push({ name, write: true, refused: true });
  throw Error(`Fixture refuses ${name}.`);
};
export const readAnswerEvidenceFn = async ({ data }) => {
  fixture.calls.push({ name: "readAnswerEvidenceFn", projectId: data.projectId });
  return structuredClone({ prompts: fixture.datasets[data.projectId]?.prompts ?? [], answers: [] });
};
export const saveEvidencePromptFn = refuse("saveEvidencePromptFn");
export const importAnswerEvidenceFn = refuse("importAnswerEvidenceFn");
export const removeAnswerEvidenceFn = refuse("removeAnswerEvidenceFn");
