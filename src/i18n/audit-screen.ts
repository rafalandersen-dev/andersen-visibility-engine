import type { OnboardingLanguage } from "@/lib/types";

export const auditScreenCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "auditScreen.title": "On-page Review",
    "auditScreen.subtitle":
      "Review homepage content and business details, alongside separate technical crawl, indexing and performance evidence.",
    "auditScreen.complete": "On-page review complete",
    "auditScreen.failed": "Review failed. Please try again.",
    "auditScreen.bulkCreated": "Opportunities created from priority findings: {count}",
    "auditScreen.setupHelp":
      "Create a project with your business details and website before running an on-page review.",
    "auditScreen.website": "Website URL",
    "auditScreen.inputHelp":
      "Review {business}{location} using readable text from the submitted homepage URL, when available, plus your business details. If the page cannot be read, the assessment uses only your supplied business context. This action does not run the separate technical crawl.",
    "auditScreen.running": "Running review…",
    "auditScreen.rerun": "Re-run review",
    "auditScreen.run": "Run review",
    "auditScreen.incomplete": "Review did not complete",
    "auditScreen.first": "Run your first on-page review",
    "auditScreen.emptyHelp":
      "Milo assesses available homepage text and business details for clarity, SEO basics, local visibility, AI-answer readiness, conversion and trust. Review the prioritized recommendations and choose which become opportunities in Plan. This action covers one page and supplied context; technical crawling has its own controls above.",
    "auditScreen.readProof":
      "Readable text was retrieved from the submitted homepage URL. This review assesses that text together with your business details. Its scores are assessments, not measured technical metrics or a full-site crawl.",
    "auditScreen.unreadFallback":
      "The page could not be read; this review uses your supplied business details.",
    "auditScreen.unreadHelp":
      "These scores are indicative assessments of your inputs, not measurements of the live site.",
    "auditScreen.indicative": "Indicative · page not read",
    "auditScreen.overall": "Overall",
    "auditScreen.estimate": "est.",
    "auditScreen.topFixes": "Priority recommendations",
    "auditScreen.createTop": "Create opportunities from up to 5 priority findings",
    "auditScreen.noneRemaining": "No unconverted high- or medium-priority findings remain.",
    "auditScreen.scoreHelp":
      "Higher scores indicate a stronger assessment. They do not measure current rankings or technical performance.",
    "auditScreen.category.Business Clarity": "Business clarity",
    "auditScreen.category.SEO Basics": "SEO basics",
    "auditScreen.category.Local Visibility": "Local visibility",
    "auditScreen.category.AI Readiness": "AI readiness",
    "auditScreen.category.Conversion & Trust": "Conversion and trust",
  },
  pl: {
    "auditScreen.title": "Przegląd strony",
    "auditScreen.subtitle":
      "Przejrzyj treść strony głównej i dane firmy wraz z osobnymi wynikami skanowania technicznego, indeksowania i wydajności.",
    "auditScreen.complete": "Przegląd strony zakończony",
    "auditScreen.failed": "Przegląd nie powiódł się. Spróbuj ponownie.",
    "auditScreen.bulkCreated": "Szanse utworzone z priorytetowych ustaleń: {count}",
    "auditScreen.setupHelp":
      "Przed uruchomieniem przeglądu strony utwórz projekt z danymi firmy i jej witryną.",
    "auditScreen.website": "Adres URL witryny",
    "auditScreen.inputHelp":
      "Przejrzyj {business}{location} na podstawie czytelnej treści pod podanym adresem strony głównej, jeśli jest dostępna, oraz danych firmy. Jeśli nie można odczytać strony, ocena korzysta wyłącznie z podanych informacji o firmie. To działanie nie uruchamia osobnego skanowania technicznego.",
    "auditScreen.running": "Trwa przegląd…",
    "auditScreen.rerun": "Uruchom przegląd ponownie",
    "auditScreen.run": "Uruchom przegląd",
    "auditScreen.incomplete": "Przegląd nie został ukończony",
    "auditScreen.first": "Uruchom pierwszy przegląd strony",
    "auditScreen.emptyHelp":
      "Milo ocenia dostępną treść strony głównej i dane firmy pod kątem jasności, podstaw SEO, widoczności lokalnej, gotowości do odpowiedzi AI, konwersji i zaufania. Przejrzyj priorytetowe rekomendacje i wybierz, które staną się szansami w Planie. To działanie obejmuje jedną stronę i podany kontekst; skanowanie techniczne ma własne elementy sterujące powyżej.",
    "auditScreen.readProof":
      "Pobrano czytelną treść spod podanego adresu strony głównej. Przegląd ocenia tę treść wraz z danymi firmy. Wyniki są oceną, a nie pomiarem technicznym ani pełnym skanowaniem witryny.",
    "auditScreen.unreadFallback":
      "Nie udało się odczytać strony; przegląd korzysta z podanych danych firmy.",
    "auditScreen.unreadHelp":
      "Te wyniki są orientacyjną oceną podanych informacji, a nie pomiarami działającej witryny.",
    "auditScreen.indicative": "Orientacyjne · strona nieodczytana",
    "auditScreen.overall": "Ogółem",
    "auditScreen.estimate": "szac.",
    "auditScreen.topFixes": "Priorytetowe rekomendacje",
    "auditScreen.createTop": "Utwórz szanse z maksymalnie 5 priorytetowych ustaleń",
    "auditScreen.noneRemaining":
      "Nie pozostały nieprzekształcone ustalenia o wysokim lub średnim priorytecie.",
    "auditScreen.scoreHelp":
      "Wyższe wyniki oznaczają lepszą ocenę. Nie mierzą bieżących pozycji ani wydajności technicznej.",
    "auditScreen.category.Business Clarity": "Jasność opisu firmy",
    "auditScreen.category.SEO Basics": "Podstawy SEO",
    "auditScreen.category.Local Visibility": "Widoczność lokalna",
    "auditScreen.category.AI Readiness": "Gotowość do odpowiedzi AI",
    "auditScreen.category.Conversion & Trust": "Konwersja i zaufanie",
  },
  sv: {
    "auditScreen.title": "Sidgranskning",
    "auditScreen.subtitle":
      "Granska startsidans innehåll och företagsuppgifter tillsammans med separat underlag om teknisk genomsökning, indexering och prestanda.",
    "auditScreen.complete": "Sidgranskningen är klar",
    "auditScreen.failed": "Granskningen misslyckades. Försök igen.",
    "auditScreen.bulkCreated": "Möjligheter skapade från prioriterade fynd: {count}",
    "auditScreen.setupHelp":
      "Skapa ett projekt med företagsuppgifter och webbplats innan du gör en sidgranskning.",
    "auditScreen.website": "Webbplatsadress",
    "auditScreen.inputHelp":
      "Granska {business}{location} med läsbar text från den angivna startsidesadressen, när den finns tillgänglig, och företagets uppgifter. Om sidan inte går att läsa används bara den företagsinformation du har lämnat. Åtgärden startar inte den separata tekniska genomsökningen.",
    "auditScreen.running": "Granskar…",
    "auditScreen.rerun": "Granska igen",
    "auditScreen.run": "Starta granskning",
    "auditScreen.incomplete": "Granskningen slutfördes inte",
    "auditScreen.first": "Gör din första sidgranskning",
    "auditScreen.emptyHelp":
      "Milo bedömer tillgänglig startsidestext och företagsuppgifter utifrån tydlighet, grundläggande SEO, lokal synlighet, beredskap för AI-svar, konvertering och förtroende. Granska de prioriterade rekommendationerna och välj vilka som blir möjligheter i Plan. Åtgärden omfattar en sida och angivet underlag; teknisk genomsökning har egna kontroller ovan.",
    "auditScreen.readProof":
      "Läsbar text hämtades från den angivna startsidesadressen. Granskningen bedömer texten tillsammans med företagets uppgifter. Poängen är bedömningar, inte uppmätta tekniska värden eller en genomsökning av hela webbplatsen.",
    "auditScreen.unreadFallback":
      "Sidan gick inte att läsa; granskningen använder dina angivna företagsuppgifter.",
    "auditScreen.unreadHelp":
      "Poängen är vägledande bedömningar av ditt underlag, inte mätningar av den publicerade webbplatsen.",
    "auditScreen.indicative": "Vägledande · sidan inte läst",
    "auditScreen.overall": "Sammanlagt",
    "auditScreen.estimate": "uppsk.",
    "auditScreen.topFixes": "Prioriterade rekommendationer",
    "auditScreen.createTop": "Skapa möjligheter från upp till 5 prioriterade fynd",
    "auditScreen.noneRemaining":
      "Inga återstående fynd med hög eller medelhög prioritet att omvandla.",
    "auditScreen.scoreHelp":
      "Högre poäng anger en starkare bedömning. De mäter inte aktuella placeringar eller teknisk prestanda.",
    "auditScreen.category.Business Clarity": "Tydlighet om företaget",
    "auditScreen.category.SEO Basics": "Grundläggande SEO",
    "auditScreen.category.Local Visibility": "Lokal synlighet",
    "auditScreen.category.AI Readiness": "Beredskap för AI-svar",
    "auditScreen.category.Conversion & Trust": "Konvertering och förtroende",
  },
  da: {
    "auditScreen.title": "Sidegennemgang",
    "auditScreen.subtitle":
      "Gennemgå forsidens indhold og virksomhedsoplysninger sammen med særskilt grundlag om teknisk scanning, indeksering og ydeevne.",
    "auditScreen.complete": "Sidegennemgangen er færdig",
    "auditScreen.failed": "Gennemgangen mislykkedes. Prøv igen.",
    "auditScreen.bulkCreated": "Muligheder oprettet fra prioriterede fund: {count}",
    "auditScreen.setupHelp":
      "Opret et projekt med virksomhedsoplysninger og hjemmeside, før du kører en sidegennemgang.",
    "auditScreen.website": "Hjemmesideadresse",
    "auditScreen.inputHelp":
      "Gennemgå {business}{location} med læsbar tekst fra den angivne forsideadresse, når den er tilgængelig, samt virksomhedens oplysninger. Hvis siden ikke kan læses, bruges kun de virksomhedsoplysninger, du har angivet. Handlingen starter ikke den særskilte tekniske scanning.",
    "auditScreen.running": "Gennemgår…",
    "auditScreen.rerun": "Kør gennemgangen igen",
    "auditScreen.run": "Start gennemgang",
    "auditScreen.incomplete": "Gennemgangen blev ikke gennemført",
    "auditScreen.first": "Kør din første sidegennemgang",
    "auditScreen.emptyHelp":
      "Milo vurderer tilgængelig forsidetekst og virksomhedsoplysninger ud fra klarhed, grundlæggende SEO, lokal synlighed, parathed til AI-svar, konvertering og tillid. Gennemgå de prioriterede anbefalinger, og vælg, hvilke der bliver til muligheder i Plan. Handlingen omfatter én side og det angivne grundlag; teknisk scanning har sine egne kontroller ovenfor.",
    "auditScreen.readProof":
      "Læsbar tekst blev hentet fra den angivne forsideadresse. Gennemgangen vurderer teksten sammen med virksomhedens oplysninger. Scorerne er vurderinger, ikke målte tekniske værdier eller en scanning af hele hjemmesiden.",
    "auditScreen.unreadFallback":
      "Siden kunne ikke læses; gennemgangen bruger dine angivne virksomhedsoplysninger.",
    "auditScreen.unreadHelp":
      "Scorerne er vejledende vurderinger af dit grundlag, ikke målinger af den aktive hjemmeside.",
    "auditScreen.indicative": "Vejledende · siden ikke læst",
    "auditScreen.overall": "Samlet",
    "auditScreen.estimate": "est.",
    "auditScreen.topFixes": "Prioriterede anbefalinger",
    "auditScreen.createTop": "Opret muligheder fra op til 5 prioriterede fund",
    "auditScreen.noneRemaining":
      "Der er ingen resterende fund med høj eller middel prioritet at omdanne.",
    "auditScreen.scoreHelp":
      "Højere scorer angiver en stærkere vurdering. De måler ikke aktuelle placeringer eller teknisk ydeevne.",
    "auditScreen.category.Business Clarity": "Klarhed om virksomheden",
    "auditScreen.category.SEO Basics": "Grundlæggende SEO",
    "auditScreen.category.Local Visibility": "Lokal synlighed",
    "auditScreen.category.AI Readiness": "Parathed til AI-svar",
    "auditScreen.category.Conversion & Trust": "Konvertering og tillid",
  },
};
