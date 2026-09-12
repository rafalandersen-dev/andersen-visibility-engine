import type { OnboardingLanguage } from "@/lib/types";

export const setupScreenCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "setupScreen.invalidUrl": "{field} must start with http:// or https://",
    "setupScreen.missing": "Complete the required fields: {fields}",
    "setupScreen.additional": "Additional content languages",
    "setupScreen.sellingPoints": "Unique selling points",
    "setupScreen.publishing": "Publishing",
    "setupScreen.mode": "Publishing mode",
    "setupScreen.mode.draft": "Draft only",
    "setupScreen.mode.manual": "Manual live publishing",
    "setupScreen.endpoint": "Draft delivery endpoint",
    "setupScreen.liveEndpoint": "Live publication endpoint",
    "setupScreen.liveHelp":
      "A separate endpoint for publishing a reviewed draft. It uses the same publishing secret.",
    "setupScreen.secret": "Publishing secret",
    "setupScreen.secretHelp":
      "New secrets are saved by the server and sent to the configured target in a request header. Configure the matching secret on that target.",
    "setupScreen.destination": "Default destination",
    "setupScreen.faq": "FAQ section",
    "setupScreen.approvalHelp":
      "Approving an article marks it ready. Publishing requires a separate action: publish now or schedule a publication time. Review the content and claims before publishing.",
    "setupScreen.disclaimer": "AI Content Disclaimer",
    "setupScreen.retiredTitle": "Automatic publishing on approval has been removed.",
    "setupScreen.retiredHelp":
      "This project now uses {mode}. Approval marks an article ready; publication still needs a separate action or schedule. Previously approved articles may still be drafts. Check their status before scheduling new work.",
    "setupScreen.saving": "Saving…",
    "setupScreen.save": "Save publishing settings",
    "setupScreen.saved": "Publishing settings saved",
    "setupScreen.failed": "Could not save publishing settings",
    "setupScreen.tagsExample": "seo, growth",
  },
  pl: {
    "setupScreen.invalidUrl": "Pole „{field}” musi zaczynać się od http:// lub https://",
    "setupScreen.missing": "Uzupełnij wymagane pola: {fields}",
    "setupScreen.additional": "Dodatkowe języki treści",
    "setupScreen.sellingPoints": "Wyróżniki oferty",
    "setupScreen.publishing": "Publikowanie",
    "setupScreen.mode": "Tryb publikowania",
    "setupScreen.mode.draft": "Tylko wersja robocza",
    "setupScreen.mode.manual": "Ręczne publikowanie",
    "setupScreen.endpoint": "Punkt końcowy wysyłania wersji roboczej",
    "setupScreen.liveEndpoint": "Punkt końcowy publikowania",
    "setupScreen.liveHelp":
      "Osobny punkt końcowy do publikowania sprawdzonej wersji roboczej. Korzysta z tego samego sekretu publikowania.",
    "setupScreen.secret": "Sekret publikowania",
    "setupScreen.secretHelp":
      "Nowe sekrety są zapisywane na serwerze i wysyłane do skonfigurowanej witryny w nagłówku żądania. Skonfiguruj na niej taki sam sekret.",
    "setupScreen.destination": "Domyślne miejsce docelowe",
    "setupScreen.faq": "Sekcja FAQ",
    "setupScreen.approvalHelp":
      "Zatwierdzenie artykułu oznacza, że jest gotowy. Publikacja wymaga osobnego działania: opublikowania teraz lub ustawienia terminu publikacji. Przed publikacją sprawdź treść i zawarte w niej twierdzenia.",
    "setupScreen.disclaimer": "Zastrzeżenia dotyczące treści AI",
    "setupScreen.retiredTitle": "Usunięto automatyczną publikację po zatwierdzeniu.",
    "setupScreen.retiredHelp":
      "Ten projekt korzysta teraz z trybu „{mode}”. Zatwierdzenie oznacza gotowość artykułu; publikacja nadal wymaga osobnego działania lub harmonogramu. Wcześniej zatwierdzone artykuły mogą nadal być wersjami roboczymi. Sprawdź ich stan przed zaplanowaniem nowej pracy.",
    "setupScreen.saving": "Zapisywanie…",
    "setupScreen.save": "Zapisz ustawienia publikowania",
    "setupScreen.saved": "Zapisano ustawienia publikowania",
    "setupScreen.failed": "Nie udało się zapisać ustawień publikowania",
    "setupScreen.tagsExample": "seo, rozwój",
  },
  sv: {
    "setupScreen.invalidUrl": "{field} måste börja med http:// eller https://",
    "setupScreen.missing": "Fyll i de obligatoriska fälten: {fields}",
    "setupScreen.additional": "Ytterligare innehållsspråk",
    "setupScreen.sellingPoints": "Unika försäljningsargument",
    "setupScreen.publishing": "Publicering",
    "setupScreen.mode": "Publiceringsläge",
    "setupScreen.mode.draft": "Endast utkast",
    "setupScreen.mode.manual": "Manuell publicering",
    "setupScreen.endpoint": "Endpoint för utkastleverans",
    "setupScreen.liveEndpoint": "Endpoint för publicering",
    "setupScreen.liveHelp":
      "En separat endpoint för att publicera ett granskat utkast. Den använder samma publiceringshemlighet.",
    "setupScreen.secret": "Publiceringshemlighet",
    "setupScreen.secretHelp":
      "Nya hemligheter sparas på servern och skickas till det konfigurerade målet i ett begärandehuvud. Konfigurera samma hemlighet på målet.",
    "setupScreen.destination": "Standarddestination",
    "setupScreen.faq": "FAQ-avsnitt",
    "setupScreen.approvalHelp":
      "Att godkänna en artikel markerar den som klar. Publicering kräver en separat åtgärd: publicera nu eller ange en publiceringstid. Granska innehållet och påståendena före publicering.",
    "setupScreen.disclaimer": "Ansvarsfriskrivning för AI-innehåll",
    "setupScreen.retiredTitle": "Automatisk publicering vid godkännande har tagits bort.",
    "setupScreen.retiredHelp":
      "Projektet använder nu {mode}. Godkännande markerar en artikel som klar; publicering kräver fortfarande en separat åtgärd eller schemaläggning. Tidigare godkända artiklar kan fortfarande vara utkast. Kontrollera deras status innan du schemalägger nytt arbete.",
    "setupScreen.saving": "Sparar…",
    "setupScreen.save": "Spara publiceringsinställningar",
    "setupScreen.saved": "Publiceringsinställningarna har sparats",
    "setupScreen.failed": "Det gick inte att spara publiceringsinställningarna",
    "setupScreen.tagsExample": "seo, tillväxt",
  },
  da: {
    "setupScreen.invalidUrl": "{field} skal starte med http:// eller https://",
    "setupScreen.missing": "Udfyld de obligatoriske felter: {fields}",
    "setupScreen.additional": "Yderligere indholdssprog",
    "setupScreen.sellingPoints": "Unikke salgsargumenter",
    "setupScreen.publishing": "Publicering",
    "setupScreen.mode": "Publiceringstilstand",
    "setupScreen.mode.draft": "Kun kladde",
    "setupScreen.mode.manual": "Manuel publicering",
    "setupScreen.endpoint": "Endpoint til levering af kladder",
    "setupScreen.liveEndpoint": "Endpoint til publicering",
    "setupScreen.liveHelp":
      "Et særskilt endpoint til at publicere en gennemgået kladde. Det bruger den samme publiceringshemmelighed.",
    "setupScreen.secret": "Publiceringshemmelighed",
    "setupScreen.secretHelp":
      "Nye hemmeligheder gemmes på serveren og sendes til det konfigurerede mål i en forespørgselsheader. Konfigurer den samme hemmelighed på målet.",
    "setupScreen.destination": "Standarddestination",
    "setupScreen.faq": "FAQ-afsnit",
    "setupScreen.approvalHelp":
      "Godkendelse markerer en artikel som klar. Publicering kræver en særskilt handling: publicer nu, eller vælg et publiceringstidspunkt. Gennemgå indholdet og påstandene før publicering.",
    "setupScreen.disclaimer": "Ansvarsfraskrivelse for AI-indhold",
    "setupScreen.retiredTitle": "Automatisk publicering ved godkendelse er fjernet.",
    "setupScreen.retiredHelp":
      "Projektet bruger nu {mode}. Godkendelse markerer en artikel som klar; publicering kræver stadig en særskilt handling eller planlægning. Tidligere godkendte artikler kan stadig være kladder. Kontrollér deres status, før du planlægger nyt arbejde.",
    "setupScreen.saving": "Gemmer…",
    "setupScreen.save": "Gem publiceringsindstillinger",
    "setupScreen.saved": "Publiceringsindstillingerne er gemt",
    "setupScreen.failed": "Kunne ikke gemme publiceringsindstillingerne",
    "setupScreen.tagsExample": "seo, vækst",
  },
};
