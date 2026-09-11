import type { OnboardingLanguage } from "@/lib/types";
export const backlinkDetailsCopy: Record<OnboardingLanguage, Record<string, string>> = {
  en: {
    "backlinkDetails.title": "Individual backlink evidence",
    "backlinkDetails.note":
      "Representative links from the DataForSEO index, up to 100 per request. First-seen and last-seen dates describe the index; actual placement and removal dates are unknown. This is not a complete link inventory. Requests consume the configured supplier allowance.",
    "backlinkDetails.run": "Collect link details",
    "backlinkDetails.selection": "Date selection",
    "backlinkDetails.first_seen": "First seen in period",
    "backlinkDetails.lost_last_seen": "Reported lost, last seen in period",
    "backlinkDetails.limit": "Maximum results",
    "backlinkDetails.counts":
      "Showing {retained} of {returned} returned links; {total} provider matches.",
    "backlinkDetails.partial":
      "More provider results or omitted evidence exist. To collect another page, start another request and set the number of results to skip. Each page uses supplier allowance. The live index may change between pages.",
    "backlinkDetails.noLinks": "No retained links for this request.",
    "backlinkDetails.source": "Referring page",
    "backlinkDetails.target": "Destination",
    "backlinkDetails.anchor": "Anchor text",
    "backlinkDetails.first": "First seen (UTC)",
    "backlinkDetails.last": "Last seen (UTC)",
    "backlinkDetails.rank": "Provider rank",
    "backlinkDetails.spam": "Spam score",
    "backlinkDetails.lost": "Reported lost",
    "backlinkDetails.offset": "Skip results (0–20,000)",
  },
  pl: {
    "backlinkDetails.title": "Dowody dotyczące linków zwrotnych",
    "backlinkDetails.note":
      "Reprezentatywne linki z indeksu DataForSEO, do 100 na żądanie. Daty pierwszego i ostatniego wykrycia opisują indeks; rzeczywiste daty publikacji i usunięcia są nieznane. To nie jest pełny wykaz linków. Żądania wykorzystują skonfigurowany limit dostawcy.",
    "backlinkDetails.run": "Pobierz szczegóły linków",
    "backlinkDetails.selection": "Wybór daty",
    "backlinkDetails.first_seen": "Pierwsze wykrycie w okresie",
    "backlinkDetails.lost_last_seen": "Zgłoszone jako utracone, ostatnio wykryte w okresie",
    "backlinkDetails.limit": "Maksymalna liczba wyników",
    "backlinkDetails.counts":
      "Wyświetlono {retained} z {returned} zwróconych linków; {total} dopasowań dostawcy.",
    "backlinkDetails.partial":
      "Istnieją dalsze wyniki lub pominięte dowody. Aby pobrać kolejną stronę, rozpocznij nowe żądanie i ustaw liczbę pomijanych wyników. Każda strona wykorzystuje limit dostawcy. Indeks może się zmieniać między stronami.",
    "backlinkDetails.noLinks": "Brak zachowanych linków dla tego żądania.",
    "backlinkDetails.source": "Strona odsyłająca",
    "backlinkDetails.target": "Strona docelowa",
    "backlinkDetails.anchor": "Tekst odnośnika",
    "backlinkDetails.first": "Pierwsze wykrycie (UTC)",
    "backlinkDetails.last": "Ostatnie wykrycie (UTC)",
    "backlinkDetails.rank": "Ocena dostawcy",
    "backlinkDetails.spam": "Wskaźnik spamu",
    "backlinkDetails.lost": "Zgłoszony jako utracony",
    "backlinkDetails.offset": "Pomiń wyniki (0–20 000)",
  },
  sv: {
    "backlinkDetails.title": "Underlag för enskilda bakåtlänkar",
    "backlinkDetails.note":
      "Representativa länkar från DataForSEO-indexet, högst 100 per begäran. Första och senaste observation gäller indexet; faktiska publicerings- och borttagningsdatum är okända. Detta är ingen fullständig länkförteckning. Begäranden använder den konfigurerade leverantörsbudgeten.",
    "backlinkDetails.run": "Hämta länkdetaljer",
    "backlinkDetails.selection": "Datumurval",
    "backlinkDetails.first_seen": "Först sedd under perioden",
    "backlinkDetails.lost_last_seen": "Rapporterad förlorad, senast sedd under perioden",
    "backlinkDetails.limit": "Högsta antal resultat",
    "backlinkDetails.counts":
      "Visar {retained} av {returned} returnerade länkar; {total} träffar hos leverantören.",
    "backlinkDetails.partial":
      "Fler resultat eller utelämnade underlag finns. Starta en ny begäran och ange antalet resultat att hoppa över för nästa sida. Varje sida använder leverantörsbudgeten. Indexet kan ändras mellan sidorna.",
    "backlinkDetails.noLinks": "Inga sparade länkar för denna begäran.",
    "backlinkDetails.source": "Hänvisande sida",
    "backlinkDetails.target": "Målsida",
    "backlinkDetails.anchor": "Länktext",
    "backlinkDetails.first": "Först sedd (UTC)",
    "backlinkDetails.last": "Senast sedd (UTC)",
    "backlinkDetails.rank": "Leverantörens rang",
    "backlinkDetails.spam": "Spampoäng",
    "backlinkDetails.lost": "Rapporterad förlorad",
    "backlinkDetails.offset": "Hoppa över resultat (0–20 000)",
  },
  da: {
    "backlinkDetails.title": "Dokumentation for enkelte backlinks",
    "backlinkDetails.note":
      "Repræsentative links fra DataForSEO-indekset, højst 100 pr. anmodning. Første og seneste observation gælder indekset; faktiske udgivelses- og fjernelsesdatoer er ukendte. Dette er ikke en komplet linkoversigt. Anmodninger bruger det konfigurerede leverandørbudget.",
    "backlinkDetails.run": "Hent linkdetaljer",
    "backlinkDetails.selection": "Datovalg",
    "backlinkDetails.first_seen": "Først set i perioden",
    "backlinkDetails.lost_last_seen": "Rapporteret mistet, senest set i perioden",
    "backlinkDetails.limit": "Maksimalt antal resultater",
    "backlinkDetails.counts":
      "Viser {retained} af {returned} returnerede links; {total} leverandørresultater.",
    "backlinkDetails.partial":
      "Der findes flere resultater eller udeladt dokumentation. Start en ny anmodning og angiv antallet af resultater, der skal springes over, for næste side. Hver side bruger leverandørbudgettet. Indekset kan ændres mellem siderne.",
    "backlinkDetails.noLinks": "Ingen gemte links for denne anmodning.",
    "backlinkDetails.source": "Henvisende side",
    "backlinkDetails.target": "Destination",
    "backlinkDetails.anchor": "Linktekst",
    "backlinkDetails.first": "Først set (UTC)",
    "backlinkDetails.last": "Senest set (UTC)",
    "backlinkDetails.rank": "Leverandørrang",
    "backlinkDetails.spam": "Spamscore",
    "backlinkDetails.lost": "Rapporteret mistet",
    "backlinkDetails.offset": "Spring resultater over (0–20.000)",
  },
};
