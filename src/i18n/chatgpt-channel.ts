import type { OnboardingLanguage } from "@/lib/types";

export const chatGptChannelCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "chatGptChannel.title": "ChatGPT channel",
    "chatGptChannel.subtitle":
      "Record by hand what ChatGPT Business Hub and Google Analytics 4 (GA4) show for a 28-day period. Nothing is imported automatically.",
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
  },
  pl: {
    "chatGptChannel.title": "Kanał ChatGPT",
    "chatGptChannel.subtitle":
      "Wpisz ręcznie dane z ChatGPT Business Hub i Google Analytics 4 (GA4) za okres 28 dni. Nic nie jest importowane automatycznie.",
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
  },
  sv: {
    "chatGptChannel.title": "ChatGPT-kanalen",
    "chatGptChannel.subtitle":
      "Fyll i för hand vad ChatGPT Business Hub och Google Analytics 4 (GA4) visar för en period på 28 dagar. Inget importeras automatiskt.",
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
  },
  da: {
    "chatGptChannel.title": "ChatGPT-kanalen",
    "chatGptChannel.subtitle":
      "Indtast manuelt, hvad ChatGPT Business Hub og Google Analytics 4 (GA4) viser for en periode på 28 dage. Der importeres ikke noget automatisk.",
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
  },
};
