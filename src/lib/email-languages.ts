import { z } from "zod";
import { CONTENT_LANGUAGE_OPTIONS, type ContentLanguageCode } from "./content-languages";

/** Email language is an explicit recipient preference, independent of the app,
 * generated article language and billing/target market. */
export const EMAIL_LANGUAGE_OPTIONS = CONTENT_LANGUAGE_OPTIONS;
export type EmailLanguage = ContentLanguageCode;
export const EMAIL_LANGUAGE_CODES = EMAIL_LANGUAGE_OPTIONS.map((option) => option.value) as [
  EmailLanguage,
  ...EmailLanguage[],
];
export const emailLocaleSchema = z.enum(EMAIL_LANGUAGE_CODES);
