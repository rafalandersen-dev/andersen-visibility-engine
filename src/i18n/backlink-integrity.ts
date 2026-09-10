import type { OnboardingLanguage } from "@/lib/types";

export const backlinkIntegrity: Record<OnboardingLanguage, Record<string, string>> = {
  en: {
    "backlinks.gapNote":
      "Provider index sample requested with your domain excluded. This does not independently verify that these sites have no links to you.",
    "backlinks.integrity.partial": "Partial metrics",
    "backlinks.integrity.source":
      "Declared source: DataForSEO index at the saved analysis date, for the displayed domains including subdomains. Source labels in saved workspace data are not independent verification. — means unavailable, never zero. Index coverage is incomplete; these are not live destination checks.",
    "backlinks.integrity.legacy":
      "Legacy analysis retained. Earlier normalization could turn missing data into zeros, so its numeric basis is unavailable. Original recommendations remain historical advice.",
    "backlinks.integrity.scores":
      "Scores and recommendations are AI estimates from the available evidence, not provider measurements, ranking guarantees or measured outcomes.",
    "backlinks.integrity.sample":
      "Bounded top-domain sample. Omitted domains do not prove absent or lost links; no ongoing monitoring is established.",
    "backlinks.integrity.failed":
      "Request failed. This table is unavailable; it does not mean zero backlinks or no link gap.",
    "backlinks.integrity.not_requested":
      "Gap sample was not requested because no competitor domains were supplied.",
    "backlinks.integrity.unknown": "The table's collection status is unknown.",
    "backlinks.integrity.empty":
      "No rows to display. Check the collection status above before interpreting this table.",
  },
  pl: {
    "backlinks.gapNote":
      "Próbka indeksu dostawcy z żądanym wykluczeniem Twojej domeny. Nie jest to niezależne potwierdzenie, że te witryny nie mają linków do Ciebie.",
    "backlinks.integrity.partial": "Częściowe dane",
    "backlinks.integrity.source":
      "Deklarowane źródło: indeks DataForSEO z daty zapisanej analizy, dla widocznych domen wraz z subdomenami. Etykiety źródła w danych obszaru roboczego nie są niezależną weryfikacją. — oznacza brak danych, nigdy zero. Indeks jest niepełny; nie jest to bieżąca kontrola stron docelowych.",
    "backlinks.integrity.legacy":
      "Zachowano wcześniejszą analizę. Poprzednia normalizacja mogła zamieniać brak danych na zera, więc podstawa liczbowa jest niedostępna. Oryginalne rekomendacje pozostają historycznymi poradami.",
    "backlinks.integrity.scores":
      "Oceny i rekomendacje to szacunki AI na podstawie dostępnych danych, a nie pomiary dostawcy, gwarancje pozycji ani zmierzone wyniki.",
    "backlinks.integrity.sample":
      "Ograniczona próbka czołowych domen. Pominięte domeny nie dowodzą braku ani utraty linków; nie potwierdza to ciągłego monitorowania.",
    "backlinks.integrity.failed":
      "Żądanie nie powiodło się. Tabela jest niedostępna; nie oznacza to zera linków ani braku luki linkowej.",
    "backlinks.integrity.not_requested":
      "Nie pobrano próbki luki, ponieważ nie podano domen konkurentów.",
    "backlinks.integrity.unknown": "Status zbierania danych tabeli jest nieznany.",
    "backlinks.integrity.empty":
      "Brak wierszy do wyświetlenia. Przed interpretacją sprawdź status zbierania danych powyżej.",
  },
  sv: {
    "backlinks.gapNote":
      "Leverantörens indexurval med begärd uteslutning av din domän. Det verifierar inte oberoende att dessa webbplatser saknar länkar till dig.",
    "backlinks.integrity.partial": "Delvis tillgängliga mätvärden",
    "backlinks.integrity.source":
      "Angiven källa: DataForSEO-index vid det sparade analysdatumet, för visade domäner inklusive underdomäner. Källetiketter i sparade arbetsytedata är inte oberoende verifiering. — betyder otillgängligt, aldrig noll. Indexets täckning är ofullständig; detta är inte aktuella kontroller av målsidor.",
    "backlinks.integrity.legacy":
      "Äldre analys bevarad. Tidigare normalisering kan ha ersatt saknade data med nollor, så det numeriska underlaget är otillgängligt. Ursprungliga rekommendationer är historiska råd.",
    "backlinks.integrity.scores":
      "Poäng och rekommendationer är AI-uppskattningar från tillgängliga belägg, inte leverantörsmätningar, rankinggarantier eller uppmätta resultat.",
    "backlinks.integrity.sample":
      "Begränsat urval av topprankade domäner. Utelämnade domäner bevisar inte saknade eller förlorade länkar; löpande övervakning är inte etablerad.",
    "backlinks.integrity.failed":
      "Begäran misslyckades. Tabellen är otillgänglig; det betyder inte noll länkar eller ingen länklucka.",
    "backlinks.integrity.not_requested":
      "Inget urval av länkluckor begärdes eftersom inga konkurrentdomäner angavs.",
    "backlinks.integrity.unknown": "Tabellens insamlingsstatus är okänd.",
    "backlinks.integrity.empty":
      "Inga rader att visa. Kontrollera insamlingsstatusen ovan innan du tolkar tabellen.",
  },
  da: {
    "backlinks.gapNote":
      "Leverandørens indeksudvalg med anmodet udelukkelse af dit domæne. Det verificerer ikke uafhængigt, at disse websteder ikke har links til dig.",
    "backlinks.integrity.partial": "Delvist tilgængelige målinger",
    "backlinks.integrity.source":
      "Angivet kilde: DataForSEO-indeks på den gemte analysedato for de viste domæner inklusive underdomæner. Kildeetiketter i gemte arbejdsområdedata er ikke uafhængig verificering. — betyder utilgængeligt, aldrig nul. Indeksets dækning er ufuldstændig; dette er ikke aktuelle kontroller af målsider.",
    "backlinks.integrity.legacy":
      "Ældre analyse bevaret. Tidligere normalisering kan have erstattet manglende data med nuller, så det numeriske grundlag er utilgængeligt. Oprindelige anbefalinger er historiske råd.",
    "backlinks.integrity.scores":
      "Scorer og anbefalinger er AI-estimater ud fra tilgængelig dokumentation, ikke leverandørmålinger, rankinggarantier eller målte resultater.",
    "backlinks.integrity.sample":
      "Begrænset udvalg af topdomæner. Udeladte domæner beviser ikke manglende eller mistede links; løbende overvågning er ikke etableret.",
    "backlinks.integrity.failed":
      "Anmodningen mislykkedes. Tabellen er utilgængelig; det betyder ikke nul links eller intet linkgab.",
    "backlinks.integrity.not_requested":
      "Der blev ikke anmodet om en prøve af linkgabet, fordi ingen konkurrentdomæner blev angivet.",
    "backlinks.integrity.unknown": "Tabellens indsamlingsstatus er ukendt.",
    "backlinks.integrity.empty":
      "Ingen rækker at vise. Kontrollér indsamlingsstatussen ovenfor, før du fortolker tabellen.",
  },
};
