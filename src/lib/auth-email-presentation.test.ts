import { createElement } from "react";
import { render } from "react-email";
import { describe, expect, it } from "vitest";
import { authEmailCopy } from "@/i18n/auth-email-copy";
import { EMAIL_LANGUAGE_CODES } from "./email-languages";
import { authEmailPresentation } from "./auth-email-presentation";
import { SignupEmail } from "./email-templates/signup";
import { RecoveryEmail } from "./email-templates/recovery";

const action = "https://auth.example.invalid/action";
const siteName = "Milo Growth";
describe("authentication email rendering", () => {
  it("covers exactly the email language registry with consistent placeholders", () => {
    expect(Object.keys(authEmailCopy).sort()).toEqual([...EMAIL_LANGUAGE_CODES].sort());
    for (const copy of Object.values(authEmailCopy)) {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(authEmailCopy.en).sort());
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim()).not.toBe("");
        const tokens = (s: string) => [...s.matchAll(/\{[^{}]+\}/g)].map((m) => m[0]).sort();
        expect(tokens(value)).toEqual(tokens(authEmailCopy.en[key as keyof typeof copy]));
      }
    }
  });
  it.each(EMAIL_LANGUAGE_CODES)(
    "renders signup and recovery in %s without changing links",
    async (language) => {
      for (const kind of ["signup", "reset"] as const) {
        const props = {
          siteName,
          confirmationUrl: action,
          language,
          siteUrl: "https://milogrowth.com",
          recipient: "person@example.invalid",
        };
        const element =
          kind === "signup"
            ? createElement(SignupEmail, props)
            : createElement(RecoveryEmail, props);
        const html = await render(element);
        const text = await render(element, { plainText: true });
        const copy = authEmailPresentation(language, kind, siteName);
        expect(html).toContain(`lang="${language}"`);
        expect(html).toContain(`href="${action}"`);
        expect(text).toContain(action);
        expect(text).toContain(copy.title);
        expect(text).toContain(copy.body);
        expect(text).toContain(copy.ignore);
        expect(html).not.toMatch(/\{siteName\}|undefined/);
        if (kind === "signup") {
          expect(html).toContain('href="mailto:person@example.invalid"');
          expect(html).toContain('href="https://milogrowth.com"');
        }
      }
    },
  );
  it("escapes interpolated brand and recipient text rather than treating it as markup", async () => {
    const html = await render(
      createElement(SignupEmail, {
        siteName: "<script>brand</script>",
        recipient: "<b>recipient</b>",
        siteUrl: "https://example.invalid",
        confirmationUrl: action,
        language: "pl",
      }),
    );
    expect(html).not.toContain("<script>brand</script>");
    expect(html).not.toContain("<b>recipient</b>");
    expect(html).toContain("&lt;script&gt;brand&lt;/script&gt;");
  });
  it("keeps English defaults and subjects for old callers", () => {
    expect(authEmailPresentation(undefined, "signup", siteName).subject).toBe(
      "Confirm your Milo Growth account",
    );
    expect(authEmailPresentation(undefined, "reset", siteName).subject).toBe(
      "Reset your Milo Growth password",
    );
    expect(authEmailPresentation("unknown", "signup", siteName).locale).toBe("en");
  });
});
