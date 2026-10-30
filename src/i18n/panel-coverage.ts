/** Coverage of approved measurement panels (CG-03B): read-only presentation of the server's canonical reports.
 * Distinct planned observations, record outcomes, extra and unmatched records, brand-run allowances and
 * unattributed deleted history stay separate facts; unknown stays unknown. Polish, Swedish and Danish are
 * author-written; no fluent-speaker acceptance is claimed. */
const en = {
  "panelCoverage.title": "Coverage of approved panels",
  "panelCoverage.intro":
    "How much of each approved panel has saved evidence. These counts describe saved records only. They are not AI visibility, a success rate or proof of business results.",
  "panelCoverage.error": "Coverage could not be loaded. No numbers are shown until it loads again.",
  "panelCoverage.empty":
    "No approved panel version yet. Coverage appears here once a panel is approved.",
  "panelCoverage.missingReport":
    "No coverage report was returned for this version, so its coverage is unknown.",
  "panelCoverage.planned":
    "Planned observations: {planned} (questions: {questions} × rounds: {rounds})",
  "panelCoverage.observed": "Planned observations with saved evidence: {observed} of {planned}",
  "panelCoverage.observedHelp":
    "One planned observation is one question in one round. It counts once if any record is saved for it, including failed, cut-off or off-protocol records. It is not the number of successful answers or citations.",
  "panelCoverage.erased": "Planned observations whose saved evidence was deleted: {count}",
  "panelCoverage.neverObserved":
    "Planned observations not recorded yet (deleted ones not included): {count}",
  "panelCoverage.neverObservedUnknown":
    "Planned observations not recorded yet (deleted ones not included): unknown",
  "panelCoverage.incomplete":
    "Completeness is unknown for this version: some saved history could not be matched to a planned observation or was not fully available. Saved and deleted counts may be higher than shown, and no count of missing observations is given.",
  "panelCoverage.brandIntro":
    "Brand panels are measured in separately approved runs, not in a planned grid.",
  "panelCoverage.brandNoRuns": "No approved run for this version.",
  "panelCoverage.brandRun":
    "Run approved {date}: allowance {budget} observations, used {consumed}, saved now {observed}, deleted {erased}",
  "panelCoverage.dateUnknown": "date unavailable",
  "panelCoverage.brandHelp":
    "Allowance and use are numbers of observations, not money. Used observations stay counted after their evidence is deleted.",
  "panelCoverage.details": "Record details",
  "panelCoverage.outcomesTitle":
    "Saved records by result. These do not have to add up to the planned observations above.",
  "panelCoverage.outcome.complete": "Complete: {count}",
  "panelCoverage.outcome.failed": "Failed: {count}",
  "panelCoverage.outcome.truncated": "Cut off: {count}",
  "panelCoverage.outcome.missed": "Marked as missed: {count}",
  "panelCoverage.outcome.protocol_deviant": "Not following the panel rules: {count}",
  "panelCoverage.liveExtra": "Additional saved records at already-recorded observations: {count}",
  "panelCoverage.erasedExtra":
    "Additional deleted records at already-recorded observations: {count}",
  "panelCoverage.extraHelp":
    "Additional records do not add coverage and are not necessarily retries.",
  "panelCoverage.excluded": "Records that do not match a planned observation: {count}",
  "panelCoverage.overflow":
    "{count} deleted records can no longer be matched to any saved panel version. They are not included in any count above.",
  "panelCoverage.source":
    "Read from your saved panel records and refreshed after you save or approve a panel. Nothing here collects new answers.",
} as const;
type Copy = Record<keyof typeof en, string>;
const pl: Copy = {
  "panelCoverage.title": "Pokrycie zatwierdzonych paneli",
  "panelCoverage.intro":
    "Jaka część każdego zatwierdzonego panelu ma zapisane dowody. Liczby opisują tylko zapisane rekordy. Nie są widocznością w AI, wskaźnikiem sukcesu ani dowodem wyników biznesowych.",
  "panelCoverage.error":
    "Nie udało się wczytać pokrycia. Liczby nie są pokazywane, dopóki nie wczyta się ponownie.",
  "panelCoverage.empty":
    "Nie ma jeszcze zatwierdzonej wersji panelu. Pokrycie pojawi się tutaj po zatwierdzeniu panelu.",
  "panelCoverage.missingReport":
    "Dla tej wersji nie zwrócono raportu pokrycia, więc jej pokrycie jest nieznane.",
  "panelCoverage.planned":
    "Planowane obserwacje: {planned} (pytania: {questions} × rundy: {rounds})",
  "panelCoverage.observed": "Planowane obserwacje z zapisanym dowodem: {observed} z {planned}",
  "panelCoverage.observedHelp":
    "Jedna planowana obserwacja to jedno pytanie w jednej rundzie. Liczy się raz, jeśli zapisano dla niej jakikolwiek rekord, także nieudany, ucięty lub niezgodny z zasadami panelu. To nie jest liczba udanych odpowiedzi ani cytowań.",
  "panelCoverage.erased": "Planowane obserwacje, których zapisany dowód usunięto: {count}",
  "panelCoverage.neverObserved":
    "Planowane obserwacje jeszcze niezarejestrowane (bez usuniętych): {count}",
  "panelCoverage.neverObservedUnknown":
    "Planowane obserwacje jeszcze niezarejestrowane (bez usuniętych): nieznane",
  "panelCoverage.incomplete":
    "Kompletność tej wersji jest nieznana: części zapisanej historii nie udało się przypisać do planowanej obserwacji albo nie była w pełni dostępna. Liczby zapisanych i usuniętych mogą być wyższe niż pokazane, a liczba brakujących obserwacji nie jest podawana.",
  "panelCoverage.brandIntro":
    "Panele marki są mierzone w osobno zatwierdzanych przebiegach, a nie w planowanej siatce.",
  "panelCoverage.brandNoRuns": "Brak zatwierdzonego przebiegu dla tej wersji.",
  "panelCoverage.brandRun":
    "Przebieg zatwierdzony {date}: limit {budget} obserwacji, wykorzystano {consumed}, zapisane teraz {observed}, usunięte {erased}",
  "panelCoverage.dateUnknown": "data niedostępna",
  "panelCoverage.brandHelp":
    "Limit i wykorzystanie to liczby obserwacji, a nie pieniądze. Wykorzystane obserwacje są nadal liczone po usunięciu ich dowodów.",
  "panelCoverage.details": "Szczegóły rekordów",
  "panelCoverage.outcomesTitle":
    "Zapisane rekordy według wyniku. Nie muszą sumować się do planowanych obserwacji powyżej.",
  "panelCoverage.outcome.complete": "Pełne: {count}",
  "panelCoverage.outcome.failed": "Nieudane: {count}",
  "panelCoverage.outcome.truncated": "Ucięte: {count}",
  "panelCoverage.outcome.missed": "Oznaczone jako pominięte: {count}",
  "panelCoverage.outcome.protocol_deviant": "Niezgodne z zasadami panelu: {count}",
  "panelCoverage.liveExtra": "Dodatkowe zapisane rekordy przy już zapisanych obserwacjach: {count}",
  "panelCoverage.erasedExtra":
    "Dodatkowe usunięte rekordy przy już zapisanych obserwacjach: {count}",
  "panelCoverage.extraHelp":
    "Dodatkowe rekordy nie zwiększają pokrycia i nie muszą być ponowieniami.",
  "panelCoverage.excluded": "Rekordy niepasujące do planowanej obserwacji: {count}",
  "panelCoverage.overflow":
    "Usuniętych rekordów, których nie da się już przypisać do żadnej zapisanej wersji panelu: {count}. Nie są wliczone w żadną z powyższych liczb.",
  "panelCoverage.source":
    "Odczytane z zapisanych rekordów paneli i odświeżane po zapisaniu lub zatwierdzeniu panelu. Nic tutaj nie zbiera nowych odpowiedzi.",
};
const sv: Copy = {
  "panelCoverage.title": "Täckning för godkända paneler",
  "panelCoverage.intro":
    "Hur stor del av varje godkänd panel som har sparat underlag. Siffrorna beskriver bara sparade poster. De är inte AI-synlighet, en andel lyckade försök eller bevis för affärsresultat.",
  "panelCoverage.error":
    "Täckningen kunde inte läsas in. Inga siffror visas förrän den läses in igen.",
  "panelCoverage.empty":
    "Det finns ännu ingen godkänd panelversion. Täckningen visas här när en panel har godkänts.",
  "panelCoverage.missingReport":
    "Ingen täckningsrapport returnerades för den här versionen, så dess täckning är okänd.",
  "panelCoverage.planned":
    "Planerade observationer: {planned} (frågor: {questions} × omgångar: {rounds})",
  "panelCoverage.observed": "Planerade observationer med sparat underlag: {observed} av {planned}",
  "panelCoverage.observedHelp":
    "En planerad observation är en fråga i en omgång. Den räknas en gång om någon post har sparats för den, även misslyckade, avkortade eller regelavvikande poster. Det är inte antalet lyckade svar eller citeringar.",
  "panelCoverage.erased": "Planerade observationer vars sparade underlag har raderats: {count}",
  "panelCoverage.neverObserved":
    "Planerade observationer som ännu inte har registrerats (raderade ej medräknade): {count}",
  "panelCoverage.neverObservedUnknown":
    "Planerade observationer som ännu inte har registrerats (raderade ej medräknade): okänt",
  "panelCoverage.incomplete":
    "Fullständigheten är okänd för den här versionen: en del sparad historik kunde inte kopplas till en planerad observation eller var inte helt tillgänglig. Antalet sparade och raderade kan vara högre än vad som visas, och inget antal saknade observationer anges.",
  "panelCoverage.brandIntro":
    "Varumärkespaneler mäts i separat godkända körningar, inte i ett planerat rutnät.",
  "panelCoverage.brandNoRuns": "Ingen godkänd körning för den här versionen.",
  "panelCoverage.brandRun":
    "Körning godkänd {date}: tilldelning {budget} observationer, använda {consumed}, sparade nu {observed}, raderade {erased}",
  "panelCoverage.dateUnknown": "datum saknas",
  "panelCoverage.brandHelp":
    "Tilldelning och användning är antal observationer, inte pengar. Använda observationer räknas även efter att deras underlag har raderats.",
  "panelCoverage.details": "Detaljer om posterna",
  "panelCoverage.outcomesTitle":
    "Sparade poster efter resultat. De behöver inte summera till de planerade observationerna ovan.",
  "panelCoverage.outcome.complete": "Fullständiga: {count}",
  "panelCoverage.outcome.failed": "Misslyckade: {count}",
  "panelCoverage.outcome.truncated": "Avkortade: {count}",
  "panelCoverage.outcome.missed": "Markerade som missade: {count}",
  "panelCoverage.outcome.protocol_deviant": "Följer inte panelens regler: {count}",
  "panelCoverage.liveExtra":
    "Ytterligare sparade poster vid redan registrerade observationer: {count}",
  "panelCoverage.erasedExtra":
    "Ytterligare raderade poster vid redan registrerade observationer: {count}",
  "panelCoverage.extraHelp":
    "Ytterligare poster ökar inte täckningen och är inte nödvändigtvis nya försök.",
  "panelCoverage.excluded": "Poster som inte matchar en planerad observation: {count}",
  "panelCoverage.overflow":
    "Raderade poster som inte längre kan kopplas till någon sparad panelversion: {count}. De ingår inte i någon siffra ovan.",
  "panelCoverage.source":
    "Läst från dina sparade panelposter och uppdateras när du sparar eller godkänner en panel. Inget här samlar in nya svar.",
};
const da: Copy = {
  "panelCoverage.title": "Dækning af godkendte paneler",
  "panelCoverage.intro":
    "Hvor stor en del af hvert godkendt panel der har gemt dokumentation. Tallene beskriver kun gemte poster. De er ikke AI-synlighed, en succesrate eller bevis for forretningsresultater.",
  "panelCoverage.error":
    "Dækningen kunne ikke indlæses. Der vises ingen tal, før den indlæses igen.",
  "panelCoverage.empty":
    "Der er endnu ingen godkendt panelversion. Dækningen vises her, når et panel er godkendt.",
  "panelCoverage.missingReport":
    "Der blev ikke returneret nogen dækningsrapport for denne version, så dens dækning er ukendt.",
  "panelCoverage.planned":
    "Planlagte observationer: {planned} (spørgsmål: {questions} × runder: {rounds})",
  "panelCoverage.observed":
    "Planlagte observationer med gemt dokumentation: {observed} af {planned}",
  "panelCoverage.observedHelp":
    "En planlagt observation er ét spørgsmål i én runde. Den tælles én gang, hvis der er gemt en post for den, også mislykkede, afkortede eller regelafvigende poster. Det er ikke antallet af vellykkede svar eller citater.",
  "panelCoverage.erased": "Planlagte observationer, hvis gemte dokumentation er slettet: {count}",
  "panelCoverage.neverObserved":
    "Planlagte observationer, der endnu ikke er registreret (slettede ikke medregnet): {count}",
  "panelCoverage.neverObservedUnknown":
    "Planlagte observationer, der endnu ikke er registreret (slettede ikke medregnet): ukendt",
  "panelCoverage.incomplete":
    "Fuldstændigheden er ukendt for denne version: noget gemt historik kunne ikke knyttes til en planlagt observation eller var ikke fuldt tilgængelig. Antallet af gemte og slettede kan være højere end vist, og der angives intet antal manglende observationer.",
  "panelCoverage.brandIntro":
    "Brandpaneler måles i separat godkendte kørsler, ikke i et planlagt gitter.",
  "panelCoverage.brandNoRuns": "Ingen godkendt kørsel for denne version.",
  "panelCoverage.brandRun":
    "Kørsel godkendt {date}: tildeling {budget} observationer, brugt {consumed}, gemt nu {observed}, slettet {erased}",
  "panelCoverage.dateUnknown": "dato ikke tilgængelig",
  "panelCoverage.brandHelp":
    "Tildeling og forbrug er antal observationer, ikke penge. Brugte observationer tælles stadig, efter at deres dokumentation er slettet.",
  "panelCoverage.details": "Detaljer om posterne",
  "panelCoverage.outcomesTitle":
    "Gemte poster efter resultat. De behøver ikke at summere til de planlagte observationer ovenfor.",
  "panelCoverage.outcome.complete": "Komplette: {count}",
  "panelCoverage.outcome.failed": "Mislykkede: {count}",
  "panelCoverage.outcome.truncated": "Afkortede: {count}",
  "panelCoverage.outcome.missed": "Markeret som misset: {count}",
  "panelCoverage.outcome.protocol_deviant": "Følger ikke panelets regler: {count}",
  "panelCoverage.liveExtra":
    "Yderligere gemte poster ved allerede registrerede observationer: {count}",
  "panelCoverage.erasedExtra":
    "Yderligere slettede poster ved allerede registrerede observationer: {count}",
  "panelCoverage.extraHelp":
    "Yderligere poster øger ikke dækningen og er ikke nødvendigvis nye forsøg.",
  "panelCoverage.excluded": "Poster, der ikke matcher en planlagt observation: {count}",
  "panelCoverage.overflow":
    "Slettede poster, der ikke længere kan knyttes til nogen gemt panelversion: {count}. De indgår ikke i nogen af tallene ovenfor.",
  "panelCoverage.source":
    "Læst fra dine gemte panelposter og opdateret, når du gemmer eller godkender et panel. Intet her indsamler nye svar.",
};
export const panelCoverageCopy = { en, pl, sv, da } as const;
