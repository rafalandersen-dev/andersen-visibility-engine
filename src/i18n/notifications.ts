export const notifications: Record<"en" | "pl" | "sv" | "da", Record<string, string>> = {
  en: {
    "awareness.title": "Current project work",
    "awareness.help":
      "In-app only. These checks do not send email. Holds stay visible until the queue changes; opening them does not approve or restart work.",
    "awareness.project": "Choose project",
    "awareness.approval": "Exact version needs approval",
    "awareness.resume": "Approved version is still held",
    "awareness.late":
      "This date has passed. Review the draft and choose an explicit scheduling action.",
    "awareness.paused":
      "Automation is intentionally paused. Existing publication holds remain separate.",
    "awareness.disabled": "Automation is disabled.",
    "awareness.settings": "Open schedule settings",
    "awareness.history":
      "Last saved weekly result — historical, not a new check of capacity or sources",
    "awareness.empty": "No approval holds on this page.",
    "awareness.page": "Queue page {page} of {pages}",
    "awareness.error": "Current records could not be checked. Refresh before acting.",
    "awareness.checked": "Checked {at}",
    "awareness.weekly": "Current weekly slot records",
    "awareness.earlier": "Earlier inbox alerts",

    "notifications.failureInspect": "Inspect publication details",
    "notifications.failureReadError":
      "Publication details could not be checked. Try again before deciding what to do.",
    "notifications.failureReason.contentReview":
      "The saved attempt was blocked by content checks. Open the draft to review its current readiness.",
    "notifications.failureReason.destination":
      "The saved attempt reported a destination connection or response error. Check the destination before retrying.",
    "notifications.failureReason.configuration":
      "The saved attempt reported missing or invalid publishing configuration. Check Project Setup.",
    "notifications.failureReason.unknown":
      "The saved error could not be classified. Review the draft and destination before retrying.",
    "notifications.failureRecorded":
      "Record updated {at}, in your browser’s time zone. Attempts recorded: {attempts}.",
    "notifications.failureDraftChanged":
      "The draft changed after this record. These details may no longer describe its current readiness.",
    "notifications.failureHttp": "Recorded website response: HTTP {status}.",
    "notifications.failureCheck.links": "Resolve internal links in the editor’s link-safety panel.",
    "notifications.failureCheck.sourcesReview":
      "Verify the claims against sources or a qualified author, and complete human review.",
    "notifications.failureCheck.author":
      "Add the real author’s name and a biography, credential or profile.",
    "notifications.failureHistoryLimit":
      "This is historical information saved in Milo. It does not check the destination, approve the current draft or restart publication.",
    "notifications.failureState.absent":
      "No matching queue record was found. Refresh notifications and review the draft.",
    "notifications.failureState.changed":
      "The queue no longer marks this item as failed. Refresh notifications; this alone does not verify the destination website.",
    "notifications.recoveryInspect": "Inspect saved work",
    "notifications.recoveryReadError":
      "Saved automation records could not be checked. Try again before deciding whether to restart.",
    "notifications.recoveryState.absent":
      "No current run record was found. Refresh notifications to check whether this incident has been resolved.",
    "notifications.recoveryState.running": "The latest run is marked as active.",
    "notifications.recoveryState.completed":
      "The latest run has ended. Refresh notifications for current issues.",
    "notifications.recoveryState.review_required": "The interrupted run still needs review.",
    "notifications.recoverySnapshot": "Milo records checked at {at}, in your browser's time zone.",
    "notifications.recoveryCounts":
      "Plan {period}: {saved} saved drafts. Queue records for those drafts: {pending} waiting, {publishing} in progress, {published} recorded as published, {failed} failed and {cancelled} cancelled.",
    "notifications.recoveryEvidenceLimit":
      "These are records saved in Milo. They do not verify the last AI operation or the destination website. Check the destination before retrying an uncertain publication. This view does not restart work.",
    "notifications.recoveryMore":
      "Showing {shown} of {total} saved drafts. Open the calendar to inspect the remaining work.",
    "notifications.emailAddressUnverified":
      "Your current account email has not been verified. Complete email confirmation, then check again. If the address was changed by an administrator and you have no confirmation link, contact Milo support. In-app notifications remain available.",
    "notifications.emailAddressUnavailable":
      "Milo could not check your current email verification. Try again later. You can still turn off summaries and use in-app notifications.",
    "notifications.generation_capacity_low": "Preparation allowance may not cover the plan",
    "notifications.generation_capacity_unavailable": "Preparation allowance could not be checked",
    "notifications.capacityLow":
      "The {period} plan still needs {missing} drafts for this project and {total} across your active schedules. Your account has {remaining} preparation attempts left in {usagePeriod}. This is shared capacity, not a promise of completed articles. Review the schedule; saved drafts remain available for review and publication.",
    "notifications.capacityUnavailable":
      "Milo could not verify the shared preparation allowance for {usagePeriod}. The {period} plan still needs {missing} drafts here. Check again later. Saved drafts and other notifications remain available.",
    "notifications.scheduler_recovery": "Automation needs recovery review",
    "notifications.recovery":
      "Preparation paused after an interrupted run. Review saved drafts and the last operation before restarting. Existing publication approvals remain unchanged.",
    "notifications.emailTitle": "Email summaries",
    "notifications.emailDescription":
      "Receive one summary of new alerts, at most once per hour, at your confirmed account address. Each incident appears once.",
    "notifications.emailDisabled":
      "Email delivery has not been activated yet. In-app notifications are available.",
    "notifications.emailEnable": "Enable email summaries",
    "notifications.emailDisable": "Turn off email summaries",
    "notifications.emailError": "Email settings are temporarily unavailable.",
    "notifications.emailSaveError": "Could not save email preferences.",
    "notifications.emailHistory": "Recent email activity",
    "notifications.emailStatus.pending": "Waiting",
    "notifications.emailStatus.leased": "Checking current status",
    "notifications.emailStatus.sending": "Sending",
    "notifications.emailStatus.accepted": "Accepted by email provider",
    "notifications.emailStatus.unknown": "Delivery outcome needs verification",
    "notifications.emailStatus.cancelled": "Cancelled",
    "notifications.emailStatus.failed": "Could not prepare email",

    "notifications.title": "Notifications",
    "notifications.subtitle":
      "Your upcoming decisions and publishing issues, checked against the latest server state.",
    "notifications.loading": "Checking your plan…",
    "notifications.empty": "No actions need your attention right now.",
    "notifications.error": "Notifications are temporarily unavailable.",
    "notifications.stale":
      "The latest check could not finish. These are the last confirmed alerts.",
    "notifications.refresh": "Check again",
    "notifications.read": "Mark as read",
    "notifications.unread": "Unread",
    "notifications.saved": "Read",
    "notifications.open": "Open task",
    "notifications.calendar": "Open calendar",
    "notifications.project": "Project",
    "notifications.approval_due": "Approval due soon",
    "notifications.publication_failed": "Publication needs a check",
    "notifications.manual_overdue": "Manual task is overdue",
    "notifications.cadence_gap": "Next week needs attention",
    "notifications.coverage": "{missing} of {total} planned slots are not ready and queued.",
    "notifications.failure":
      "Check the destination before retrying: an interrupted publication may already be live.",
    "notifications.approval": "Review the current version before its planned deadline.",
    "notifications.manual":
      "Complete this task or choose a new date. This deadline is for a manual task.",
    "notifications.readError": "Could not mark this notification as read. Please try again.",
  },
  pl: {
    "awareness.title": "Bieżąca praca projektu",
    "awareness.help":
      "Tylko w aplikacji. Te kontrole nie wysyłają e-maili. Wstrzymania pozostają widoczne do zmiany kolejki; otwarcie nie zatwierdza ani nie wznawia pracy.",
    "awareness.project": "Wybierz projekt",
    "awareness.approval": "Ta wersja wymaga zatwierdzenia",
    "awareness.resume": "Zatwierdzona wersja nadal jest wstrzymana",
    "awareness.late": "Termin minął. Sprawdź szkic i świadomie wybierz działanie w harmonogramie.",
    "awareness.paused":
      "Automatyzacja jest celowo wstrzymana. Wstrzymania publikacji pozostają osobne.",
    "awareness.disabled": "Automatyzacja jest wyłączona.",
    "awareness.settings": "Otwórz ustawienia harmonogramu",
    "awareness.history":
      "Ostatni zapisany wynik tygodnia — historyczny, bez ponownej kontroli limitu lub źródeł",
    "awareness.empty": "Brak wstrzymań zatwierdzenia na tej stronie.",
    "awareness.page": "Strona kolejki {page} z {pages}",
    "awareness.error": "Nie udało się sprawdzić aktualnych danych. Odśwież przed działaniem.",
    "awareness.checked": "Sprawdzono {at}",
    "awareness.weekly": "Aktualne wpisy tygodniowego harmonogramu",
    "awareness.earlier": "Wcześniejsze alerty skrzynki",

    "notifications.failureInspect": "Sprawdź powód zatrzymania",
    "notifications.failureReadError":
      "Nie udało się sprawdzić szczegółów publikacji. Spróbuj ponownie przed podjęciem decyzji.",
    "notifications.failureReason.contentReview":
      "Zapisaną próbę zatrzymała kontrola treści. Otwórz szkic i sprawdź jego bieżącą gotowość.",
    "notifications.failureReason.destination":
      "Zapisana próba zgłosiła problem z połączeniem lub odpowiedzią strony docelowej. Sprawdź stronę przed ponowieniem.",
    "notifications.failureReason.configuration":
      "Zapisana próba zgłosiła brakującą lub nieprawidłową konfigurację publikacji. Sprawdź ustawienia projektu.",
    "notifications.failureReason.unknown":
      "Nie udało się rozpoznać zapisanego błędu. Sprawdź szkic i stronę docelową przed ponowieniem.",
    "notifications.failureRecorded":
      "Zapis z {at}, w strefie czasowej przeglądarki. Liczba zapisanych prób: {attempts}.",
    "notifications.failureDraftChanged":
      "Szkic zmienił się po tym zapisie. Te szczegóły mogą już nie opisywać jego bieżącej gotowości.",
    "notifications.failureHttp": "Zapisana odpowiedź strony: HTTP {status}.",
    "notifications.failureCheck.links":
      "Rozwiąż linki wewnętrzne w panelu bezpieczeństwa linków w edytorze.",
    "notifications.failureCheck.sourcesReview":
      "Zweryfikuj twierdzenia na podstawie źródeł lub kompetentnego autora i przeprowadź kontrolę przez człowieka.",
    "notifications.failureCheck.author":
      "Podaj nazwisko rzeczywistego autora oraz jego biografię, kwalifikacje lub profil.",
    "notifications.failureHistoryLimit":
      "To historyczne informacje zapisane w Milo. Ten widok nie sprawdza strony docelowej, nie zatwierdza bieżącego szkicu i nie wznawia publikacji.",
    "notifications.failureState.absent":
      "Nie znaleziono pasującego wpisu kolejki. Odśwież powiadomienia i sprawdź szkic.",
    "notifications.failureState.changed":
      "Kolejka nie oznacza już tej pozycji jako nieudanej. Odśwież powiadomienia; sama zmiana nie potwierdza stanu strony docelowej.",
    "notifications.recoveryInspect": "Sprawdź zapisane materiały",
    "notifications.recoveryReadError":
      "Nie udało się sprawdzić zapisów automatyzacji. Spróbuj ponownie przed decyzją o wznowieniu.",
    "notifications.recoveryState.absent":
      "Nie znaleziono bieżącego zapisu przebiegu. Odśwież powiadomienia, aby sprawdzić, czy problem został rozwiązany.",
    "notifications.recoveryState.running": "Ostatni przebieg jest oznaczony jako aktywny.",
    "notifications.recoveryState.completed":
      "Ostatni przebieg został zakończony. Odśwież powiadomienia, aby sprawdzić aktualne problemy.",
    "notifications.recoveryState.review_required": "Przerwany przebieg nadal wymaga sprawdzenia.",
    "notifications.recoverySnapshot":
      "Dane Milo sprawdzono {at}, w strefie czasowej Twojej przeglądarki.",
    "notifications.recoveryCounts":
      "Plan {period}. Zapisane szkice: {saved}. Wpisy kolejki dla tych szkiców — oczekujące: {pending}, w trakcie: {publishing}, zapisane jako opublikowane: {published}, nieudane: {failed}, anulowane: {cancelled}.",
    "notifications.recoveryEvidenceLimit":
      "To zapisy przechowywane w Milo. Nie potwierdzają wyniku ostatniej operacji AI ani stanu strony docelowej. Przed ponowieniem niepewnej publikacji sprawdź stronę. Ten widok nie wznawia pracy.",
    "notifications.recoveryMore":
      "Wyświetlono {shown} z {total} zapisanych szkiców. Pozostałe materiały sprawdzisz w kalendarzu.",
    "notifications.emailAddressUnverified":
      "Bieżący adres e-mail konta nie jest potwierdzony. Dokończ potwierdzanie adresu i sprawdź ponownie. Jeśli adres zmienił administrator i nie masz linku potwierdzającego, skontaktuj się z pomocą Milo. Powiadomienia w aplikacji pozostają dostępne.",
    "notifications.emailAddressUnavailable":
      "Milo nie mogło sprawdzić potwierdzenia bieżącego adresu e-mail. Spróbuj później. Nadal możesz wyłączyć podsumowania i korzystać z powiadomień w aplikacji.",
    "notifications.generation_capacity_low": "Limit przygotowania może nie wystarczyć na plan",
    "notifications.generation_capacity_unavailable": "Nie udało się sprawdzić limitu przygotowania",
    "notifications.capacityLow":
      "W planie na {period} brakuje {missing} szkiców tego projektu i {total} we wszystkich aktywnych harmonogramach. Na koncie pozostało {remaining} prób przygotowania w okresie {usagePeriod}. To wspólny limit, a nie gwarancja ukończenia artykułów. Sprawdź harmonogram; zapisane szkice nadal można przeglądać i publikować.",
    "notifications.capacityUnavailable":
      "Milo nie mogło potwierdzić wspólnego limitu przygotowania na {usagePeriod}. W planie na {period} brakuje tutaj {missing} szkiców. Sprawdź ponownie później. Zapisane szkice i pozostałe powiadomienia są nadal dostępne.",
    "notifications.scheduler_recovery": "Automatyzacja wymaga sprawdzenia",
    "notifications.recovery":
      "Przygotowanie treści zatrzymało się po przerwanym przebiegu. Przed wznowieniem sprawdź zapisane szkice i wynik ostatniej operacji. Dotychczasowe zgody na publikację pozostają bez zmian.",
    "notifications.emailTitle": "Podsumowania e-mail",
    "notifications.emailDescription":
      "Otrzymuj zestawienie nowych alertów na potwierdzony adres konta, najwyżej raz na godzinę. Każdy incydent pojawia się raz.",
    "notifications.emailDisabled":
      "Wysyłka e-maili nie została jeszcze uruchomiona. Powiadomienia w aplikacji są dostępne.",
    "notifications.emailEnable": "Włącz podsumowania e-mail",
    "notifications.emailDisable": "Wyłącz podsumowania e-mail",
    "notifications.emailError": "Ustawienia e-maili są chwilowo niedostępne.",
    "notifications.emailSaveError": "Nie udało się zapisać ustawień e-maili.",
    "notifications.emailHistory": "Ostatnie wiadomości",
    "notifications.emailStatus.pending": "Oczekuje",
    "notifications.emailStatus.leased": "Sprawdzanie aktualnego stanu",
    "notifications.emailStatus.sending": "Wysyłanie",
    "notifications.emailStatus.accepted": "Przyjęta przez dostawcę poczty",
    "notifications.emailStatus.unknown": "Wynik wysyłki wymaga sprawdzenia",
    "notifications.emailStatus.cancelled": "Anulowana",
    "notifications.emailStatus.failed": "Nie udało się przygotować wiadomości",

    "notifications.title": "Powiadomienia",
    "notifications.subtitle":
      "Nadchodzące decyzje i problemy z publikacją, sprawdzane na podstawie bieżącego stanu serwera.",
    "notifications.loading": "Sprawdzam Twój plan…",
    "notifications.empty": "Obecnie nic nie wymaga Twojej uwagi.",
    "notifications.error": "Powiadomienia są chwilowo niedostępne.",
    "notifications.stale":
      "Ostatnie sprawdzenie nie zostało ukończone. Wyświetlamy ostatnio potwierdzone alerty.",
    "notifications.refresh": "Sprawdź ponownie",
    "notifications.read": "Oznacz jako przeczytane",
    "notifications.unread": "Nieprzeczytane",
    "notifications.saved": "Przeczytane",
    "notifications.open": "Otwórz zadanie",
    "notifications.calendar": "Otwórz kalendarz",
    "notifications.project": "Projekt",
    "notifications.approval_due": "Zbliża się termin akceptacji",
    "notifications.publication_failed": "Publikacja wymaga sprawdzenia",
    "notifications.manual_overdue": "Minął termin zadania ręcznego",
    "notifications.cadence_gap": "Plan kolejnego tygodnia wymaga uzupełnienia",
    "notifications.coverage":
      "{missing} z {total} zaplanowanych terminów nie ma gotowej treści w kolejce.",
    "notifications.failure":
      "Przed ponowieniem sprawdź stronę docelową: przerwana publikacja mogła już się pojawić.",
    "notifications.approval": "Sprawdź aktualną wersję przed zaplanowanym terminem.",
    "notifications.manual":
      "Wykonaj zadanie lub wybierz nowy termin. Ten termin dotyczy zadania wykonywanego ręcznie.",
    "notifications.readError":
      "Nie udało się oznaczyć powiadomienia jako przeczytanego. Spróbuj ponownie.",
  },
  sv: {
    "awareness.title": "Aktuellt projektarbete",
    "awareness.help":
      "Endast i appen. Kontrollerna skickar ingen e-post. Stopp visas tills kön ändras; att öppna dem godkänner eller startar inte arbetet.",
    "awareness.project": "Välj projekt",
    "awareness.approval": "Den exakta versionen behöver godkännas",
    "awareness.resume": "Godkänd version är fortfarande stoppad",
    "awareness.late":
      "Datumet har passerat. Granska utkastet och välj en uttrycklig schemaläggningsåtgärd.",
    "awareness.paused": "Automatiken är avsiktligt pausad. Publikationsstopp hanteras separat.",
    "awareness.disabled": "Automatiken är avstängd.",
    "awareness.settings": "Öppna schemainställningar",
    "awareness.history":
      "Senast sparade veckoresultat — historik, ingen ny kontroll av kapacitet eller källor",
    "awareness.empty": "Inga godkännandestopp på denna sida.",
    "awareness.page": "Kösida {page} av {pages}",
    "awareness.error": "Aktuella uppgifter kunde inte kontrolleras. Uppdatera innan du agerar.",
    "awareness.checked": "Kontrollerat {at}",
    "awareness.weekly": "Aktuella veckoposter",
    "awareness.earlier": "Tidigare inkorgsaviseringar",

    "notifications.failureInspect": "Granska publiceringsdetaljer",
    "notifications.failureReadError":
      "Publiceringsdetaljerna kunde inte kontrolleras. Försök igen innan du bestämmer nästa steg.",
    "notifications.failureReason.contentReview":
      "Det sparade försöket stoppades av innehållskontroller. Öppna utkastet och granska dess aktuella status.",
    "notifications.failureReason.destination":
      "Det sparade försöket rapporterade ett anslutnings- eller svarsfel från målwebbplatsen. Kontrollera webbplatsen innan du försöker igen.",
    "notifications.failureReason.configuration":
      "Det sparade försöket rapporterade saknad eller ogiltig publiceringskonfiguration. Kontrollera projektinställningarna.",
    "notifications.failureReason.unknown":
      "Det sparade felet kunde inte klassificeras. Granska utkastet och målwebbplatsen innan du försöker igen.",
    "notifications.failureRecorded":
      "Posten uppdaterades {at}, i webbläsarens tidszon. Registrerade försök: {attempts}.",
    "notifications.failureDraftChanged":
      "Utkastet ändrades efter denna post. Uppgifterna kanske inte längre beskriver dess aktuella status.",
    "notifications.failureHttp": "Registrerat svar från webbplatsen: HTTP {status}.",
    "notifications.failureCheck.links":
      "Kontrollera interna länkar i redigerarens panel för länksäkerhet.",
    "notifications.failureCheck.sourcesReview":
      "Verifiera påståenden med källor eller en kvalificerad författare och genomför en mänsklig granskning.",
    "notifications.failureCheck.author":
      "Ange den verkliga författarens namn och biografi, kvalifikationer eller profil.",
    "notifications.failureHistoryLimit":
      "Detta är historiska uppgifter sparade i Milo. Vyn kontrollerar inte målwebbplatsen, godkänner inte utkastet och startar inte om publiceringen.",
    "notifications.failureState.absent":
      "Ingen matchande köpost hittades. Uppdatera aviseringarna och granska utkastet.",
    "notifications.failureState.changed":
      "Kön markerar inte längre denna post som misslyckad. Uppdatera aviseringarna; detta bekräftar inte målwebbplatsens status.",
    "notifications.recoveryInspect": "Granska sparat arbete",
    "notifications.recoveryReadError":
      "Automatiseringens sparade uppgifter kunde inte kontrolleras. Försök igen innan du beslutar om omstart.",
    "notifications.recoveryState.absent":
      "Ingen aktuell körning hittades. Uppdatera aviseringarna för att se om problemet är löst.",
    "notifications.recoveryState.running": "Den senaste körningen är markerad som aktiv.",
    "notifications.recoveryState.completed":
      "Den senaste körningen har avslutats. Uppdatera aviseringarna för aktuella problem.",
    "notifications.recoveryState.review_required":
      "Den avbrutna körningen behöver fortfarande granskas.",
    "notifications.recoverySnapshot":
      "Milos uppgifter kontrollerades {at}, i webbläsarens tidszon.",
    "notifications.recoveryCounts":
      "Plan {period}: {saved} sparade utkast. Köposter för dessa utkast: {pending} väntar, {publishing} pågår, {published} registrerade som publicerade, {failed} misslyckade och {cancelled} avbrutna.",
    "notifications.recoveryEvidenceLimit":
      "Detta är uppgifter som sparats i Milo. De bekräftar inte den senaste AI-åtgärden eller målwebbplatsens status. Kontrollera målsidan innan en osäker publicering provas igen. Den här vyn startar inte om arbetet.",
    "notifications.recoveryMore":
      "Visar {shown} av {total} sparade utkast. Öppna kalendern för återstående material.",
    "notifications.emailAddressUnverified":
      "Kontots nuvarande e-postadress är inte bekräftad. Slutför bekräftelsen och kontrollera igen. Om en administratör ändrade adressen och du saknar en bekräftelselänk, kontakta Milos support. Aviseringar i appen är fortfarande tillgängliga.",
    "notifications.emailAddressUnavailable":
      "Milo kunde inte kontrollera bekräftelsen av din nuvarande e-postadress. Försök senare. Du kan fortfarande stänga av sammanfattningar och använda aviseringar i appen.",
    "notifications.generation_capacity_low": "Kvoten kanske inte räcker för planen",
    "notifications.generation_capacity_unavailable": "Kvoten kunde inte kontrolleras",
    "notifications.capacityLow":
      "Planen för {period} saknar {missing} utkast i detta projekt och {total} i alla aktiva scheman. Kontot har {remaining} försök kvar under {usagePeriod}. Kvoten delas mellan projekten och garanterar inte färdiga artiklar. Granska schemat; sparade utkast kan fortfarande granskas och publiceras.",
    "notifications.capacityUnavailable":
      "Milo kunde inte kontrollera den gemensamma kvoten för {usagePeriod}. Planen för {period} saknar {missing} utkast här. Försök igen senare. Sparade utkast och andra aviseringar är fortfarande tillgängliga.",
    "notifications.scheduler_recovery": "Automatiseringen behöver kontrolleras",
    "notifications.recovery":
      "Förberedelsen pausades efter en avbruten körning. Kontrollera sparade utkast och den senaste åtgärden före omstart. Befintliga publiceringsgodkännanden gäller fortfarande.",
    "notifications.emailTitle": "Sammanfattningar via e-post",
    "notifications.emailDescription":
      "Få nya aviseringar till din bekräftade kontoadress, högst en gång i timmen. Varje händelse tas med en gång.",
    "notifications.emailDisabled":
      "E-postleverans har inte aktiverats än. Aviseringar i appen är tillgängliga.",
    "notifications.emailEnable": "Aktivera e-postsammanfattningar",
    "notifications.emailDisable": "Stäng av e-postsammanfattningar",
    "notifications.emailError": "E-postinställningar är tillfälligt otillgängliga.",
    "notifications.emailSaveError": "Kunde inte spara e-postinställningar.",
    "notifications.emailHistory": "Senaste e-postaktivitet",
    "notifications.emailStatus.pending": "Väntar",
    "notifications.emailStatus.leased": "Kontrollerar aktuell status",
    "notifications.emailStatus.sending": "Skickar",
    "notifications.emailStatus.accepted": "Accepterat av e-postleverantören",
    "notifications.emailStatus.unknown": "Leveransresultatet behöver kontrolleras",
    "notifications.emailStatus.cancelled": "Avbrutet",
    "notifications.emailStatus.failed": "Kunde inte förbereda e-post",

    "notifications.title": "Aviseringar",
    "notifications.subtitle":
      "Kommande beslut och publiceringsproblem, kontrollerade mot aktuell serverstatus.",
    "notifications.loading": "Kontrollerar din plan…",
    "notifications.empty": "Inget kräver din uppmärksamhet just nu.",
    "notifications.error": "Aviseringarna är tillfälligt otillgängliga.",
    "notifications.stale":
      "Den senaste kontrollen kunde inte slutföras. Här visas senast bekräftade aviseringar.",
    "notifications.refresh": "Kontrollera igen",
    "notifications.read": "Markera som läst",
    "notifications.unread": "Oläst",
    "notifications.saved": "Läst",
    "notifications.open": "Öppna uppgiften",
    "notifications.calendar": "Öppna kalendern",
    "notifications.project": "Projekt",
    "notifications.approval_due": "Godkännande behövs snart",
    "notifications.publication_failed": "Publiceringen behöver kontrolleras",
    "notifications.manual_overdue": "Den manuella uppgiften är försenad",
    "notifications.cadence_gap": "Nästa vecka behöver kompletteras",
    "notifications.coverage":
      "{missing} av {total} planerade tillfällen saknar färdigt innehåll i kön.",
    "notifications.failure":
      "Kontrollera målsidan innan du försöker igen: en avbruten publicering kan redan vara synlig.",
    "notifications.approval": "Granska den aktuella versionen före den planerade tidsfristen.",
    "notifications.manual":
      "Slutför uppgiften eller välj ett nytt datum. Tidsfristen gäller en manuell uppgift.",
    "notifications.readError": "Kunde inte markera aviseringen som läst. Försök igen.",
  },
  da: {
    "awareness.title": "Aktuelt projektarbejde",
    "awareness.help":
      "Kun i appen. Kontrollerne sender ikke e-mail. Stop vises indtil køen ændres; åbning godkender eller genstarter ikke arbejdet.",
    "awareness.project": "Vælg projekt",
    "awareness.approval": "Den præcise version kræver godkendelse",
    "awareness.resume": "Godkendt version er stadig stoppet",
    "awareness.late":
      "Datoen er passeret. Gennemgå kladden og vælg en konkret planlægningshandling.",
    "awareness.paused": "Automatikken er bevidst sat på pause. Publiceringsstop håndteres separat.",
    "awareness.disabled": "Automatikken er slået fra.",
    "awareness.settings": "Åbn planlægningsindstillinger",
    "awareness.history":
      "Senest gemte ugeresultat — historik, ingen ny kontrol af kapacitet eller kilder",
    "awareness.empty": "Ingen godkendelsesstop på denne side.",
    "awareness.page": "Køside {page} af {pages}",
    "awareness.error": "Aktuelle oplysninger kunne ikke kontrolleres. Opdater før du handler.",
    "awareness.checked": "Kontrolleret {at}",
    "awareness.weekly": "Aktuelle ugeposter",
    "awareness.earlier": "Tidligere indbakkeadvarsler",

    "notifications.failureInspect": "Se publiceringsdetaljer",
    "notifications.failureReadError":
      "Publiceringsdetaljerne kunne ikke kontrolleres. Prøv igen, før du beslutter næste skridt.",
    "notifications.failureReason.contentReview":
      "Det gemte forsøg blev stoppet af indholdskontroller. Åbn kladden og gennemgå dens aktuelle status.",
    "notifications.failureReason.destination":
      "Det gemte forsøg rapporterede en forbindelses- eller svarfejl fra målwebstedet. Kontrollér webstedet, før du prøver igen.",
    "notifications.failureReason.configuration":
      "Det gemte forsøg rapporterede manglende eller ugyldig publiceringskonfiguration. Kontrollér projektindstillingerne.",
    "notifications.failureReason.unknown":
      "Den gemte fejl kunne ikke klassificeres. Gennemgå kladden og målwebstedet, før du prøver igen.",
    "notifications.failureRecorded":
      "Posten blev opdateret {at}, i browserens tidszone. Registrerede forsøg: {attempts}.",
    "notifications.failureDraftChanged":
      "Kladden blev ændret efter denne post. Oplysningerne beskriver muligvis ikke længere dens aktuelle status.",
    "notifications.failureHttp": "Registreret svar fra webstedet: HTTP {status}.",
    "notifications.failureCheck.links":
      "Kontrollér interne links i editorens panel for linksikkerhed.",
    "notifications.failureCheck.sourcesReview":
      "Verificér påstande med kilder eller en kvalificeret forfatter, og gennemfør en menneskelig gennemgang.",
    "notifications.failureCheck.author":
      "Angiv den virkelige forfatters navn og biografi, kvalifikationer eller profil.",
    "notifications.failureHistoryLimit":
      "Dette er historiske oplysninger gemt i Milo. Visningen kontrollerer ikke målwebstedet, godkender ikke kladden og genstarter ikke publiceringen.",
    "notifications.failureState.absent":
      "Ingen tilsvarende køpost blev fundet. Opdatér meddelelserne og gennemgå kladden.",
    "notifications.failureState.changed":
      "Køen markerer ikke længere denne post som mislykket. Opdatér meddelelserne; dette bekræfter ikke målwebstedets status.",
    "notifications.recoveryInspect": "Gennemgå gemt arbejde",
    "notifications.recoveryReadError":
      "Automatiseringens gemte oplysninger kunne ikke kontrolleres. Prøv igen, før du beslutter at genstarte.",
    "notifications.recoveryState.absent":
      "Ingen aktuel kørsel blev fundet. Opdatér notifikationerne for at se, om problemet er løst.",
    "notifications.recoveryState.running": "Den seneste kørsel er markeret som aktiv.",
    "notifications.recoveryState.completed":
      "Den seneste kørsel er afsluttet. Opdatér notifikationerne for aktuelle problemer.",
    "notifications.recoveryState.review_required": "Den afbrudte kørsel skal stadig gennemgås.",
    "notifications.recoverySnapshot":
      "Milos oplysninger blev kontrolleret {at}, i din browsers tidszone.",
    "notifications.recoveryCounts":
      "Plan {period}: {saved} gemte kladder. Køposter for disse kladder: {pending} venter, {publishing} i gang, {published} registreret som publiceret, {failed} mislykkede og {cancelled} annullerede.",
    "notifications.recoveryEvidenceLimit":
      "Dette er oplysninger gemt i Milo. De bekræfter ikke den seneste AI-handling eller målwebstedets status. Kontrollér målsiden, før en usikker publicering forsøges igen. Denne visning genstarter ikke arbejdet.",
    "notifications.recoveryMore":
      "Viser {shown} af {total} gemte kladder. Åbn kalenderen for det resterende materiale.",
    "notifications.emailAddressUnverified":
      "Kontoens nuværende e-mailadresse er ikke bekræftet. Gennemfør bekræftelsen, og kontrollér igen. Hvis en administrator ændrede adressen, og du mangler et bekræftelseslink, så kontakt Milos support. Notifikationer i appen er stadig tilgængelige.",
    "notifications.emailAddressUnavailable":
      "Milo kunne ikke kontrollere bekræftelsen af din nuværende e-mailadresse. Prøv senere. Du kan stadig slå opsummeringer fra og bruge notifikationer i appen.",
    "notifications.generation_capacity_low": "Kvoten dækker muligvis ikke planen",
    "notifications.generation_capacity_unavailable": "Kvoten kunne ikke kontrolleres",
    "notifications.capacityLow":
      "Planen for {period} mangler {missing} kladder i dette projekt og {total} i alle aktive tidsplaner. Kontoen har {remaining} forsøg tilbage i {usagePeriod}. Kvoten deles mellem projekterne og garanterer ikke færdige artikler. Gennemgå tidsplanen; gemte kladder kan stadig gennemgås og publiceres.",
    "notifications.capacityUnavailable":
      "Milo kunne ikke kontrollere den fælles kvote for {usagePeriod}. Planen for {period} mangler {missing} kladder her. Prøv igen senere. Gemte kladder og andre notifikationer er stadig tilgængelige.",
    "notifications.scheduler_recovery": "Automatiseringen skal kontrolleres",
    "notifications.recovery":
      "Forberedelsen blev sat på pause efter en afbrudt kørsel. Kontrollér gemte kladder og den seneste handling før genstart. Eksisterende godkendelser af publicering gælder fortsat.",
    "notifications.emailTitle": "Opsummeringer via e-mail",
    "notifications.emailDescription":
      "Modtag nye notifikationer på din bekræftede kontoadresse, højst én gang i timen. Hver hændelse medtages én gang.",
    "notifications.emailDisabled":
      "E-maillevering er ikke aktiveret endnu. Notifikationer i appen er tilgængelige.",
    "notifications.emailEnable": "Aktivér e-mailopsummeringer",
    "notifications.emailDisable": "Slå e-mailopsummeringer fra",
    "notifications.emailError": "E-mailindstillinger er midlertidigt utilgængelige.",
    "notifications.emailSaveError": "Kunne ikke gemme e-mailindstillinger.",
    "notifications.emailHistory": "Seneste e-mailaktivitet",
    "notifications.emailStatus.pending": "Venter",
    "notifications.emailStatus.leased": "Kontrollerer aktuel status",
    "notifications.emailStatus.sending": "Sender",
    "notifications.emailStatus.accepted": "Accepteret af e-mailudbyderen",
    "notifications.emailStatus.unknown": "Leveringsresultatet skal kontrolleres",
    "notifications.emailStatus.cancelled": "Annulleret",
    "notifications.emailStatus.failed": "Kunne ikke forberede e-mail",

    "notifications.title": "Notifikationer",
    "notifications.subtitle":
      "Kommende beslutninger og publiceringsproblemer, kontrolleret mod den aktuelle serverstatus.",
    "notifications.loading": "Kontrollerer din plan…",
    "notifications.empty": "Intet kræver din opmærksomhed lige nu.",
    "notifications.error": "Notifikationerne er midlertidigt utilgængelige.",
    "notifications.stale":
      "Den seneste kontrol kunne ikke fuldføres. Her vises de senest bekræftede notifikationer.",
    "notifications.refresh": "Kontrollér igen",
    "notifications.read": "Markér som læst",
    "notifications.unread": "Ulæst",
    "notifications.saved": "Læst",
    "notifications.open": "Åbn opgaven",
    "notifications.calendar": "Åbn kalenderen",
    "notifications.project": "Projekt",
    "notifications.approval_due": "Godkendelse er snart nødvendig",
    "notifications.publication_failed": "Publiceringen skal kontrolleres",
    "notifications.manual_overdue": "Den manuelle opgave er forsinket",
    "notifications.cadence_gap": "Næste uge skal suppleres",
    "notifications.coverage":
      "{missing} af {total} planlagte tidspunkter mangler færdigt indhold i køen.",
    "notifications.failure":
      "Kontrollér målsiden, før du prøver igen: en afbrudt publicering kan allerede være synlig.",
    "notifications.approval": "Gennemgå den aktuelle version inden den planlagte frist.",
    "notifications.manual":
      "Udfør opgaven, eller vælg en ny dato. Fristen gælder en manuel opgave.",
    "notifications.readError": "Kunne ikke markere notifikationen som læst. Prøv igen.",
  },
};
