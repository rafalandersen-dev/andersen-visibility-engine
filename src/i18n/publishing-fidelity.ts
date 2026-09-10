import type { OnboardingLanguage } from "@/lib/types";
export const publishingFidelity: Record<OnboardingLanguage, Record<string, string>> = {
  en: {
    "publishingFidelity.blocked": "Content checks: {count} blockers to resolve",
    "publishingFidelity.clear": "Local content checks pass",
    "publishingFidelity.gates":
      "Publishing still requires a saved, current approval, fresh source checks and an eligible destination. These checks do not confirm delivery.",
    "publishingFidelity.warnings": "Advisory warnings: {count}",
    "publishingFidelity.generated": "Structured data generated from the rendered article.",
    "publishingFidelity.empty": "No structured data generated.",
    "publishingFidelity.none": "No publishing connector selected; payload inclusion is unknown.",
    "publishingFidelity.custom": "Custom endpoint: markdown only; JSON-LD delivery is unsupported.",
    "publishingFidelity.planned":
      "Planned for the {connector} payload. This preview is not a dispatch or acceptance receipt.",
    "publishingFidelity.unverified":
      "Retention by the connector and presence on the live page are unverified. Rich-result appearance is not confirmed.",
  },
  pl: {
    "publishingFidelity.blocked": "Kontrola treści: blokady do rozwiązania — {count}",
    "publishingFidelity.clear": "Lokalne kontrole treści zakończone pomyślnie",
    "publishingFidelity.gates":
      "Publikacja nadal wymaga zapisanej, aktualnej akceptacji, kontroli aktualności źródeł i odpowiedniego miejsca publikacji. Te kontrole nie potwierdzają dostarczenia.",
    "publishingFidelity.warnings": "Ostrzeżenia doradcze: {count}",
    "publishingFidelity.generated": "Dane strukturalne wygenerowano z wyrenderowanego artykułu.",
    "publishingFidelity.empty": "Nie wygenerowano danych strukturalnych.",
    "publishingFidelity.none":
      "Nie wybrano integracji publikowania; obecność danych w przesyłce jest nieznana.",
    "publishingFidelity.custom":
      "Własny endpoint: tylko Markdown; dostarczanie JSON-LD nie jest obsługiwane.",
    "publishingFidelity.planned":
      "Zaplanowano dla przesyłki {connector}. Podgląd nie jest potwierdzeniem wysłania ani przyjęcia.",
    "publishingFidelity.unverified":
      "Zachowanie danych przez integrację i ich obecność na stronie są niezweryfikowane. Wyświetlanie wyników rozszerzonych nie jest potwierdzone.",
  },
  sv: {
    "publishingFidelity.blocked": "Innehållskontroller: {count} hinder att lösa",
    "publishingFidelity.clear": "Lokala innehållskontroller godkända",
    "publishingFidelity.gates":
      "Publicering kräver fortfarande ett sparat, aktuellt godkännande, färska källkontroller och en giltig destination. Kontrollerna bekräftar inte leverans.",
    "publishingFidelity.warnings": "Rådgivande varningar: {count}",
    "publishingFidelity.generated":
      "Strukturerade data har genererats från den renderade artikeln.",
    "publishingFidelity.empty": "Inga strukturerade data har genererats.",
    "publishingFidelity.none":
      "Ingen publiceringsanslutning vald; innehållet i försändelsen är okänt.",
    "publishingFidelity.custom": "Egen endpoint: endast Markdown; leverans av JSON-LD stöds inte.",
    "publishingFidelity.planned":
      "Planerat för försändelsen till {connector}. Förhandsvisningen är inget kvitto på sändning eller mottagande.",
    "publishingFidelity.unverified":
      "Det är inte verifierat att anslutningen behåller data eller att de finns på den publicerade sidan. Utökade sökresultat är inte bekräftade.",
  },
  da: {
    "publishingFidelity.blocked": "Indholdskontrol: {count} blokeringer skal løses",
    "publishingFidelity.clear": "Lokale indholdskontroller bestået",
    "publishingFidelity.gates":
      "Publicering kræver stadig en gemt, aktuel godkendelse, friske kildekontroller og en gyldig destination. Kontrollerne bekræfter ikke levering.",
    "publishingFidelity.warnings": "Vejledende advarsler: {count}",
    "publishingFidelity.generated": "Strukturerede data er genereret fra den renderede artikel.",
    "publishingFidelity.empty": "Ingen strukturerede data genereret.",
    "publishingFidelity.none":
      "Ingen publiceringsforbindelse valgt; indholdet i forsendelsen er ukendt.",
    "publishingFidelity.custom":
      "Eget endpoint: kun Markdown; levering af JSON-LD understøttes ikke.",
    "publishingFidelity.planned":
      "Planlagt til forsendelsen til {connector}. Forhåndsvisningen er ikke en kvittering for afsendelse eller modtagelse.",
    "publishingFidelity.unverified":
      "Det er ikke verificeret, at forbindelsen bevarer data, eller at de findes på den publicerede side. Udvidede søgeresultater er ikke bekræftet.",
  },
};
