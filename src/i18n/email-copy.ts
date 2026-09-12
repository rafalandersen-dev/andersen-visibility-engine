import type { EmailLanguage } from "@/lib/email-languages";
import { notifications } from "./notifications";
import { DIGEST_KINDS, type EmailCopy, type DigestCopy } from "./email-copy-types";
import { euEmailCopy } from "./email-copy-eu";
const legacyDigest = {
  en: {
    subject: "Your Milo Growth tasks need attention",
    intro:
      "These tasks still need attention at the latest check. Open Milo to review their current status.",
    open: "Review notifications",
    footer:
      "Manage operational email preferences in Milo. Opening this link never approves or publishes content.",
  },
  pl: {
    subject: "Zadania w Milo Growth wymagają uwagi",
    intro:
      "Te zadania wymagały uwagi podczas ostatniego sprawdzenia. Otwórz Milo, aby zobaczyć ich aktualny stan.",
    open: "Sprawdź powiadomienia",
    footer:
      "Ustawienia e-maili operacyjnych zmienisz w Milo. Otwarcie linku nie zatwierdza ani nie publikuje treści.",
  },
  sv: {
    subject: "Dina uppgifter i Milo Growth behöver uppmärksamhet",
    intro:
      "Dessa uppgifter behövde uppmärksamhet vid den senaste kontrollen. Öppna Milo för aktuell status.",
    open: "Visa aviseringar",
    footer:
      "Hantera e-postinställningar i Milo. Länken godkänner eller publicerar aldrig innehåll.",
  },
  da: {
    subject: "Dine opgaver i Milo Growth kræver opmærksomhed",
    intro:
      "Disse opgaver krævede opmærksomhed ved seneste kontrol. Åbn Milo for den aktuelle status.",
    open: "Se notifikationer",
    footer:
      "Administrer e-mailindstillinger i Milo. Linket godkender eller udgiver aldrig indhold.",
  },
};
const legacyInvitation = {
  en: {
    subject: "You have a Milo Growth project invitation",
    intro: "You have been invited to collaborate on a project in Milo Growth.",
    instruction:
      "Sign in or create an account using the email address that received this invitation, then review the invitation and role in Collaborators.",
    open: "Review invitation",
    footer:
      "The invitation expires seven days after it was created and may be revoked by its owner. Opening this link does not accept the invitation, approve content or publish anything.",
    roles: { viewer: "Viewer", editor: "Editor", reviewer: "Reviewer" },
  },
  pl: {
    subject: "Zaproszenie do projektu w Milo Growth",
    intro: "Zaproszono Cię do współpracy nad projektem w Milo Growth.",
    instruction:
      "Zaloguj się lub utwórz konto z adresem e-mail, na który otrzymano zaproszenie, a następnie sprawdź zaproszenie i rolę w sekcji Współpracownicy.",
    open: "Sprawdź zaproszenie",
    footer:
      "Zaproszenie wygasa siedem dni po utworzeniu i może zostać cofnięte przez właściciela. Otwarcie linku nie akceptuje zaproszenia, nie zatwierdza ani nie publikuje treści.",
    roles: { viewer: "Obserwator", editor: "Redaktor", reviewer: "Recenzent" },
  },
  sv: {
    subject: "Du har en projektinbjudan i Milo Growth",
    intro: "Du har bjudits in att samarbeta i ett projekt i Milo Growth.",
    instruction:
      "Logga in eller skapa ett konto med e-postadressen som fick inbjudan. Granska sedan inbjudan och rollen under Samarbetspartner.",
    open: "Granska inbjudan",
    footer:
      "Inbjudan löper ut sju dagar efter att den skapades och kan återkallas av ägaren. Att öppna länken accepterar inte inbjudan, godkänner inte innehåll och publicerar ingenting.",
    roles: { viewer: "Läsare", editor: "Redaktör", reviewer: "Granskare" },
  },
  da: {
    subject: "Du har en projektinvitation i Milo Growth",
    intro: "Du er inviteret til at samarbejde på et projekt i Milo Growth.",
    instruction:
      "Log ind eller opret en konto med den e-mailadresse, der modtog invitationen. Gennemgå derefter invitationen og rollen under Samarbejdspartnere.",
    open: "Gennemgå invitation",
    footer:
      "Invitationen udløber syv dage efter oprettelsen og kan tilbagekaldes af ejeren. Åbning af linket accepterer ikke invitationen, godkender ikke indhold og udgiver ingenting.",
    roles: { viewer: "Læser", editor: "Redaktør", reviewer: "Reviewer" },
  },
};

/** Complete text catalog; dictionary coverage is not native-speaker acceptance. */
export const emailCopy: Record<EmailLanguage, EmailCopy> = {
  en: {
    digest: {
      ...legacyDigest.en,
      kinds: Object.fromEntries(
        DIGEST_KINDS.map((kind) => [kind, notifications.en[`notifications.${kind}`]]),
      ) as DigestCopy["kinds"],
    },
    invitation: legacyInvitation.en,
  },
  pl: {
    digest: {
      ...legacyDigest.pl,
      kinds: Object.fromEntries(
        DIGEST_KINDS.map((kind) => [kind, notifications.pl[`notifications.${kind}`]]),
      ) as DigestCopy["kinds"],
    },
    invitation: legacyInvitation.pl,
  },
  sv: {
    digest: {
      ...legacyDigest.sv,
      kinds: Object.fromEntries(
        DIGEST_KINDS.map((kind) => [kind, notifications.sv[`notifications.${kind}`]]),
      ) as DigestCopy["kinds"],
    },
    invitation: legacyInvitation.sv,
  },
  da: {
    digest: {
      ...legacyDigest.da,
      kinds: Object.fromEntries(
        DIGEST_KINDS.map((kind) => [kind, notifications.da[`notifications.${kind}`]]),
      ) as DigestCopy["kinds"],
    },
    invitation: legacyInvitation.da,
  },
  ...euEmailCopy,
};
