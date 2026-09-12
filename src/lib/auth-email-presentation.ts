import { authEmailCopy } from "@/i18n/auth-email-copy";
import { emailLocaleSchema } from "./email-languages";

export function authEmailPresentation(
  language: unknown,
  kind: "signup" | "reset",
  siteName: string,
) {
  const parsed = emailLocaleSchema.safeParse(language);
  const locale = parsed.success ? parsed.data : "en";
  const copy = authEmailCopy[locale];
  const title = kind === "signup" ? copy.signupTitle : copy.resetTitle;
  return {
    locale,
    title,
    body: (kind === "signup" ? copy.signupBody : copy.resetBody).replace(
      /\{siteName\}/g,
      () => siteName,
    ),
    ignore: kind === "signup" ? copy.signupIgnore : copy.resetIgnore,
    subject:
      locale === "en"
        ? kind === "signup"
          ? `Confirm your ${siteName} account`
          : `Reset your ${siteName} password`
        : `${title} — ${siteName}`,
  };
}
