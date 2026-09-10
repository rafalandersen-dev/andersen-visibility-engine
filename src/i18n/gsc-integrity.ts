import type { OnboardingLanguage } from "@/lib/types";
export const gscIntegrity: Record<OnboardingLanguage, Record<string, string>> = {
  en: {
    "launch.conn.gsc.synced":
      "Saved import declares an API source; current connection and provenance are not independently verified.",
    "launch.conn.gsc.csvOnly":
      "Owner-supplied CSV retained; it does not establish OAuth connection status.",
    "gsc.integrity.property": "Declared Search Console property",
    "gsc.integrity.start": "Start date (inclusive)",
    "gsc.integrity.end": "End date (inclusive)",
    "gsc.integrity.preview": "Preview CSV",
    "gsc.integrity.save": "Save reviewed import",
    "gsc.integrity.previewInfo":
      "{rows} rows validated locally. First five shown below; nothing is saved until you confirm.",
    "gsc.integrity.capacity":
      "Five imports are already retained. Remove an old import explicitly before adding another.",
    "gsc.integrity.disclaimer":
      "Saved source and property are declarations, not independent verification. — means unavailable, never zero. Tables may omit traffic. These dates are separate from the report month and publication date. Search observations do not establish causality or conversions.",
    "gsc.integrity.legacy":
      "Legacy import: original data retained. Numeric basis cannot be recovered reliably; preview a fresh export to use these metrics.",
    "gsc.integrity.aggregate":
      "Declared API property aggregate. Query and page tables are separate top-row samples and are not added together. Web search, finalized data, Pacific calendar days.",
    "gsc.integrity.rows":
      "Subtotal of this CSV table only. It is not a complete property total; query anonymization, filters and omitted rows may affect coverage.",
    "gsc.integrity.unknown":
      "Aggregate unavailable. Overlapping or ambiguous rows cannot establish a total.",
    "gsc.integrity.separate": "See onsite analytics separately",
    "gsc.integrity.invalid":
      "CSV could not be validated. Use one Query, Page or Date table, at most 1,000 rows / 2 MB, unique rows and columns, plain numeric values without thousands separators, and blank cells for unavailable metrics. Supply a valid property and date window. Page URLs must belong to that property and have no credentials, query strings or fragments.",
    "gsc.sourceApi": "Declared API source",
    "gsc.sourceCsv": "Owner-supplied CSV",
    "gsc.rec.waitOrPromote": "Measurement unavailable",
    "gsc.helper":
      "One table per CSV, up to 1,000 rows and 2 MB. Use decimals without thousands separators; CTR uses 0–1 fractions or an explicit % suffix. Review the property, dates and preview before saving.",
  },
  pl: {
    "launch.conn.gsc.synced":
      "Zapisany import deklaruje źródło API; bieżące połączenie i pochodzenie nie są niezależnie zweryfikowane.",
    "launch.conn.gsc.csvOnly":
      "Zachowano CSV od właściciela; nie potwierdza to stanu połączenia OAuth.",
    "gsc.integrity.property": "Deklarowana usługa Search Console",
    "gsc.integrity.start": "Data początkowa (włącznie)",
    "gsc.integrity.end": "Data końcowa (włącznie)",
    "gsc.integrity.preview": "Podgląd CSV",
    "gsc.integrity.save": "Zapisz sprawdzony import",
    "gsc.integrity.previewInfo":
      "Lokalnie sprawdzono {rows} wierszy. Poniżej pierwsze pięć; zapis nastąpi dopiero po potwierdzeniu.",
    "gsc.integrity.capacity":
      "Zachowano już pięć importów. Usuń wybrany stary import przed dodaniem kolejnego.",
    "gsc.integrity.disclaimer":
      "Zapisane źródło i usługa to deklaracje, nie niezależna weryfikacja. — oznacza brak danych, nigdy zero. Tabele mogą pomijać ruch. Daty są niezależne od miesiąca raportu i publikacji. Obserwacje wyszukiwania nie dowodzą przyczynowości ani konwersji.",
    "gsc.integrity.legacy":
      "Starszy import: zachowano oryginalne dane. Nie można wiarygodnie odtworzyć podstawy liczb; sprawdź nowy eksport, aby użyć metryk.",
    "gsc.integrity.aggregate":
      "Deklarowany agregat usługi z API. Zapytania i strony są osobnymi próbkami najważniejszych wierszy i nie są sumowane. Wyszukiwanie web, dane końcowe, dni w strefie pacyficznej.",
    "gsc.integrity.rows":
      "Suma tylko tej tabeli CSV. Nie jest pełną sumą usługi; anonimizacja zapytań, filtry i pominięte wiersze mogą ograniczać pokrycie.",
    "gsc.integrity.unknown":
      "Agregat niedostępny. Nakładające się lub niejednoznaczne wiersze nie pozwalają obliczyć sumy.",
    "gsc.integrity.separate": "Zobacz osobno analitykę witryny",
    "gsc.integrity.invalid":
      "Nie udało się sprawdzić CSV. Użyj jednej tabeli Query, Page lub Date, maksymalnie 1000 wierszy / 2 MB, unikalnych wierszy i kolumn oraz liczb bez separatorów tysięcy. Brakujące metryki pozostaw puste. Podaj poprawną usługę i zakres dat. Adresy stron muszą należeć do usługi i nie mogą zawierać danych logowania, parametrów ani fragmentów.",
    "gsc.sourceApi": "Deklarowane źródło API",
    "gsc.sourceCsv": "CSV od właściciela",
    "gsc.rec.waitOrPromote": "Pomiar niedostępny",
    "gsc.helper":
      "Jedna tabela CSV, do 1000 wierszy i 2 MB. Liczby dziesiętne bez separatorów tysięcy; CTR jako ułamek 0–1 lub z %. Sprawdź usługę, daty i podgląd przed zapisem.",
  },
  sv: {
    "launch.conn.gsc.synced":
      "Sparad import anger API som källa; aktuell anslutning och ursprung är inte oberoende verifierade.",
    "launch.conn.gsc.csvOnly":
      "CSV från ägaren bevaras; den fastställer inte OAuth-anslutningens status.",
    "gsc.integrity.property": "Angiven Search Console-egendom",
    "gsc.integrity.start": "Startdatum (inklusive)",
    "gsc.integrity.end": "Slutdatum (inklusive)",
    "gsc.integrity.preview": "Förhandsgranska CSV",
    "gsc.integrity.save": "Spara granskad import",
    "gsc.integrity.previewInfo":
      "{rows} rader har validerats lokalt. De första fem visas; inget sparas förrän du bekräftar.",
    "gsc.integrity.capacity":
      "Fem importer finns redan sparade. Ta uttryckligen bort en äldre import innan du lägger till en ny.",
    "gsc.integrity.disclaimer":
      "Sparad källa och egendom är uppgifter, inte oberoende verifiering. — betyder otillgängligt, aldrig noll. Tabeller kan utelämna trafik. Datumen är skilda från rapportmånaden och publiceringsdatumet. Sökobservationer visar inte orsakssamband eller konverteringar.",
    "gsc.integrity.legacy":
      "Äldre import: originaldata bevaras. Sifferunderlaget kan inte återskapas tillförlitligt; förhandsgranska en ny export för att använda mätvärdena.",
    "gsc.integrity.aggregate":
      "Angivet API-aggregat för egendomen. Sökfrågor och sidor är separata urval av topprader och läggs inte ihop. Webbsökning, slutliga data, kalenderdagar i Stillahavstid.",
    "gsc.integrity.rows":
      "Delsumma endast för denna CSV-tabell. Den är inte en fullständig egendomssumma; anonymiserade frågor, filter och utelämnade rader kan påverka täckningen.",
    "gsc.integrity.unknown":
      "Aggregat saknas. Överlappande eller tvetydiga rader kan inte fastställa en totalsumma.",
    "gsc.integrity.separate": "Se webbplatsanalys separat",
    "gsc.integrity.invalid":
      "CSV kunde inte valideras. Använd en Query-, Page- eller Date-tabell, högst 1 000 rader / 2 MB, unika rader och kolumner, tal utan tusentalsavgränsare och tomma celler för saknade mätvärden. Ange giltig egendom och datumperiod. Sidans URL måste tillhöra egendomen och sakna inloggningsuppgifter, frågesträngar och fragment.",
    "gsc.sourceApi": "Angiven API-källa",
    "gsc.sourceCsv": "CSV från ägaren",
    "gsc.rec.waitOrPromote": "Mätning saknas",
    "gsc.helper":
      "En tabell per CSV, högst 1 000 rader och 2 MB. Decimaler utan tusentalsavgränsare; CTR som 0–1 eller med %. Granska egendom, datum och förhandsvisning före sparande.",
  },
  da: {
    "launch.conn.gsc.synced":
      "Gemt import angiver API som kilde; aktuel forbindelse og oprindelse er ikke uafhængigt verificeret.",
    "launch.conn.gsc.csvOnly":
      "CSV fra ejeren bevares; den fastlægger ikke OAuth-forbindelsens status.",
    "gsc.integrity.property": "Angivet Search Console-ejendom",
    "gsc.integrity.start": "Startdato (inklusive)",
    "gsc.integrity.end": "Slutdato (inklusive)",
    "gsc.integrity.preview": "Forhåndsvis CSV",
    "gsc.integrity.save": "Gem gennemgået import",
    "gsc.integrity.previewInfo":
      "{rows} rækker valideret lokalt. De første fem vises; intet gemmes, før du bekræfter.",
    "gsc.integrity.capacity":
      "Fem importer er allerede gemt. Fjern udtrykkeligt en gammel import, før du tilføjer en ny.",
    "gsc.integrity.disclaimer":
      "Gemt kilde og ejendom er angivelser, ikke uafhængig verifikation. — betyder utilgængelig, aldrig nul. Tabeller kan udelade trafik. Datoerne er adskilt fra rapportmåneden og udgivelsesdatoen. Søgeobservationer dokumenterer ikke årsagssammenhænge eller konverteringer.",
    "gsc.integrity.legacy":
      "Ældre import: originaldata bevares. Talgrundlaget kan ikke genskabes pålideligt; forhåndsvis en ny eksport for at bruge målingerne.",
    "gsc.integrity.aggregate":
      "Angivet API-aggregat for ejendommen. Søgeord og sider er separate udsnit af toprækker og lægges ikke sammen. Websøgning, endelige data, kalenderdage i stillehavstid.",
    "gsc.integrity.rows":
      "Subtotal kun for denne CSV-tabel. Det er ikke en fuldstændig ejendomstotal; anonymiserede forespørgsler, filtre og udeladte rækker kan påvirke dækningen.",
    "gsc.integrity.unknown":
      "Aggregat utilgængeligt. Overlappende eller tvetydige rækker kan ikke fastlægge en total.",
    "gsc.integrity.separate": "Se webstedsanalyse separat",
    "gsc.integrity.invalid":
      "CSV kunne ikke valideres. Brug én Query-, Page- eller Date-tabel, højst 1.000 rækker / 2 MB, entydige rækker og kolonner, tal uden tusindtalsseparatorer og tomme felter for manglende målinger. Angiv gyldig ejendom og datoperiode. Sideadresser skal tilhøre ejendommen og må ikke have loginoplysninger, forespørgselsstrenge eller fragmenter.",
    "gsc.sourceApi": "Angivet API-kilde",
    "gsc.sourceCsv": "CSV fra ejeren",
    "gsc.rec.waitOrPromote": "Måling utilgængelig",
    "gsc.helper":
      "Én tabel pr. CSV, op til 1.000 rækker og 2 MB. Decimaler uden tusindtalsseparatorer; CTR som 0–1 eller med %. Gennemgå ejendom, datoer og forhåndsvisning før lagring.",
  },
};
