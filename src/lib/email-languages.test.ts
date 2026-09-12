import { expect, it, vi } from "vitest";
import { EMAIL_LANGUAGE_CODES, emailLocaleSchema } from "./email-languages";
import { emailCopy } from "@/i18n/email-copy";
import { DIGEST_KINDS } from "@/i18n/email-copy-types";
import { notifications } from "@/i18n/notifications";
import { renderOperationalDigest } from "./operational-email.server";
import { renderTeamInvitation } from "./project-team-invitation-delivery.server";
vi.mock("./operational-notifications.server", () => ({ refreshOperationalNotifications: vi.fn() }));
const id = "00000000-0000-4000-8000-000000000001";
it("covers the 24 canonical EU email locales without treating app/content/market settings as preferences", () => {
  expect(EMAIL_LANGUAGE_CODES).toHaveLength(24);
  expect(new Set(EMAIL_LANGUAGE_CODES).size).toBe(24);
  expect(Object.keys(emailCopy).sort()).toEqual([...EMAIL_LANGUAGE_CODES].sort());
  for (const value of ["EU", "SE", "Swedish", "xx", "en-GB", "__proto__"])
    expect(emailLocaleSchema.safeParse(value).success).toBe(false);
});
it.each(EMAIL_LANGUAGE_CODES)(
  "renders all digest reasons and invitation roles in %s without markup injection or fallback keys",
  (locale) => {
    const copy = emailCopy[locale];
    expect(Object.keys(copy.digest.kinds).sort()).toEqual([...DIGEST_KINDS].sort());
    const body = renderOperationalDigest({
      locale,
      items: DIGEST_KINDS.map((kind) => ({
        id,
        projectId: "p",
        targetId: "a",
        title: '<img src=x onerror="alert(1)">',
        kind,
        dueAt: "2026-09-12T12:00:00Z",
        detail: { timeZone: "Europe/Stockholm" },
      })),
    });
    expect(body.subject).toBe(copy.digest.subject);
    expect(body.html).toContain(`lang="${locale}"`);
    expect(body.html).not.toContain("<img");
    expect(body.html).toContain("&lt;img");
    expect(body.text).not.toMatch(/undefined|notifications\./);
    expect(body.text).toContain("Europe/Stockholm");
    for (const kind of DIGEST_KINDS) expect(body.text).toContain(copy.digest.kinds[kind]);
    for (const role of ["viewer", "editor", "reviewer"] as const) {
      const invitation = renderTeamInvitation(role, locale);
      expect(invitation.text).toContain(copy.invitation.roles[role]);
      expect(invitation.html).toContain(`lang="${locale}"`);
      expect(invitation.text).toContain("https://milogrowth.com/app/collaborators");
      expect(invitation.text).not.toMatch(/undefined|notifications\./);
    }
  },
);
it("preserves the existing four languages' operational reason labels", () => {
  for (const locale of ["en", "pl", "sv", "da"] as const)
    for (const kind of DIGEST_KINDS)
      expect(emailCopy[locale].digest.kinds[kind]).toBe(
        notifications[locale][`notifications.${kind}`],
      );
});
it("rejects accidental Cyrillic or Greek characters in Latin-language copy", () => {
  for (const locale of EMAIL_LANGUAGE_CODES) {
    const text = JSON.stringify(emailCopy[locale]);
    if (locale !== "bg") expect(text).not.toMatch(/\p{Script=Cyrillic}/u);
    if (locale !== "el") expect(text).not.toMatch(/\p{Script=Greek}/u);
  }
});
