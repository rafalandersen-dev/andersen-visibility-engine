/** AI Evaluation access (Pro/Agency): the known plan restriction and unconfirmed access. The English
 * values are the exact server sentences (AiEvaluationGateError), mapped back to these keys by
 * ai-refusal-messages.ts; the page reuses the unavailable sentence. Polish, Swedish and Danish are
 * author-written; no fluent-speaker acceptance is claimed. */
const en = {
  "aiEvalAccess.restricted":
    "AI Evaluation is included in the Pro and Agency plans. Upgrade to run new comparisons — your saved evaluation history stays available.",
  "aiEvalAccess.unavailable":
    "Milo cannot confirm AI Evaluation access right now. New comparisons are paused; please try again later. Your saved evaluation history stays available.",
} as const;
type Copy = Record<keyof typeof en, string>;
const pl: Copy = {
  "aiEvalAccess.restricted":
    "Ocena AI jest dostępna w planach Pro i Agency. Podnieś plan, aby uruchamiać nowe porównania — zapisana historia ocen pozostaje dostępna.",
  "aiEvalAccess.unavailable":
    "Milo nie może teraz potwierdzić dostępu do Oceny AI. Nowe porównania są wstrzymane; spróbuj ponownie później. Zapisana historia ocen pozostaje dostępna.",
};
const sv: Copy = {
  "aiEvalAccess.restricted":
    "AI-utvärdering ingår i planerna Pro och Agency. Uppgradera för att köra nya jämförelser – din sparade utvärderingshistorik finns kvar.",
  "aiEvalAccess.unavailable":
    "Milo kan inte bekräfta åtkomsten till AI-utvärdering just nu. Nya jämförelser är pausade; försök igen senare. Din sparade utvärderingshistorik finns kvar.",
};
const da: Copy = {
  "aiEvalAccess.restricted":
    "AI-evaluering er inkluderet i Pro- og Agency-planerne. Opgrader for at køre nye sammenligninger – din gemte evalueringshistorik er stadig tilgængelig.",
  "aiEvalAccess.unavailable":
    "Milo kan ikke bekræfte adgangen til AI-evaluering lige nu. Nye sammenligninger er sat på pause; prøv igen senere. Din gemte evalueringshistorik er stadig tilgængelig.",
};
export const aiEvaluationAccessCopy = { en, pl, sv, da } as const;
