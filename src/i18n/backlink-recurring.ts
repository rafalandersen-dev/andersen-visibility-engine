import type { OnboardingLanguage } from "@/lib/types";
export const backlinkRecurringCopy: Record<OnboardingLanguage, Record<string, string>> = {
  en: {
    "backlinkRecurring.title": "Ongoing backlink monitoring",
    "backlinkRecurring.note":
      "Collect new and lost backlink counts for this saved website daily or weekly. Each run covers complete UTC days from the DataForSEO index. Missed runs are skipped; observations do not verify individual placements or a complete inventory of the web.",
    "backlinkRecurring.loading": "Loading saved monitoring settings…",
    "backlinkRecurring.error": "Monitoring settings are unavailable. Reload to try again.",
    "backlinkRecurring.enabled":
      "Monitoring enabled — each collection still needs available supplier funding.",
    "backlinkRecurring.paused": "Monitoring paused. No new automatic collection is enabled.",
    "backlinkRecurring.spending":
      "{month} (UTC): {used} reserved or spent out of {cap} for this monitor.",
    "backlinkRecurring.unsettled":
      "An earlier request has an unresolved outcome or cost. Further automatic collection is held. Check history; saved successful results may offer accounting recovery. A dispatched request is not repeated automatically.",
    "backlinkRecurring.capHeld":
      "The remaining monthly cap is below one full request. Collection waits for the next UTC month or a saved cap change.",
    "backlinkRecurring.changedWebsite":
      "The website has changed. Save monitoring settings for the current saved project website, or reload the project if your displayed website is outdated. Existing spending is retained.",
    "backlinkRecurring.next":
      "Next due time (UTC): {date}. Collection starts on a later scheduler check when funding and account checks pass.",
    "backlinkRecurring.pause": "Pause monitoring",
    "backlinkRecurring.unavailable":
      "Supplier collection is currently unavailable. You can pause monitoring and view saved history. Enabling requires a confirmed active supplier account with available balance.",
    "backlinkRecurring.settings": "Monitor settings",
    "backlinkRecurring.enable": "Enable automatic collection",
    "backlinkRecurring.cadence": "Frequency",
    "backlinkRecurring.daily": "Daily",
    "backlinkRecurring.weekly": "Weekly",
    "backlinkRecurring.days": "Complete UTC days per run",
    "backlinkRecurring.cap": "Monthly supplier cap (USD)",
    "backlinkRecurring.save": "Save monitoring settings",
    "backlinkRecurring.allowance":
      "This cap limits this monitor only; saving it does not add account funds. Enter 0–100 USD with up to six decimal places. Enabling needs at least 0.024 USD plus 0.000036 USD per day in the window. Account and shared supplier limits also apply. Pausing stops new dispatches; an already admitted collection can still finish and incur its reserved cost.",
    "backlinkRecurring.invalid":
      "Enter 1–92 whole days and a valid USD cap. The enabled cap must cover at least one full request.",
    "backlinkRecurring.saved": "Monitoring settings saved.",
    "backlinkRecurring.uncertain":
      "The save is unconfirmed. Reload saved settings before making another change; the earlier change may already have been saved.",
    "backlinkRecurring.refresh": "Reload saved settings (discard edits)",
    "backlinkRecurring.history": "View saved requests and accounting below",
    "backlinkRecurring.scheduled": "Scheduled run",
    "backlinkRecurring.manual": "Manual request",
    "backlinkRecurring.occurrence": "Scheduled occurrence (UTC)",
    "backlinkRecurring.undispatched":
      "This scheduled request was not admitted to the supplier. Its monitor allowance is released.",
  },
  pl: {
    "backlinkRecurring.title": "Stałe monitorowanie linków zwrotnych",
    "backlinkRecurring.note":
      "Pobieraj liczbę nowych i utraconych linków dla zapisanej witryny codziennie lub co tydzień. Każde uruchomienie obejmuje pełne dni UTC z indeksu DataForSEO. Pominięte uruchomienia nie są nadrabiane; obserwacje nie potwierdzają pojedynczych publikacji ani pełnej listy linków w internecie.",
    "backlinkRecurring.loading": "Wczytywanie zapisanych ustawień…",
    "backlinkRecurring.error": "Ustawienia monitorowania są niedostępne. Wczytaj ponownie.",
    "backlinkRecurring.enabled":
      "Monitorowanie włączone — każde pobranie nadal wymaga środków u dostawcy.",
    "backlinkRecurring.paused":
      "Monitorowanie wstrzymane. Nowe automatyczne pobieranie jest wyłączone.",
    "backlinkRecurring.spending":
      "{month} (UTC): {used} zarezerwowane lub wydane z limitu {cap} tego monitora.",
    "backlinkRecurring.unsettled":
      "Wcześniejsze żądanie ma nieustalony wynik lub koszt. Kolejne automatyczne pobrania są wstrzymane. Sprawdź historię; zapisane wyniki mogą umożliwiać odzyskanie rozliczenia. Wysłane żądanie nie jest automatycznie powtarzane.",
    "backlinkRecurring.capHeld":
      "Pozostały limit miesięczny nie pokrywa pełnego żądania. Pobieranie czeka na kolejny miesiąc UTC lub zapisaną zmianę limitu.",
    "backlinkRecurring.changedWebsite":
      "Witryna uległa zmianie. Zapisz ustawienia dla aktualnej zapisanej witryny projektu lub wczytaj projekt, jeśli wyświetlana witryna jest nieaktualna. Dotychczasowe wydatki zostają zachowane.",
    "backlinkRecurring.next":
      "Następny termin (UTC): {date}. Pobieranie rozpocznie się przy późniejszym sprawdzeniu harmonogramu, jeśli konto i środki na to pozwolą.",
    "backlinkRecurring.pause": "Wstrzymaj monitorowanie",
    "backlinkRecurring.unavailable":
      "Pobieranie od dostawcy jest obecnie niedostępne. Możesz wstrzymać monitorowanie i przeglądać historię. Włączenie wymaga potwierdzonego aktywnego konta dostawcy z dostępnym saldem.",
    "backlinkRecurring.settings": "Ustawienia monitora",
    "backlinkRecurring.enable": "Włącz automatyczne pobieranie",
    "backlinkRecurring.cadence": "Częstotliwość",
    "backlinkRecurring.daily": "Codziennie",
    "backlinkRecurring.weekly": "Co tydzień",
    "backlinkRecurring.days": "Pełne dni UTC na uruchomienie",
    "backlinkRecurring.cap": "Miesięczny limit dostawcy (USD)",
    "backlinkRecurring.save": "Zapisz ustawienia monitorowania",
    "backlinkRecurring.allowance":
      "Ten limit dotyczy wyłącznie tego monitora; jego zapisanie nie zasila konta. Wpisz 0–100 USD, do sześciu miejsc po przecinku. Włączenie wymaga co najmniej 0,024 USD plus 0,000036 USD za każdy dzień okresu. Obowiązują też limity konta i wspólne limity dostawcy. Wstrzymanie zatrzymuje nowe wysyłki; już dopuszczone pobranie może się zakończyć i zużyć zarezerwowane środki.",
    "backlinkRecurring.invalid":
      "Wpisz 1–92 pełne dni i poprawny limit USD. Włączony monitor wymaga limitu na co najmniej jedno pełne żądanie.",
    "backlinkRecurring.saved": "Ustawienia monitorowania zapisane.",
    "backlinkRecurring.uncertain":
      "Zapis jest niepotwierdzony. Wczytaj zapisane ustawienia przed kolejną zmianą; poprzednia zmiana mogła już zostać zapisana.",
    "backlinkRecurring.refresh": "Wczytaj zapisane ustawienia (odrzuć zmiany)",
    "backlinkRecurring.history": "Zobacz zapisane żądania i rozliczenia poniżej",
    "backlinkRecurring.scheduled": "Uruchomienie z harmonogramu",
    "backlinkRecurring.manual": "Żądanie ręczne",
    "backlinkRecurring.occurrence": "Termin z harmonogramu (UTC)",
    "backlinkRecurring.undispatched":
      "To zaplanowane żądanie nie zostało dopuszczone do dostawcy. Limit monitora został zwolniony.",
  },
  sv: {
    "backlinkRecurring.title": "Löpande bevakning av bakåtlänkar",
    "backlinkRecurring.note":
      "Hämta antal nya och förlorade bakåtlänkar för den sparade webbplatsen dagligen eller veckovis. Varje körning omfattar hela UTC-dagar från DataForSEO-indexet. Missade körningar hoppas över; observationerna verifierar inte enskilda placeringar eller en fullständig lista över webben.",
    "backlinkRecurring.loading": "Läser sparade bevakningsinställningar…",
    "backlinkRecurring.error": "Bevakningsinställningarna är inte tillgängliga. Läs in igen.",
    "backlinkRecurring.enabled":
      "Bevakning aktiverad — varje hämtning kräver fortfarande tillgängliga leverantörsmedel.",
    "backlinkRecurring.paused": "Bevakning pausad. Ingen ny automatisk hämtning är aktiverad.",
    "backlinkRecurring.spending":
      "{month} (UTC): {used} reserverat eller förbrukat av bevakningens gräns på {cap}.",
    "backlinkRecurring.unsettled":
      "En tidigare begäran har ett oklart utfall eller en oavräknad kostnad. Fortsatt automatisk hämtning är stoppad. Kontrollera historiken; sparade resultat kan erbjuda återställning av kostnadsavräkning. En skickad begäran upprepas inte automatiskt.",
    "backlinkRecurring.capHeld":
      "Återstående månadsgräns täcker inte en hel begäran. Hämtning väntar på nästa UTC-månad eller en sparad ändring av gränsen.",
    "backlinkRecurring.changedWebsite":
      "Webbplatsen har ändrats. Spara bevakningsinställningarna för projektets aktuella sparade webbplats, eller läs in projektet om den visade webbplatsen är inaktuell. Tidigare kostnader behålls.",
    "backlinkRecurring.next":
      "Nästa förfallotid (UTC): {date}. Hämtning startar vid en senare schemakontroll när medel och konto har godkänts.",
    "backlinkRecurring.pause": "Pausa bevakning",
    "backlinkRecurring.unavailable":
      "Leverantörshämtning är för närvarande inte tillgänglig. Du kan pausa bevakningen och läsa sparad historik. Aktivering kräver ett bekräftat aktivt leverantörskonto med tillgängligt saldo.",
    "backlinkRecurring.settings": "Bevakningsinställningar",
    "backlinkRecurring.enable": "Aktivera automatisk hämtning",
    "backlinkRecurring.cadence": "Frekvens",
    "backlinkRecurring.daily": "Dagligen",
    "backlinkRecurring.weekly": "Veckovis",
    "backlinkRecurring.days": "Hela UTC-dagar per körning",
    "backlinkRecurring.cap": "Månadsgräns för leverantören (USD)",
    "backlinkRecurring.save": "Spara bevakningsinställningar",
    "backlinkRecurring.allowance":
      "Gränsen gäller endast denna bevakning; att spara den fyller inte på kontot. Ange 0–100 USD med högst sex decimaler. Aktivering kräver minst 0,024 USD plus 0,000036 USD per dag i perioden. Kontots och leverantörens gemensamma gränser gäller också. Paus stoppar nya anrop; en redan godkänd hämtning kan slutföras och medföra den reserverade kostnaden.",
    "backlinkRecurring.invalid":
      "Ange 1–92 hela dagar och en giltig USD-gräns. Aktiverad bevakning kräver utrymme för minst en hel begäran.",
    "backlinkRecurring.saved": "Bevakningsinställningarna har sparats.",
    "backlinkRecurring.uncertain":
      "Sparandet är obekräftat. Läs in sparade inställningar innan du ändrar igen; den tidigare ändringen kan redan ha sparats.",
    "backlinkRecurring.refresh": "Läs in sparade inställningar (kasta ändringar)",
    "backlinkRecurring.history": "Visa sparade förfrågningar och kostnadsavräkning nedan",
    "backlinkRecurring.scheduled": "Schemalagd körning",
    "backlinkRecurring.manual": "Manuell begäran",
    "backlinkRecurring.occurrence": "Schemalagd tid (UTC)",
    "backlinkRecurring.undispatched":
      "Den schemalagda begäran godkändes inte för leverantören. Bevakningens reserverade utrymme har frigjorts.",
  },
  da: {
    "backlinkRecurring.title": "Løbende overvågning af backlinks",
    "backlinkRecurring.note":
      "Hent antal nye og mistede backlinks for det gemte websted dagligt eller ugentligt. Hver kørsel dækker hele UTC-dage fra DataForSEO-indekset. Missede kørsler springes over; observationerne bekræfter ikke enkelte placeringer eller en komplet oversigt over internettet.",
    "backlinkRecurring.loading": "Indlæser gemte overvågningsindstillinger…",
    "backlinkRecurring.error": "Overvågningsindstillingerne er utilgængelige. Indlæs igen.",
    "backlinkRecurring.enabled":
      "Overvågning aktiveret — hver indsamling kræver stadig tilgængelige leverandørmidler.",
    "backlinkRecurring.paused":
      "Overvågning sat på pause. Ingen ny automatisk indsamling er aktiveret.",
    "backlinkRecurring.spending":
      "{month} (UTC): {used} reserveret eller brugt af denne overvågnings grænse på {cap}.",
    "backlinkRecurring.unsettled":
      "En tidligere anmodning har et uafklaret resultat eller en uafregnet omkostning. Yderligere automatisk indsamling er stoppet. Se historikken; gemte resultater kan tilbyde gendannelse af afregning. En afsendt anmodning gentages ikke automatisk.",
    "backlinkRecurring.capHeld":
      "Den resterende månedsgrænse dækker ikke en hel anmodning. Indsamling venter på næste UTC-måned eller en gemt ændring af grænsen.",
    "backlinkRecurring.changedWebsite":
      "Webstedet er ændret. Gem overvågningsindstillingerne for projektets aktuelle gemte websted, eller indlæs projektet igen, hvis det viste websted er forældet. Tidligere forbrug bevares.",
    "backlinkRecurring.next":
      "Næste forfaldstid (UTC): {date}. Indsamling starter ved et senere tjek af tidsplanen, når midler og konto er godkendt.",
    "backlinkRecurring.pause": "Sæt overvågning på pause",
    "backlinkRecurring.unavailable":
      "Leverandørindsamling er i øjeblikket utilgængelig. Du kan sætte overvågning på pause og se gemt historik. Aktivering kræver en bekræftet aktiv leverandørkonto med tilgængelig saldo.",
    "backlinkRecurring.settings": "Overvågningsindstillinger",
    "backlinkRecurring.enable": "Aktivér automatisk indsamling",
    "backlinkRecurring.cadence": "Hyppighed",
    "backlinkRecurring.daily": "Dagligt",
    "backlinkRecurring.weekly": "Ugentligt",
    "backlinkRecurring.days": "Hele UTC-dage pr. kørsel",
    "backlinkRecurring.cap": "Månedlig leverandørgrænse (USD)",
    "backlinkRecurring.save": "Gem overvågningsindstillinger",
    "backlinkRecurring.allowance":
      "Grænsen gælder kun denne overvågning; at gemme den tilføjer ikke penge til kontoen. Angiv 0–100 USD med højst seks decimaler. Aktivering kræver mindst 0,024 USD plus 0,000036 USD pr. dag i perioden. Kontoens og leverandørens fælles grænser gælder også. Pause stopper nye afsendelser; en allerede godkendt indsamling kan fuldføres og koste det reserverede beløb.",
    "backlinkRecurring.invalid":
      "Angiv 1–92 hele dage og en gyldig USD-grænse. Aktiveret overvågning kræver plads til mindst én hel anmodning.",
    "backlinkRecurring.saved": "Overvågningsindstillingerne er gemt.",
    "backlinkRecurring.uncertain":
      "Lagringen er ubekræftet. Indlæs gemte indstillinger før en ny ændring; den tidligere ændring kan allerede være gemt.",
    "backlinkRecurring.refresh": "Indlæs gemte indstillinger (kassér ændringer)",
    "backlinkRecurring.history": "Se gemte anmodninger og afregning nedenfor",
    "backlinkRecurring.scheduled": "Planlagt kørsel",
    "backlinkRecurring.manual": "Manuel anmodning",
    "backlinkRecurring.occurrence": "Planlagt tidspunkt (UTC)",
    "backlinkRecurring.undispatched":
      "Den planlagte anmodning blev ikke godkendt til leverandøren. Overvågningens reserverede beløb er frigivet.",
  },
};
