import type { OnboardingLanguage } from "@/lib/types";

export const chatGptChannelCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "chatGptChannel.title": "ChatGPT channel",
    "chatGptChannel.subtitle":
      "Record what ChatGPT Business Hub and Google Analytics 4 (GA4) show for a 28-day period. Milo never reads Business Hub itself: its figures are only what you type or paste here.",
    "chatGptChannel.manualNote":
      "Figures are saved with this project. Leave a field blank if you did not measure it; enter 0 only when the source reported zero.",
    "chatGptChannel.periodEnd": "Last day of the 28-day period (UTC)",
    "chatGptChannel.periodRange": "Period: {start} → {end} (28 days, UTC)",
    "chatGptChannel.periodPending": "Choose the last day to see the 28-day period.",
    "chatGptChannel.hubHeading": "ChatGPT Business Hub (manual entry)",
    "chatGptChannel.hubHelp":
      "Copy the figures for the same 28 days from your ChatGPT Business Hub report.",
    "chatGptChannel.mentions": "Mentions",
    "chatGptChannel.clicks": "Clicks",
    "chatGptChannel.topics": "Discovery topics",
    "chatGptChannel.topicsHelp": "One topic per line, up to {max}. Blank means not recorded.",
    "chatGptChannel.ga4Heading": "Google Analytics 4 (manual entry)",
    "chatGptChannel.ga4GuideTitle": "How to find these figures in GA4",
    "chatGptChannel.ga4Step1":
      "Open Reports → Acquisition → Traffic acquisition and set the date range to the same 28 days.",
    "chatGptChannel.ga4Step2":
      "Filter Session source with an exact match (not “contains”) to chatgpt.com and to chat.openai.com. Enter the combined number of sessions.",
    "chatGptChannel.ga4Step3":
      "With the same filter, read the Event count for the event named booking_completed.",
    "chatGptChannel.ga4Step4":
      "Enter booking clicks only if your site measures them in GA4; otherwise leave the field blank. For Synergy use the booking_click event when available.",
    "chatGptChannel.sessions": "ChatGPT sessions",
    "chatGptChannel.bookingClicks": "Booking clicks (if measured)",
    "chatGptChannel.bookingCompleted": "booking_completed event count",
    "chatGptChannel.save": "Save report",
    "chatGptChannel.update": "Update report",
    "chatGptChannel.cancelEdit": "Cancel edit",
    "chatGptChannel.editing":
      "Editing the report for {start} → {end}. The period cannot be changed; saving replaces its figures.",
    "chatGptChannel.errPeriod": "Enter a valid last day (2023-01-01 or later).",
    "chatGptChannel.errFuture": "The period cannot end after today (UTC).",
    "chatGptChannel.errCount":
      "Counts must be whole numbers from 0 to 999999999. Leave blank if not measured.",
    "chatGptChannel.errTopics": "Use at most {max} topics, each up to 80 characters, one per line.",
    "chatGptChannel.errEmpty": "Enter at least one figure or topic.",
    "chatGptChannel.errCapacity":
      "The report history is full. Delete an older report before adding a new period.",
    "chatGptChannel.errSave": "Could not save the report.",
    "chatGptChannel.saved": "Report saved",
    "chatGptChannel.updated": "Report updated",
    "chatGptChannel.deleted": "Report deleted",
    "chatGptChannel.latest": "Latest report",
    "chatGptChannel.history": "Report history",
    "chatGptChannel.empty": "No ChatGPT channel report saved yet.",
    "chatGptChannel.unknown": "Not measured",
    "chatGptChannel.sourceHub": "Source: ChatGPT Business Hub (manual entry)",
    "chatGptChannel.sourceGa4": "Source: GA4 (manual entry)",
    "chatGptChannel.edit": "Edit",
    "chatGptChannel.delete": "Delete",
    "chatGptChannel.noTopics": "No topics recorded",
    "chatGptChannel.updatedOn": "Updated {date}",
    "chatGptChannel.separateNote":
      "Business Hub and GA4 figures come from different systems and are not combined or reconciled here. “Not measured” means no value was entered; 0 means the source reported zero.",
    "chatGptChannel.replacePrompt": "Replace the saved report for this period?",
    "chatGptChannel.deletePrompt": "Delete this report?",
    "chatGptChannel.api.title": "Automatic GA4 sync (test rollout)",
    "chatGptChannel.api.intro":
      "Connect Google Analytics (read-only) to fetch the last 28 complete days for the property you choose for this project: sessions from chatgpt.com and chat.openai.com, plus booking_click and booking_completed counts. Manual entries are never overwritten. “Not measured” also means GA4 recorded no such event.",
    "chatGptChannel.api.connect": "Connect Google Analytics",
    "chatGptChannel.api.connected": "Google Analytics connected",
    "chatGptChannel.api.loadProps": "Choose GA4 property",
    "chatGptChannel.api.noProps": "This Google account has no GA4 properties.",
    "chatGptChannel.api.useProp": "Use",
    "chatGptChannel.api.property": "Property: {name} ({id}) · time zone {tz}",
    "chatGptChannel.api.refresh": "Refresh from GA4",
    "chatGptChannel.api.disconnect": "Disconnect",
    "chatGptChannel.api.disconnectPrompt":
      "Disconnect Google Analytics? Saved reports are kept. Search Console access is not changed.",
    "chatGptChannel.api.disconnected": "Google Analytics disconnected",
    "chatGptChannel.api.synced": "GA4 figures updated",
    "chatGptChannel.api.lastSuccess": "Last successful sync: {date}",
    "chatGptChannel.api.never": "Not synced yet.",
    "chatGptChannel.api.stale":
      "The last refresh failed. The figures shown are from the last successful sync.",
    "chatGptChannel.api.partial":
      "GA4 withheld or limited some data (thresholding or row limits). Zero is shown as “Not measured” and counts may be lower bounds.",
    "chatGptChannel.api.cbConnected": "Google Analytics connected. Choose a property.",
    "chatGptChannel.api.cbDenied": "Google Analytics access was not granted.",
    "chatGptChannel.api.cbError": "Could not connect Google Analytics.",
    "chatGptChannel.api.err.not_available": "Automatic GA4 sync is not available for this project.",
    "chatGptChannel.api.err.not_configured":
      "Automatic GA4 sync is not set up on this server. Manual entry still works.",
    "chatGptChannel.paste.title": "Paste from Business Hub",
    "chatGptChannel.paste.help":
      "Copy the visible summary in ChatGPT Business Hub and paste it here. Only Mentions and Website clicks are read; Profile views and the chart are ignored. “Unavailable” stays Not measured. The pasted text stays in this browser and is not saved.",
    "chatGptChannel.paste.label": "Business Hub summary text",
    "chatGptChannel.paste.apply": "Fill figures",
    "chatGptChannel.paste.verifyPeriod":
      "The period is not read from the paste. Check that the last day above matches the period shown in Business Hub before saving.",
    "chatGptChannel.paste.filled": "Filled: {fields}. Review the figures and the period before saving.",
    "chatGptChannel.paste.missing": "Not found in the pasted text, left unchanged: {fields}.",
    "chatGptChannel.paste.unreadable":
      "No single whole number or “Unavailable” found for {fields}; left unchanged.",
    "chatGptChannel.paste.replacePrompt": "Replace the values already entered for {fields}?",
    "chatGptChannel.api.err.not_connected": "Connect Google Analytics first.",
    "chatGptChannel.api.err.expired": "The Google connection expired. Reconnect Google Analytics.",
    "chatGptChannel.api.err.no_property": "Choose a GA4 property for this project.",
    "chatGptChannel.api.err.access_denied":
      "This Google account cannot read that GA4 property. Choose another or reconnect.",
    "chatGptChannel.api.err.api_disabled":
      "The Google Analytics Data API is not enabled for this app's Google project.",
    "chatGptChannel.api.err.unavailable": "Google is temporarily unavailable. Try again later.",
    "chatGptChannel.api.err.failed": "Could not read GA4 data. Nothing was changed.",
    "chatGptChannel.sourceGa4Api":
      "Source: GA4 Data API · {name} · {start} → {end} ({tz}) · fetched {date}",
  },
  pl: {
    "chatGptChannel.title": "Kanał ChatGPT",
    "chatGptChannel.subtitle":
      "Zapisz dane z ChatGPT Business Hub i Google Analytics 4 (GA4) za okres 28 dni. Milo nigdy nie odczytuje Business Hub samodzielnie: jego dane to tylko to, co tu wpiszesz lub wkleisz.",
    "chatGptChannel.manualNote":
      "Dane są zapisywane w tym projekcie. Zostaw pole puste, jeśli nie mierzono wartości; wpisz 0 tylko wtedy, gdy źródło podało zero.",
    "chatGptChannel.periodEnd": "Ostatni dzień 28-dniowego okresu (UTC)",
    "chatGptChannel.periodRange": "Okres: {start} → {end} (28 dni, UTC)",
    "chatGptChannel.periodPending": "Wybierz ostatni dzień, aby zobaczyć 28-dniowy okres.",
    "chatGptChannel.hubHeading": "ChatGPT Business Hub (wpis ręczny)",
    "chatGptChannel.hubHelp": "Przepisz dane za te same 28 dni z raportu ChatGPT Business Hub.",
    "chatGptChannel.mentions": "Wzmianki",
    "chatGptChannel.clicks": "Kliknięcia",
    "chatGptChannel.topics": "Tematy odkrywania",
    "chatGptChannel.topicsHelp":
      "Jeden temat w wierszu, maksymalnie {max}. Puste oznacza brak zapisu.",
    "chatGptChannel.ga4Heading": "Google Analytics 4 (wpis ręczny)",
    "chatGptChannel.ga4GuideTitle": "Gdzie znaleźć te dane w GA4",
    "chatGptChannel.ga4Step1":
      "Otwórz Raporty → Pozyskiwanie → Pozyskiwanie ruchu i ustaw ten sam 28-dniowy zakres dat.",
    "chatGptChannel.ga4Step2":
      "Przefiltruj Źródło sesji dokładnym dopasowaniem (nie „zawiera”) do chatgpt.com oraz chat.openai.com. Wpisz łączną liczbę sesji.",
    "chatGptChannel.ga4Step3":
      "Z tym samym filtrem odczytaj Liczbę zdarzeń dla zdarzenia o nazwie booking_completed.",
    "chatGptChannel.ga4Step4":
      "Kliknięcia rezerwacji wpisz tylko wtedy, gdy Twoja witryna mierzy je w GA4; w przeciwnym razie zostaw pole puste. Dla Synergy użyj zdarzenia booking_click, gdy jest dostępne.",
    "chatGptChannel.sessions": "Sesje z ChatGPT",
    "chatGptChannel.bookingClicks": "Kliknięcia rezerwacji (jeśli mierzone)",
    "chatGptChannel.bookingCompleted": "Liczba zdarzeń booking_completed",
    "chatGptChannel.save": "Zapisz raport",
    "chatGptChannel.update": "Zaktualizuj raport",
    "chatGptChannel.cancelEdit": "Anuluj edycję",
    "chatGptChannel.editing":
      "Edytujesz raport za okres {start} → {end}. Okresu nie można zmienić; zapis zastąpi jego dane.",
    "chatGptChannel.errPeriod": "Podaj prawidłowy ostatni dzień (od 2023-01-01).",
    "chatGptChannel.errFuture": "Okres nie może kończyć się po dzisiejszym dniu (UTC).",
    "chatGptChannel.errCount":
      "Wartości muszą być liczbami całkowitymi od 0 do 999999999. Zostaw puste, jeśli nie mierzono.",
    "chatGptChannel.errTopics":
      "Użyj najwyżej {max} tematów, każdy do 80 znaków, po jednym w wierszu.",
    "chatGptChannel.errEmpty": "Wpisz co najmniej jedną wartość lub temat.",
    "chatGptChannel.errCapacity":
      "Historia raportów jest pełna. Usuń starszy raport, aby dodać nowy okres.",
    "chatGptChannel.errSave": "Nie udało się zapisać raportu.",
    "chatGptChannel.saved": "Raport zapisany",
    "chatGptChannel.updated": "Raport zaktualizowany",
    "chatGptChannel.deleted": "Raport usunięty",
    "chatGptChannel.latest": "Najnowszy raport",
    "chatGptChannel.history": "Historia raportów",
    "chatGptChannel.empty": "Nie zapisano jeszcze raportu kanału ChatGPT.",
    "chatGptChannel.unknown": "Nie mierzono",
    "chatGptChannel.sourceHub": "Źródło: ChatGPT Business Hub (wpis ręczny)",
    "chatGptChannel.sourceGa4": "Źródło: GA4 (wpis ręczny)",
    "chatGptChannel.edit": "Edytuj",
    "chatGptChannel.delete": "Usuń",
    "chatGptChannel.noTopics": "Brak zapisanych tematów",
    "chatGptChannel.updatedOn": "Zaktualizowano {date}",
    "chatGptChannel.separateNote":
      "Dane z Business Hub i GA4 pochodzą z różnych systemów i nie są tu łączone ani uzgadniane. „Nie mierzono” oznacza brak wpisanej wartości; 0 oznacza, że źródło podało zero.",
    "chatGptChannel.replacePrompt": "Zastąpić zapisany raport za ten okres?",
    "chatGptChannel.deletePrompt": "Usunąć ten raport?",
    "chatGptChannel.api.title": "Automatyczna synchronizacja GA4 (wdrożenie testowe)",
    "chatGptChannel.api.intro":
      "Połącz Google Analytics (tylko odczyt), aby pobrać ostatnie 28 pełnych dni dla właściwości wybranej dla tego projektu: sesje z chatgpt.com i chat.openai.com oraz liczby zdarzeń booking_click i booking_completed. Wpisy ręczne nigdy nie są nadpisywane. „Nie mierzono” oznacza też, że GA4 nie zarejestrował takiego zdarzenia.",
    "chatGptChannel.api.connect": "Połącz Google Analytics",
    "chatGptChannel.api.connected": "Google Analytics połączony",
    "chatGptChannel.api.loadProps": "Wybierz właściwość GA4",
    "chatGptChannel.api.noProps": "To konto Google nie ma właściwości GA4.",
    "chatGptChannel.api.useProp": "Użyj",
    "chatGptChannel.api.property": "Właściwość: {name} ({id}) · strefa czasowa {tz}",
    "chatGptChannel.api.refresh": "Odśwież z GA4",
    "chatGptChannel.api.disconnect": "Rozłącz",
    "chatGptChannel.api.disconnectPrompt":
      "Rozłączyć Google Analytics? Zapisane raporty zostaną zachowane. Dostęp do Search Console się nie zmieni.",
    "chatGptChannel.api.disconnected": "Google Analytics rozłączony",
    "chatGptChannel.api.synced": "Dane GA4 zaktualizowane",
    "chatGptChannel.api.lastSuccess": "Ostatnia udana synchronizacja: {date}",
    "chatGptChannel.api.never": "Jeszcze nie synchronizowano.",
    "chatGptChannel.api.stale":
      "Ostatnie odświeżenie nie powiodło się. Widoczne dane pochodzą z ostatniej udanej synchronizacji.",
    "chatGptChannel.api.partial":
      "GA4 ukrył lub ograniczył część danych (progi lub limity wierszy). Zero jest pokazane jako „Nie mierzono”, a liczby mogą być dolnymi granicami.",
    "chatGptChannel.api.cbConnected": "Połączono Google Analytics. Wybierz właściwość.",
    "chatGptChannel.api.cbDenied": "Nie przyznano dostępu do Google Analytics.",
    "chatGptChannel.api.cbError": "Nie udało się połączyć z Google Analytics.",
    "chatGptChannel.api.err.not_available":
      "Automatyczna synchronizacja GA4 nie jest dostępna dla tego projektu.",
    "chatGptChannel.api.err.not_configured":
      "Automatyczna synchronizacja GA4 nie jest skonfigurowana na tym serwerze. Wpis ręczny nadal działa.",
    "chatGptChannel.paste.title": "Wklej z Business Hub",
    "chatGptChannel.paste.help":
      "Skopiuj widoczne podsumowanie z ChatGPT Business Hub i wklej je tutaj. Odczytywane są tylko Mentions i Website clicks; Profile views i wykres są pomijane. „Unavailable” pozostaje jako „Nie mierzono”. Wklejony tekst zostaje w tej przeglądarce i nie jest zapisywany.",
    "chatGptChannel.paste.label": "Tekst podsumowania z Business Hub",
    "chatGptChannel.paste.apply": "Uzupełnij dane",
    "chatGptChannel.paste.verifyPeriod":
      "Okres nie jest odczytywany z wklejonego tekstu. Przed zapisaniem sprawdź, czy ostatni dzień powyżej zgadza się z okresem w Business Hub.",
    "chatGptChannel.paste.filled":
      "Uzupełniono: {fields}. Sprawdź dane i okres przed zapisaniem.",
    "chatGptChannel.paste.missing": "Nie znaleziono we wklejonym tekście, bez zmian: {fields}.",
    "chatGptChannel.paste.unreadable":
      "Nie znaleziono jednej liczby całkowitej ani „Unavailable” dla: {fields}; bez zmian.",
    "chatGptChannel.paste.replacePrompt": "Zastąpić już wpisane wartości dla: {fields}?",
    "chatGptChannel.api.err.not_connected": "Najpierw połącz Google Analytics.",
    "chatGptChannel.api.err.expired": "Połączenie z Google wygasło. Połącz Google Analytics ponownie.",
    "chatGptChannel.api.err.no_property": "Wybierz właściwość GA4 dla tego projektu.",
    "chatGptChannel.api.err.access_denied":
      "To konto Google nie może odczytać tej właściwości GA4. Wybierz inną lub połącz ponownie.",
    "chatGptChannel.api.err.api_disabled":
      "Interfejs Google Analytics Data API nie jest włączony w projekcie Google tej aplikacji.",
    "chatGptChannel.api.err.unavailable": "Google jest chwilowo niedostępny. Spróbuj później.",
    "chatGptChannel.api.err.failed": "Nie udało się odczytać danych GA4. Nic nie zmieniono.",
    "chatGptChannel.sourceGa4Api":
      "Źródło: GA4 Data API · {name} · {start} → {end} ({tz}) · pobrano {date}",
  },
  sv: {
    "chatGptChannel.title": "ChatGPT-kanalen",
    "chatGptChannel.subtitle":
      "Registrera vad ChatGPT Business Hub och Google Analytics 4 (GA4) visar för en period på 28 dagar. Milo läser aldrig Business Hub själv: siffrorna därifrån är bara det du skriver eller klistrar in här.",
    "chatGptChannel.manualNote":
      "Siffrorna sparas i det här projektet. Lämna fältet tomt om du inte har mätt värdet; ange 0 bara när källan visade noll.",
    "chatGptChannel.periodEnd": "Sista dagen i 28-dagarsperioden (UTC)",
    "chatGptChannel.periodRange": "Period: {start} → {end} (28 dagar, UTC)",
    "chatGptChannel.periodPending": "Välj sista dagen för att se 28-dagarsperioden.",
    "chatGptChannel.hubHeading": "ChatGPT Business Hub (manuell inmatning)",
    "chatGptChannel.hubHelp":
      "Kopiera siffrorna för samma 28 dagar från din rapport i ChatGPT Business Hub.",
    "chatGptChannel.mentions": "Omnämnanden",
    "chatGptChannel.clicks": "Klick",
    "chatGptChannel.topics": "Upptäcktsämnen",
    "chatGptChannel.topicsHelp":
      "Ett ämne per rad, högst {max}. Tomt betyder att inget har registrerats.",
    "chatGptChannel.ga4Heading": "Google Analytics 4 (manuell inmatning)",
    "chatGptChannel.ga4GuideTitle": "Så hittar du siffrorna i GA4",
    "chatGptChannel.ga4Step1":
      "Öppna Rapporter → Anskaffning → Trafikanskaffning och ange samma 28 dagar som datumintervall.",
    "chatGptChannel.ga4Step2":
      "Filtrera Sessionskälla med exakt matchning (inte ”innehåller”) mot chatgpt.com och chat.openai.com. Ange det sammanlagda antalet sessioner.",
    "chatGptChannel.ga4Step3":
      "Läs med samma filter av Antal händelser för händelsen booking_completed.",
    "chatGptChannel.ga4Step4":
      "Ange bokningsklick bara om din webbplats mäter dem i GA4; lämna annars fältet tomt. För Synergy används händelsen booking_click när den finns.",
    "chatGptChannel.sessions": "Sessioner från ChatGPT",
    "chatGptChannel.bookingClicks": "Bokningsklick (om de mäts)",
    "chatGptChannel.bookingCompleted": "Antal booking_completed-händelser",
    "chatGptChannel.save": "Spara rapport",
    "chatGptChannel.update": "Uppdatera rapport",
    "chatGptChannel.cancelEdit": "Avbryt redigering",
    "chatGptChannel.editing":
      "Du redigerar rapporten för {start} → {end}. Perioden kan inte ändras; sparandet ersätter dess siffror.",
    "chatGptChannel.errPeriod": "Ange en giltig sista dag (2023-01-01 eller senare).",
    "chatGptChannel.errFuture": "Perioden kan inte sluta efter dagens datum (UTC).",
    "chatGptChannel.errCount":
      "Värden måste vara heltal från 0 till 999999999. Lämna tomt om de inte mätts.",
    "chatGptChannel.errTopics":
      "Använd högst {max} ämnen, vart och ett högst 80 tecken, ett per rad.",
    "chatGptChannel.errEmpty": "Ange minst en siffra eller ett ämne.",
    "chatGptChannel.errCapacity":
      "Rapporthistoriken är full. Ta bort en äldre rapport innan du lägger till en ny period.",
    "chatGptChannel.errSave": "Det gick inte att spara rapporten.",
    "chatGptChannel.saved": "Rapporten har sparats",
    "chatGptChannel.updated": "Rapporten har uppdaterats",
    "chatGptChannel.deleted": "Rapporten har tagits bort",
    "chatGptChannel.latest": "Senaste rapport",
    "chatGptChannel.history": "Rapporthistorik",
    "chatGptChannel.empty": "Ingen rapport för ChatGPT-kanalen har sparats ännu.",
    "chatGptChannel.unknown": "Inte mätt",
    "chatGptChannel.sourceHub": "Källa: ChatGPT Business Hub (manuell inmatning)",
    "chatGptChannel.sourceGa4": "Källa: GA4 (manuell inmatning)",
    "chatGptChannel.edit": "Redigera",
    "chatGptChannel.delete": "Ta bort",
    "chatGptChannel.noTopics": "Inga ämnen registrerade",
    "chatGptChannel.updatedOn": "Uppdaterad {date}",
    "chatGptChannel.separateNote":
      "Siffror från Business Hub och GA4 kommer från olika system och slås inte ihop eller stäms av här. ”Inte mätt” betyder att inget värde angetts; 0 betyder att källan visade noll.",
    "chatGptChannel.replacePrompt": "Ersätt den sparade rapporten för perioden?",
    "chatGptChannel.deletePrompt": "Ta bort rapporten?",
    "chatGptChannel.api.title": "Automatisk GA4-synkronisering (testutrullning)",
    "chatGptChannel.api.intro":
      "Anslut Google Analytics (skrivskyddat) för att hämta de senaste 28 hela dagarna för egenskapen du väljer för projektet: sessioner från chatgpt.com och chat.openai.com samt antal booking_click och booking_completed. Manuella uppgifter skrivs aldrig över. ”Inte mätt” betyder också att GA4 inte registrerat händelsen.",
    "chatGptChannel.api.connect": "Anslut Google Analytics",
    "chatGptChannel.api.connected": "Google Analytics är anslutet",
    "chatGptChannel.api.loadProps": "Välj GA4-egenskap",
    "chatGptChannel.api.noProps": "Det här Google-kontot har inga GA4-egenskaper.",
    "chatGptChannel.api.useProp": "Använd",
    "chatGptChannel.api.property": "Egenskap: {name} ({id}) · tidszon {tz}",
    "chatGptChannel.api.refresh": "Uppdatera från GA4",
    "chatGptChannel.api.disconnect": "Koppla från",
    "chatGptChannel.api.disconnectPrompt":
      "Koppla från Google Analytics? Sparade rapporter behålls. Åtkomsten till Search Console ändras inte.",
    "chatGptChannel.api.disconnected": "Google Analytics är frånkopplat",
    "chatGptChannel.api.synced": "GA4-siffrorna har uppdaterats",
    "chatGptChannel.api.lastSuccess": "Senaste lyckade synkronisering: {date}",
    "chatGptChannel.api.never": "Inte synkroniserat ännu.",
    "chatGptChannel.api.stale":
      "Senaste uppdateringen misslyckades. Siffrorna som visas är från senaste lyckade synkronisering.",
    "chatGptChannel.api.partial":
      "GA4 har dolt eller begränsat data (tröskelvärden eller radgränser). Noll visas som ”Inte mätt” och antal kan vara nedre gränser.",
    "chatGptChannel.api.cbConnected": "Google Analytics är anslutet. Välj en egenskap.",
    "chatGptChannel.api.cbDenied": "Åtkomst till Google Analytics beviljades inte.",
    "chatGptChannel.api.cbError": "Det gick inte att ansluta Google Analytics.",
    "chatGptChannel.api.err.not_available":
      "Automatisk GA4-synkronisering är inte tillgänglig för det här projektet.",
    "chatGptChannel.api.err.not_configured":
      "Automatisk GA4-synkronisering är inte konfigurerad på den här servern. Manuell inmatning fungerar fortfarande.",
    "chatGptChannel.paste.title": "Klistra in från Business Hub",
    "chatGptChannel.paste.help":
      "Kopiera den synliga sammanfattningen i ChatGPT Business Hub och klistra in den här. Endast Mentions och Website clicks läses; Profile views och diagrammet ignoreras. ”Unavailable” förblir ”Inte mätt”. Den inklistrade texten stannar i den här webbläsaren och sparas inte.",
    "chatGptChannel.paste.label": "Sammanfattningstext från Business Hub",
    "chatGptChannel.paste.apply": "Fyll i siffror",
    "chatGptChannel.paste.verifyPeriod":
      "Perioden läses inte från den inklistrade texten. Kontrollera att sista dagen ovan stämmer med perioden i Business Hub innan du sparar.",
    "chatGptChannel.paste.filled":
      "Ifyllt: {fields}. Granska siffrorna och perioden innan du sparar.",
    "chatGptChannel.paste.missing": "Hittades inte i den inklistrade texten, oförändrat: {fields}.",
    "chatGptChannel.paste.unreadable":
      "Inget enskilt heltal eller ”Unavailable” hittades för {fields}; oförändrat.",
    "chatGptChannel.paste.replacePrompt": "Ersätta de värden som redan angetts för {fields}?",
    "chatGptChannel.api.err.not_connected": "Anslut Google Analytics först.",
    "chatGptChannel.api.err.expired": "Google-anslutningen har gått ut. Anslut Google Analytics igen.",
    "chatGptChannel.api.err.no_property": "Välj en GA4-egenskap för projektet.",
    "chatGptChannel.api.err.access_denied":
      "Google-kontot kan inte läsa den GA4-egenskapen. Välj en annan eller anslut igen.",
    "chatGptChannel.api.err.api_disabled":
      "Google Analytics Data API är inte aktiverat i appens Google-projekt.",
    "chatGptChannel.api.err.unavailable": "Google är tillfälligt otillgängligt. Försök igen senare.",
    "chatGptChannel.api.err.failed": "Det gick inte att läsa GA4-data. Inget har ändrats.",
    "chatGptChannel.sourceGa4Api":
      "Källa: GA4 Data API · {name} · {start} → {end} ({tz}) · hämtad {date}",
  },
  da: {
    "chatGptChannel.title": "ChatGPT-kanalen",
    "chatGptChannel.subtitle":
      "Registrér, hvad ChatGPT Business Hub og Google Analytics 4 (GA4) viser for en periode på 28 dage. Milo læser aldrig selv Business Hub: tallene derfra er kun det, du skriver eller indsætter her.",
    "chatGptChannel.manualNote":
      "Tallene gemmes sammen med projektet. Lad feltet stå tomt, hvis du ikke har målt værdien; angiv kun 0, når kilden viste nul.",
    "chatGptChannel.periodEnd": "Sidste dag i 28-dagesperioden (UTC)",
    "chatGptChannel.periodRange": "Periode: {start} → {end} (28 dage, UTC)",
    "chatGptChannel.periodPending": "Vælg sidste dag for at se 28-dagesperioden.",
    "chatGptChannel.hubHeading": "ChatGPT Business Hub (manuel indtastning)",
    "chatGptChannel.hubHelp":
      "Kopiér tallene for de samme 28 dage fra din rapport i ChatGPT Business Hub.",
    "chatGptChannel.mentions": "Omtaler",
    "chatGptChannel.clicks": "Klik",
    "chatGptChannel.topics": "Opdagelsesemner",
    "chatGptChannel.topicsHelp":
      "Ét emne pr. linje, højst {max}. Tomt betyder, at intet er registreret.",
    "chatGptChannel.ga4Heading": "Google Analytics 4 (manuel indtastning)",
    "chatGptChannel.ga4GuideTitle": "Sådan finder du tallene i GA4",
    "chatGptChannel.ga4Step1":
      "Åbn Rapporter → Anskaffelse → Trafikanskaffelse, og indstil samme 28 dage som datointerval.",
    "chatGptChannel.ga4Step2":
      "Filtrér Sessionskilde med nøjagtigt match (ikke ”indeholder”) på chatgpt.com og chat.openai.com. Angiv det samlede antal sessioner.",
    "chatGptChannel.ga4Step3":
      "Aflæs med samme filter Antal hændelser for hændelsen booking_completed.",
    "chatGptChannel.ga4Step4":
      "Angiv bookingklik kun, hvis dit websted måler dem i GA4; ellers lad feltet stå tomt. Brug hændelsen booking_click for Synergy, når den er tilgængelig.",
    "chatGptChannel.sessions": "Sessioner fra ChatGPT",
    "chatGptChannel.bookingClicks": "Bookingklik (hvis målt)",
    "chatGptChannel.bookingCompleted": "Antal booking_completed-hændelser",
    "chatGptChannel.save": "Gem rapport",
    "chatGptChannel.update": "Opdatér rapport",
    "chatGptChannel.cancelEdit": "Annullér redigering",
    "chatGptChannel.editing":
      "Du redigerer rapporten for {start} → {end}. Perioden kan ikke ændres; gemning erstatter dens tal.",
    "chatGptChannel.errPeriod": "Angiv en gyldig sidste dag (2023-01-01 eller senere).",
    "chatGptChannel.errFuture": "Perioden kan ikke slutte efter dags dato (UTC).",
    "chatGptChannel.errCount":
      "Værdier skal være hele tal fra 0 til 999999999. Lad feltet stå tomt, hvis de ikke er målt.",
    "chatGptChannel.errTopics": "Brug højst {max} emner på hver op til 80 tegn, ét pr. linje.",
    "chatGptChannel.errEmpty": "Angiv mindst ét tal eller emne.",
    "chatGptChannel.errCapacity":
      "Rapporthistorikken er fuld. Slet en ældre rapport, før du tilføjer en ny periode.",
    "chatGptChannel.errSave": "Kunne ikke gemme rapporten.",
    "chatGptChannel.saved": "Rapporten er gemt",
    "chatGptChannel.updated": "Rapporten er opdateret",
    "chatGptChannel.deleted": "Rapporten er slettet",
    "chatGptChannel.latest": "Seneste rapport",
    "chatGptChannel.history": "Rapporthistorik",
    "chatGptChannel.empty": "Der er endnu ikke gemt en rapport for ChatGPT-kanalen.",
    "chatGptChannel.unknown": "Ikke målt",
    "chatGptChannel.sourceHub": "Kilde: ChatGPT Business Hub (manuel indtastning)",
    "chatGptChannel.sourceGa4": "Kilde: GA4 (manuel indtastning)",
    "chatGptChannel.edit": "Rediger",
    "chatGptChannel.delete": "Slet",
    "chatGptChannel.noTopics": "Ingen emner registreret",
    "chatGptChannel.updatedOn": "Opdateret {date}",
    "chatGptChannel.separateNote":
      "Tal fra Business Hub og GA4 stammer fra forskellige systemer og kombineres eller afstemmes ikke her. ”Ikke målt” betyder, at der ikke er angivet en værdi; 0 betyder, at kilden viste nul.",
    "chatGptChannel.replacePrompt": "Erstat den gemte rapport for perioden?",
    "chatGptChannel.deletePrompt": "Slet rapporten?",
    "chatGptChannel.api.title": "Automatisk GA4-synkronisering (testudrulning)",
    "chatGptChannel.api.intro":
      "Tilslut Google Analytics (skrivebeskyttet) for at hente de seneste 28 hele dage for den ejendom, du vælger til projektet: sessioner fra chatgpt.com og chat.openai.com samt antal booking_click og booking_completed. Manuelle indtastninger overskrives aldrig. ”Ikke målt” betyder også, at GA4 ikke har registreret hændelsen.",
    "chatGptChannel.api.connect": "Tilslut Google Analytics",
    "chatGptChannel.api.connected": "Google Analytics er tilsluttet",
    "chatGptChannel.api.loadProps": "Vælg GA4-ejendom",
    "chatGptChannel.api.noProps": "Denne Google-konto har ingen GA4-ejendomme.",
    "chatGptChannel.api.useProp": "Brug",
    "chatGptChannel.api.property": "Ejendom: {name} ({id}) · tidszone {tz}",
    "chatGptChannel.api.refresh": "Opdatér fra GA4",
    "chatGptChannel.api.disconnect": "Afbryd",
    "chatGptChannel.api.disconnectPrompt":
      "Afbryde Google Analytics? Gemte rapporter beholdes. Adgangen til Search Console ændres ikke.",
    "chatGptChannel.api.disconnected": "Google Analytics er afbrudt",
    "chatGptChannel.api.synced": "GA4-tallene er opdateret",
    "chatGptChannel.api.lastSuccess": "Seneste vellykkede synkronisering: {date}",
    "chatGptChannel.api.never": "Endnu ikke synkroniseret.",
    "chatGptChannel.api.stale":
      "Seneste opdatering mislykkedes. Tallene er fra den seneste vellykkede synkronisering.",
    "chatGptChannel.api.partial":
      "GA4 har skjult eller begrænset data (tærskler eller rækkegrænser). Nul vises som ”Ikke målt”, og antal kan være nedre grænser.",
    "chatGptChannel.api.cbConnected": "Google Analytics er tilsluttet. Vælg en ejendom.",
    "chatGptChannel.api.cbDenied": "Adgang til Google Analytics blev ikke givet.",
    "chatGptChannel.api.cbError": "Kunne ikke tilslutte Google Analytics.",
    "chatGptChannel.api.err.not_available":
      "Automatisk GA4-synkronisering er ikke tilgængelig for dette projekt.",
    "chatGptChannel.api.err.not_configured":
      "Automatisk GA4-synkronisering er ikke konfigureret på denne server. Manuel indtastning virker stadig.",
    "chatGptChannel.paste.title": "Indsæt fra Business Hub",
    "chatGptChannel.paste.help":
      "Kopiér den synlige oversigt i ChatGPT Business Hub, og indsæt den her. Kun Mentions og Website clicks læses; Profile views og diagrammet ignoreres. ”Unavailable” forbliver ”Ikke målt”. Den indsatte tekst bliver i denne browser og gemmes ikke.",
    "chatGptChannel.paste.label": "Oversigtstekst fra Business Hub",
    "chatGptChannel.paste.apply": "Udfyld tal",
    "chatGptChannel.paste.verifyPeriod":
      "Perioden læses ikke fra den indsatte tekst. Kontrollér, at den sidste dag ovenfor svarer til perioden i Business Hub, før du gemmer.",
    "chatGptChannel.paste.filled": "Udfyldt: {fields}. Gennemgå tallene og perioden, før du gemmer.",
    "chatGptChannel.paste.missing": "Ikke fundet i den indsatte tekst, uændret: {fields}.",
    "chatGptChannel.paste.unreadable":
      "Der blev ikke fundet ét helt tal eller ”Unavailable” for {fields}; uændret.",
    "chatGptChannel.paste.replacePrompt": "Erstat de værdier, der allerede er indtastet for {fields}?",
    "chatGptChannel.api.err.not_connected": "Tilslut først Google Analytics.",
    "chatGptChannel.api.err.expired": "Google-forbindelsen er udløbet. Tilslut Google Analytics igen.",
    "chatGptChannel.api.err.no_property": "Vælg en GA4-ejendom til projektet.",
    "chatGptChannel.api.err.access_denied":
      "Google-kontoen kan ikke læse den GA4-ejendom. Vælg en anden, eller tilslut igen.",
    "chatGptChannel.api.err.api_disabled":
      "Google Analytics Data API er ikke aktiveret i appens Google-projekt.",
    "chatGptChannel.api.err.unavailable": "Google er midlertidigt utilgængelig. Prøv igen senere.",
    "chatGptChannel.api.err.failed": "Kunne ikke læse GA4-data. Intet er ændret.",
    "chatGptChannel.sourceGa4Api":
      "Kilde: GA4 Data API · {name} · {start} → {end} ({tz}) · hentet {date}",
  },
};
