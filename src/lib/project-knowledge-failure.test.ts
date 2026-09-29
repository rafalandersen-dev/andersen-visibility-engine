import { describe, expect, it } from "vitest";
import { knowledgeChangeFailure } from "./project-knowledge-failure";
import { KnowledgeUnavailableError } from "./project-knowledge.server";
describe("knowledge change failure classification (BU)", () => {
  it("maps the fixed website and document codes to known refusals that need no refresh", () => {
    expect(knowledgeChangeFailure(new Error("website_source_unreadable"))).toEqual({
      kind: "known",
      key: "knowledge.ui.websiteUnreadable",
    });
    expect(knowledgeChangeFailure(new Error("brand_document_no_text"))).toEqual({
      kind: "known",
      key: "knowledge.ui.noText",
    });
    for (const code of ["brand_document_size", "brand_document_timeout", "brand_document_zip"])
      expect(knowledgeChangeFailure(new Error(code))).toEqual({
        kind: "known",
        key: "knowledge.ui.parseFailed",
      });
  });
  it("keeps every other outcome fail-closed as an unconfirmed save", () => {
    for (const error of [
      new KnowledgeUnavailableError(),
      new Error("The website did not return enough readable text."),
      new Error("website_source_unreadable extra"),
      new Error("Website_source_unreadable"),
      new Error(""),
      new TypeError("fetch failed"),
      "website_source_unreadable",
      null,
      undefined,
      { message: "website_source_unreadable" },
    ])
      expect(knowledgeChangeFailure(error)).toEqual({ kind: "unconfirmed" });
  });
  it("BV: inherited Object.prototype names are not known codes and never yield a non-string key", () => {
    for (const name of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
    ]) {
      const result = knowledgeChangeFailure(new Error(name));
      expect(result, name).toEqual({ kind: "unconfirmed" });
    }
    const message = Object.create(null) as unknown as string;
    const error = new Error("x");
    Object.defineProperty(error, "message", { value: message });
    expect(knowledgeChangeFailure(error)).toEqual({ kind: "unconfirmed" });
  });
});
