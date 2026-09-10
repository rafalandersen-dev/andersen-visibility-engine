export const proofEvidence: Record<string, Record<string, string>> = {
  en: {
    "proof.title": "Publication evidence and later results",
    "proof.help":
      "Each new publication attempt keeps its approved version and source/action references. Later measurements are saved separately. Historical publication labels are not backfilled as verified evidence.",
    "proof.loading": "Loading evidence…",
    "proof.failed": "Evidence is unavailable. Refresh to check again.",
    "proof.total": "{count} recorded attempts · 50 per page",
    "proof.empty": "No publication attempts recorded in this evidence history yet.",
    "proof.previous": "Previous page",
    "proof.next": "Next page",
    "proof.state.started": "Outcome not confirmed",
    "proof.state.unknown": "Outcome uncertain",
    "proof.state.published": "Connector reported publication",
    "proof.state.rejected": "Connector rejected the attempt",
    "proof.version": "Approved version fingerprint",
    "proof.action": "Saved action",
    "proof.manualAction": "Publication without a linked saved opportunity",
    "proof.provenance":
      "{sources} sources · {knowledge} knowledge references · {stages} weekly stage records",
    "proof.openPage": "Open reported destination",
    "proof.connectorOnly":
      "A connector response is not independent confirmation of the live page’s content or ranking.",
    "proof.snapshot": "Read saved version",
    "proof.savedText": "Text captured before this attempt",
    "proof.importHelp":
      "Attach a saved GSC import for this exact page. Use complete dated windows entirely before or after publication. Missing pages remain unknown. Saved imports are owner-controlled evidence, not independently verified data.",
    "proof.savedImport": "Saved measurement import",
    "proof.choose": "Choose a saved window",
    "proof.link": "Save observation link",
    "proof.actionFailed":
      "Could not confirm this action. Check the evidence again. A measurement needs one exact page row, valid complete dates and an unchanged saved import.",
    "proof.before": "Before publication",
    "proof.later": "After publication",
    "proof.metrics": "{clicks} clicks · {impressions} impressions",
    "proof.delta": "Change: {clicks} clicks · {impressions} impressions.",
    "proof.tentative":
      "Tentative observation; this does not establish causation. Source timezone is unspecified.",
    "proof.lowVolume": "Low measurement volume.",
    "proof.incomparable":
      "Inconclusive: windows differ, evidence is truncated, or another publication attempt affects this comparison.",
    "workflow.title": "Fixed workflow comparisons",
    "workflow.help":
      "Compare two named versions on the same briefs, with owner review and all cost steps, including revisions. Importing a comparison runs no models and changes no live workflow.",
    "workflow.import": "Import a reviewed comparison for this project",
    "workflow.failed":
      "The comparison could not be confirmed. Check its project, fixed cases, review fields and cost evidence, then refresh the saved records.",
    "workflow.empty":
      "No reviewed comparisons saved yet. Model previews alone do not establish an improvement.",
    "workflow.cases": "{count} fixed cases",
    "workflow.cost": "Total recorded cost",
    "workflow.unknownCost": "Cost incomplete",
    "workflow.fixedBriefs": "Fixed brief fingerprint",
    "workflow.limits":
      "Owner-recorded evidence; receipts and quality have not been independently certified. Any improvement still needs development review and a reversible release.",
    "workflow.verdict.regression": "Regression needs resolution",
    "workflow.verdict.incomplete_cost_evidence": "Cost evidence incomplete",
    "workflow.verdict.higher_cost_review": "Higher cost needs review",
    "workflow.verdict.eligible_for_development_review": "Eligible for development review",
    "workflow.verdict.no_demonstrated_improvement": "No demonstrated improvement",
  },
  pl: {
    "proof.title": "Dowody publikacji i późniejsze wyniki",
    "proof.help":
      "Każda nowa próba publikacji zachowuje zatwierdzoną wersję i odniesienia do źródeł oraz działań. Późniejsze pomiary zapisujemy osobno. Historyczne etykiety publikacji nie stają się zweryfikowanymi dowodami.",
    "proof.loading": "Wczytywanie dowodów…",
    "proof.failed": "Dowody są niedostępne. Odśwież, aby sprawdzić ponownie.",
    "proof.total": "Zapisane próby: {count} · 50 na stronę",
    "proof.empty": "Brak prób publikacji w tej historii dowodów.",
    "proof.previous": "Poprzednia strona",
    "proof.next": "Następna strona",
    "proof.state.started": "Wynik niepotwierdzony",
    "proof.state.unknown": "Wynik niepewny",
    "proof.state.published": "Konektor zgłosił publikację",
    "proof.state.rejected": "Konektor odrzucił próbę",
    "proof.version": "Identyfikator zatwierdzonej wersji",
    "proof.action": "Zapisane działanie",
    "proof.manualAction": "Publikacja bez powiązanej zapisanej możliwości",
    "proof.provenance":
      "Źródła: {sources} · odniesienia do wiedzy: {knowledge} · etapy tygodnia: {stages}",
    "proof.openPage": "Otwórz zgłoszoną stronę",
    "proof.connectorOnly":
      "Odpowiedź konektora nie jest niezależnym potwierdzeniem treści strony ani pozycji.",
    "proof.snapshot": "Czytaj zapisaną wersję",
    "proof.savedText": "Tekst zapisany przed tą próbą",
    "proof.importHelp":
      "Dołącz zapisany import GSC dla tej strony. Użyj pełnych okresów całkowicie przed lub po publikacji. Brak strony oznacza brak wiedzy. Zapisane importy są dowodami kontrolowanymi przez właściciela, nie niezależnie zweryfikowanymi danymi.",
    "proof.savedImport": "Zapisany import pomiarów",
    "proof.choose": "Wybierz zapisany okres",
    "proof.link": "Zapisz powiązanie pomiaru",
    "proof.actionFailed":
      "Nie można potwierdzić działania. Sprawdź dowody ponownie. Pomiar wymaga jednego wiersza dla tej strony, pełnych prawidłowych dat i niezmienionego importu.",
    "proof.before": "Przed publikacją",
    "proof.later": "Po publikacji",
    "proof.metrics": "Kliknięcia: {clicks} · wyświetlenia: {impressions}",
    "proof.delta": "Zmiana: {clicks} kliknięć · {impressions} wyświetleń.",
    "proof.tentative":
      "Wstępna obserwacja; nie dowodzi związku przyczynowego. Strefa czasowa źródła nie jest określona.",
    "proof.lowVolume": "Mała liczba pomiarów.",
    "proof.incomparable":
      "Brak wniosków: okresy różnią się, dane są ucięte lub inna próba publikacji wpływa na porównanie.",
    "workflow.title": "Porównania procesów na stałych briefach",
    "workflow.help":
      "Porównaj dwie nazwane wersje na tych samych briefach, z oceną właściciela i wszystkimi etapami kosztów, także poprawkami. Import nie uruchamia modeli ani nie zmienia działającego procesu.",
    "workflow.import": "Importuj sprawdzone porównanie dla tego projektu",
    "workflow.failed":
      "Nie można potwierdzić porównania. Sprawdź projekt, stałe przypadki, pola oceny i dowody kosztów, a następnie odśwież zapisy.",
    "workflow.empty":
      "Nie zapisano sprawdzonych porównań. Same podglądy modeli nie dowodzą poprawy.",
    "workflow.cases": "Stałe przypadki: {count}",
    "workflow.cost": "Łączny zapisany koszt",
    "workflow.unknownCost": "Koszt niepełny",
    "workflow.fixedBriefs": "Identyfikator stałych briefów",
    "workflow.limits":
      "Dowody zapisane przez właściciela; rachunki i jakość nie zostały niezależnie potwierdzone. Każde ulepszenie wymaga przeglądu technicznego i odwracalnego wdrożenia.",
    "workflow.verdict.regression": "Regresja wymaga rozwiązania",
    "workflow.verdict.incomplete_cost_evidence": "Niepełne dowody kosztów",
    "workflow.verdict.higher_cost_review": "Wyższy koszt wymaga przeglądu",
    "workflow.verdict.eligible_for_development_review": "Gotowe do przeglądu technicznego",
    "workflow.verdict.no_demonstrated_improvement": "Brak wykazanej poprawy",
  },
  sv: {
    "proof.title": "Publiceringsunderlag och senare resultat",
    "proof.help":
      "Varje nytt publiceringsförsök sparar godkänd version och käll-/åtgärdsreferenser. Senare mätningar sparas separat. Historiska publiceringsetiketter fylls inte i som verifierade underlag.",
    "proof.loading": "Läser in underlag…",
    "proof.failed": "Underlaget är inte tillgängligt. Uppdatera för att försöka igen.",
    "proof.total": "{count} registrerade försök · 50 per sida",
    "proof.empty": "Inga publiceringsförsök har registrerats i denna historik ännu.",
    "proof.previous": "Föregående sida",
    "proof.next": "Nästa sida",
    "proof.state.started": "Resultat ej bekräftat",
    "proof.state.unknown": "Osäkert resultat",
    "proof.state.published": "Anslutningen rapporterade publicering",
    "proof.state.rejected": "Anslutningen avvisade försöket",
    "proof.version": "Godkänd versions fingeravtryck",
    "proof.action": "Sparad åtgärd",
    "proof.manualAction": "Publicering utan länkad sparad möjlighet",
    "proof.provenance": "{sources} källor · {knowledge} kunskapsreferenser · {stages} veckosteg",
    "proof.openPage": "Öppna rapporterad destination",
    "proof.connectorOnly":
      "Ett anslutningssvar är inte en oberoende bekräftelse av sidans innehåll eller ranking.",
    "proof.snapshot": "Läs sparad version",
    "proof.savedText": "Text sparad före försöket",
    "proof.importHelp":
      "Koppla en sparad GSC-import för exakt denna sida. Använd hela daterade perioder före eller efter publicering. Saknade sidor förblir okända. Sparade importer är ägarkontrollerade underlag, inte oberoende verifierade data.",
    "proof.savedImport": "Sparad mätimport",
    "proof.choose": "Välj en sparad period",
    "proof.link": "Spara observationslänk",
    "proof.actionFailed":
      "Åtgärden kunde inte bekräftas. Kontrollera underlaget igen. En mätning kräver en exakt sidrad, giltiga fullständiga datum och en oförändrad sparad import.",
    "proof.before": "Före publicering",
    "proof.later": "Efter publicering",
    "proof.metrics": "{clicks} klick · {impressions} exponeringar",
    "proof.delta": "Förändring: {clicks} klick · {impressions} exponeringar.",
    "proof.tentative":
      "Preliminär observation; detta bevisar inte orsak. Källans tidszon är ospecificerad.",
    "proof.lowVolume": "Låg mätvolym.",
    "proof.incomparable":
      "Inget säkert resultat: perioderna skiljer sig, data är kapade eller ett annat publiceringsförsök påverkar jämförelsen.",
    "workflow.title": "Jämförelser av arbetsflöden med fasta underlag",
    "workflow.help":
      "Jämför två namngivna versioner med samma underlag, ägargranskning och alla kostnadssteg, inklusive revisioner. Importen kör inga modeller och ändrar inget aktivt arbetsflöde.",
    "workflow.import": "Importera en granskad jämförelse för projektet",
    "workflow.failed":
      "Jämförelsen kunde inte bekräftas. Kontrollera projekt, fasta fall, granskningsfält och kostnadsunderlag och uppdatera sedan posterna.",
    "workflow.empty":
      "Inga granskade jämförelser har sparats. Modellförhandsvisningar bevisar inte en förbättring.",
    "workflow.cases": "{count} fasta fall",
    "workflow.cost": "Total registrerad kostnad",
    "workflow.unknownCost": "Ofullständig kostnad",
    "workflow.fixedBriefs": "Fingeravtryck för fasta underlag",
    "workflow.limits":
      "Ägarregistrerade underlag; kvitton och kvalitet är inte oberoende verifierade. Varje förbättring kräver fortfarande utvecklingsgranskning och en återställbar release.",
    "workflow.verdict.regression": "Försämring behöver åtgärdas",
    "workflow.verdict.incomplete_cost_evidence": "Ofullständigt kostnadsunderlag",
    "workflow.verdict.higher_cost_review": "Högre kostnad behöver granskas",
    "workflow.verdict.eligible_for_development_review": "Kan gå till utvecklingsgranskning",
    "workflow.verdict.no_demonstrated_improvement": "Ingen visad förbättring",
  },
  da: {
    "proof.title": "Publiceringsdokumentation og senere resultater",
    "proof.help":
      "Hvert nyt publiceringsforsøg gemmer den godkendte version og kilde-/handlingsreferencer. Senere målinger gemmes separat. Historiske publiceringsmærker udfyldes ikke som verificeret dokumentation.",
    "proof.loading": "Indlæser dokumentation…",
    "proof.failed": "Dokumentation er utilgængelig. Opdatér for at kontrollere igen.",
    "proof.total": "{count} registrerede forsøg · 50 pr. side",
    "proof.empty": "Ingen publiceringsforsøg er registreret i denne historik endnu.",
    "proof.previous": "Forrige side",
    "proof.next": "Næste side",
    "proof.state.started": "Resultat ikke bekræftet",
    "proof.state.unknown": "Usikkert resultat",
    "proof.state.published": "Forbindelsen rapporterede publicering",
    "proof.state.rejected": "Forbindelsen afviste forsøget",
    "proof.version": "Godkendt versions fingeraftryk",
    "proof.action": "Gemt handling",
    "proof.manualAction": "Publicering uden tilknyttet gemt mulighed",
    "proof.provenance": "{sources} kilder · {knowledge} vidensreferencer · {stages} ugetrin",
    "proof.openPage": "Åbn rapporteret destination",
    "proof.connectorOnly":
      "Et forbindelsessvar er ikke en uafhængig bekræftelse af sidens indhold eller placering.",
    "proof.snapshot": "Læs gemt version",
    "proof.savedText": "Tekst gemt før forsøget",
    "proof.importHelp":
      "Tilknyt en gemt GSC-import for præcis denne side. Brug hele daterede perioder før eller efter publicering. Manglende sider forbliver ukendte. Gemte importer er ejerstyret dokumentation, ikke uafhængigt verificerede data.",
    "proof.savedImport": "Gemt måleimport",
    "proof.choose": "Vælg en gemt periode",
    "proof.link": "Gem observationslink",
    "proof.actionFailed":
      "Handlingen kunne ikke bekræftes. Kontrollér dokumentationen igen. En måling kræver én præcis siderække, gyldige fulde datoer og en uændret gemt import.",
    "proof.before": "Før publicering",
    "proof.later": "Efter publicering",
    "proof.metrics": "{clicks} klik · {impressions} eksponeringer",
    "proof.delta": "Ændring: {clicks} klik · {impressions} eksponeringer.",
    "proof.tentative":
      "Foreløbig observation; dette beviser ikke årsag. Kildens tidszone er uspecificeret.",
    "proof.lowVolume": "Lav målevolumen.",
    "proof.incomparable":
      "Uafklaret: perioderne er forskellige, data er afkortet, eller et andet publiceringsforsøg påvirker sammenligningen.",
    "workflow.title": "Sammenligninger af arbejdsgange med faste oplæg",
    "workflow.help":
      "Sammenlign to navngivne versioner med samme oplæg, ejergennemgang og alle omkostningstrin, inklusive rettelser. Importen kører ingen modeller og ændrer ingen aktiv arbejdsgang.",
    "workflow.import": "Importér en gennemgået sammenligning for projektet",
    "workflow.failed":
      "Sammenligningen kunne ikke bekræftes. Kontrollér projekt, faste tilfælde, vurderingsfelter og omkostningsdokumentation, og opdatér derefter posterne.",
    "workflow.empty":
      "Ingen gennemgåede sammenligninger er gemt. Modelforhåndsvisninger beviser ikke en forbedring.",
    "workflow.cases": "{count} faste tilfælde",
    "workflow.cost": "Samlet registreret omkostning",
    "workflow.unknownCost": "Ufuldstændig omkostning",
    "workflow.fixedBriefs": "Fingeraftryk for faste oplæg",
    "workflow.limits":
      "Ejerregistreret dokumentation; kvitteringer og kvalitet er ikke uafhængigt bekræftet. Enhver forbedring kræver stadig udviklingsgennemgang og en reversibel udgivelse.",
    "workflow.verdict.regression": "Tilbagegang kræver løsning",
    "workflow.verdict.incomplete_cost_evidence": "Ufuldstændig omkostningsdokumentation",
    "workflow.verdict.higher_cost_review": "Højere omkostning kræver gennemgang",
    "workflow.verdict.eligible_for_development_review": "Kan gå til udviklingsgennemgang",
    "workflow.verdict.no_demonstrated_improvement": "Ingen påvist forbedring",
  },
};
