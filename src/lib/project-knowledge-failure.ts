/**
 * Classification of a failed knowledge change (BU, 29 September 2026). A KNOWN refusal is a fixed code thrown
 * by our own server or client code before any write: nothing was written, the saved knowledge is unchanged and
 * no refresh is needed. Anything else — including the knowledge server's "could not be confirmed" error and any
 * transport failure — is an UNCONFIRMED save and stays fail-closed: the panel locks until the owner refreshes
 * and checks the saved version. Only exact codes are matched; no message text is interpreted.
 */
// A Map, not a plain object: inherited Object.prototype names ("constructor", "toString", "__proto__", …)
// must never classify an unknown failure as known (BV).
const KNOWN: ReadonlyMap<string, string> = new Map([
  ["brand_document_no_text", "knowledge.ui.noText"],
  ["website_source_unreadable", "knowledge.ui.websiteUnreadable"],
  ["website_source_temporarily_unavailable", "knowledge.ui.websiteTemporarilyUnavailable"],
]);
export type KnowledgeChangeFailure = { kind: "known"; key: string } | { kind: "unconfirmed" };
export function knowledgeChangeFailure(error: unknown): KnowledgeChangeFailure {
  if (error instanceof Error && typeof error.message === "string") {
    const key = KNOWN.get(error.message);
    if (key !== undefined) return { kind: "known", key };
    if (error.message.startsWith("brand_document_"))
      return { kind: "known", key: "knowledge.ui.parseFailed" };
  }
  return { kind: "unconfirmed" };
}
