export const notifications: Record<"en" | "pl" | "sv" | "da", Record<string, string>> = {
  en: {
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
