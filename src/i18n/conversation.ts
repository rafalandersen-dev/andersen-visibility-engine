const en = {
  "chat.account.title": "Your conversations",
  "chat.account.description":
    "Every private Milo conversation you started, across all projects. Only you can see this list.",
  "chat.account.manage": "Manage all conversations",
  "chat.account.error":
    "Your conversations could not be confirmed. Titles stay hidden until they are checked again.",
  "chat.account.retry": "Check again",
  "chat.account.empty": "You have no saved conversations.",
  "chat.account.more": "Show more conversations",
  "chat.account.started": "Started {date}",
  "chat.account.unavailable":
    "Project access has ended, so the title and messages stay hidden. You can still delete this conversation.",
  "chat.account.eraseAccess": "Deleting does not restore or change your access to the project.",
  "chat.export": "Export conversation",
  "chat.exportHelp":
    "Downloads saved messages, receipts and historical proposals as a JSON file. Linked files are separate.",
  "chat.exporting": "Preparing the complete conversation…",
  "chat.exportFailed":
    "Export could not be completed. Wait for ongoing work to finish, then try again.",
  "chat.erase": "Delete conversation",
  "chat.eraseTitle": "Permanently delete this conversation?",
  "chat.eraseHelp":
    "Deletes messages and proposals permanently. Saved drafts, results and billing records remain. Work already sent may finish and use your allowance. Records preventing duplicate work remain.",
  "chat.erasing": "Deleting conversation…",
  "chat.eraseUnconfirmed":
    "Deletion could not be confirmed. Messages stay hidden here. Retry deletion to confirm the outcome.",
  "chat.eraseRetry": "Retry deletion",
  "chat.erased": "Conversation deleted.",
  "chat.tool.draft_metadata_proposal": "Draft metadata proposal",
  "chat.proposal.review": "Review proposed changes",
  "chat.proposal.before": "Before",
  "chat.proposal.after": "Proposed",
  "chat.proposal.ready":
    "Saving returns the draft to review and withdraws its previous publication approval.",
  "chat.proposal.waiting": "Wait for this task to finish before saving the proposed changes.",
  "chat.proposal.unavailable":
    "This proposal can no longer be saved. Ask for a new proposal based on the current draft.",
  "chat.proposal.applied": "These changes were saved. Later edits may differ.",
  "chat.proposal.unconfirmed":
    "Saving could not be confirmed. Check saved status before trying again.",
  "chat.proposal.empty": "(empty)",
  "chat.title": "Talk to Milo",
  "chat.openContext": "Open project view",
  "chat.description":
    "Tell Milo what you want to improve. The right AI specialist continues here with your project's saved context.",
  "chat.chooseProject": "Client or project",
  "chat.ownProjects": "Your projects",
  "chat.history": "Conversations",
  "chat.new": "New conversation",
  "chat.welcome": "What shall we work on?",
  "chat.private": "Your private conversation in this project.",
  "chat.sharedPrivate":
    "Your private conversation in a shared project. Your current team access applies.",
  "chat.reviewPrompt": "Review the SEO structure of my saved drafts.",
  "chat.knowledgePrompt": "What can you tell me from this project's saved context?",
  "chat.messageFor": "Message for {project}",
  "chat.placeholder": "Describe the task and the result you need…",
  "chat.keyboard": "Ctrl / ⌘ + Enter to send. Enter starts a new line.",
  "chat.tooLong": "This message is too long. Shorten it before sending.",
  "chat.full": "This conversation is full. Start a new conversation to continue.",
  "chat.allowGeneration":
    "Allow one draft for an existing topic in this request. Uses the content allowance and saves the result for review.",
  "chat.generationEnabled": "Draft generation allowed for this request.",
  "chat.usage":
    "Replies use your account's AI allowance. Draft generation also uses the content allowance. Publication is a separate step.",
  "chat.send": "Send message",
  "chat.you": "You",
  "chat.messages": "Conversation messages",
  "chat.page": "Tasks {from}–{to} of {total}",
  "chat.latest": "Latest messages",
  "chat.sending": "Sending and checking saved status…",
  "chat.pending": "Request saved; waiting to start.",
  "chat.running": "Working on your request…",
  "chat.completed": "Response saved.",
  "chat.failed": "This attempt stopped. Review the saved work before sending another request.",
  "chat.unknown":
    "The final outcome could not be confirmed. Check saved results before starting again.",
  "chat.cancelled": "Further work cancelled. An operation already sent may still finish.",
  "chat.provider_unavailable":
    "The AI provider is not configured for this account. Contact your administrator.",
  "chat.usage_limit":
    "Your account's AI allowance does not permit another step. Check usage before continuing.",
  "chat.budget_unavailable":
    "AI spending is unavailable under the current budget settings. Ask your administrator to check them.",
  "chat.unavailable":
    "Access or saved conversation status could not be confirmed. Refresh before continuing.",
  "chat.sendUnconfirmed":
    "This request could not be confirmed. Recover the original request or check saved history before sending it as a new task.",
  "chat.recover": "Recover original request",
  "chat.resume": "Start saved request",
  "chat.stop": "Stop further work",
  "chat.stopHelp":
    "Stopping prevents later steps. A request already sent may still finish and use your allowance.",
  "chat.evidenceSaved": "Result saved in this conversation.",
  "chat.toolUnavailable": "This operation is unavailable with the current role or access.",
  "chat.partialHistory":
    "The specialist received a shortened part of the saved history. Restate any missing requirement.",
  "chat.tool.project_brief": "Project context",
  "chat.tool.draft_read": "Saved draft review",
  "chat.tool.draft_seo_review": "Saved draft structure check",
  "chat.tool.project_knowledge": "Project knowledge",
  "chat.tool.weekly_preparation": "Weekly preparation status",
  "chat.tool.saved_audit": "Saved audit review",
  "chat.tool.draft_generation": "Draft generation",
  "chat.tool.technical_evidence": "Saved technical checks",
  "chat.tool.visibility_evidence": "Saved AI answer and log evidence",
  "chat.tool.authority_evidence": "Saved backlink monitoring",
  "chat.tool.google_index_inspection": "Google index inspection",
  "chat.tool.performance_test": "Page speed test",
  "chat.tool.site_crawl": "Site crawl",
  "chat.allowProviderChecks":
    "Allow up to two site checks in this request (Google index inspection, page speed or one site crawl) for this project's website. Uses the project owner's connected services and existing check limits, and saves the results with the project's technical checks.",
  "chat.providerChecksEnabled": "Site checks allowed for this request.",
} as const;
type Copy = Record<keyof typeof en, string>;
export type ConversationCopy = Copy;
const pl: Copy = {
  "chat.account.title": "Twoje rozmowy",
  "chat.account.description":
    "Wszystkie Twoje prywatne rozmowy z Milo we wszystkich projektach. Tylko Ty widzisz tę listę.",
  "chat.account.manage": "Zarządzaj wszystkimi rozmowami",
  "chat.account.error":
    "Nie udało się potwierdzić Twoich rozmów. Tytuły pozostają ukryte do czasu ponownego sprawdzenia.",
  "chat.account.retry": "Sprawdź ponownie",
  "chat.account.empty": "Nie masz zapisanych rozmów.",
  "chat.account.more": "Pokaż więcej rozmów",
  "chat.account.started": "Rozpoczęta: {date}",
  "chat.account.unavailable":
    "Dostęp do projektu się zakończył, więc tytuł i wiadomości pozostają ukryte. Nadal możesz usunąć tę rozmowę.",
  "chat.account.eraseAccess":
    "Usunięcie nie przywraca ani nie zmienia Twojego dostępu do projektu.",
  "chat.export": "Eksportuj rozmowę",
  "chat.exportHelp":
    "Pobiera zapisane wiadomości, potwierdzenia i historyczne propozycje w pliku JSON. Powiązane pliki są osobno.",
  "chat.exporting": "Przygotowywanie całej rozmowy…",
  "chat.exportFailed":
    "Nie udało się ukończyć eksportu. Poczekaj na zakończenie trwającej pracy i spróbuj ponownie.",
  "chat.erase": "Usuń rozmowę",
  "chat.eraseTitle": "Trwale usunąć tę rozmowę?",
  "chat.eraseHelp":
    "Trwale usuwa wiadomości i propozycje. Zapisane szkice, wyniki i rozliczenia pozostają. Wysłane już operacje mogą się zakończyć i zużyć Twój limit. Zapisy zapobiegające powtórzeniu pracy pozostają.",
  "chat.erasing": "Usuwanie rozmowy…",
  "chat.eraseUnconfirmed":
    "Nie udało się potwierdzić usunięcia. Wiadomości pozostają tutaj ukryte. Ponów usuwanie, aby potwierdzić wynik.",
  "chat.eraseRetry": "Ponów usuwanie",
  "chat.erased": "Rozmowa usunięta.",
  "chat.tool.draft_metadata_proposal": "Propozycja zmian metadanych szkicu",
  "chat.proposal.review": "Przejrzyj proponowane zmiany",
  "chat.proposal.before": "Przed zmianą",
  "chat.proposal.after": "Propozycja",
  "chat.proposal.ready":
    "Zapis przywróci szkic do przeglądu i wycofa jego wcześniejsze zatwierdzenie publikacji.",
  "chat.proposal.waiting":
    "Poczekaj na zakończenie tego zadania, zanim zapiszesz proponowane zmiany.",
  "chat.proposal.unavailable":
    "Tej propozycji nie można już zapisać. Poproś o nową na podstawie aktualnego szkicu.",
  "chat.proposal.applied": "Te zmiany zostały zapisane. Późniejsze edycje mogły zmienić treść.",
  "chat.proposal.unconfirmed":
    "Nie udało się potwierdzić zapisu. Sprawdź zapisany stan przed ponowną próbą.",
  "chat.proposal.empty": "(puste)",
  "chat.title": "Porozmawiaj z Milo",
  "chat.openContext": "Otwórz widok projektu",
  "chat.description":
    "Powiedz Milo, co chcesz poprawić. Właściwy specjalista AI będzie kontynuować tutaj, korzystając z zapisanego kontekstu projektu.",
  "chat.chooseProject": "Klient lub projekt",
  "chat.ownProjects": "Twoje projekty",
  "chat.history": "Rozmowy",
  "chat.new": "Nowa rozmowa",
  "chat.welcome": "Nad czym popracujemy?",
  "chat.private": "Twoja prywatna rozmowa w tym projekcie.",
  "chat.sharedPrivate":
    "Twoja prywatna rozmowa w udostępnionym projekcie. Obowiązują Twoje aktualne uprawnienia zespołowe.",
  "chat.reviewPrompt": "Sprawdź strukturę SEO moich zapisanych szkiców.",
  "chat.knowledgePrompt": "Co możesz powiedzieć na podstawie zapisanego kontekstu tego projektu?",
  "chat.messageFor": "Wiadomość dotycząca: {project}",
  "chat.placeholder": "Opisz zadanie i oczekiwany wynik…",
  "chat.keyboard": "Ctrl / ⌘ + Enter wysyła wiadomość. Enter rozpoczyna nowy wiersz.",
  "chat.tooLong": "Ta wiadomość jest za długa. Skróć ją przed wysłaniem.",
  "chat.full": "Ta rozmowa osiągnęła limit. Rozpocznij nową, aby kontynuować.",
  "chat.allowGeneration":
    "Zezwól na jeden szkic dla istniejącego tematu w tym zadaniu. Zużywa limit treści i zapisuje wynik do przeglądu.",
  "chat.generationEnabled": "Generowanie szkicu dozwolone dla tego zadania.",
  "chat.usage":
    "Odpowiedzi zużywają limit AI Twojego konta. Generowanie szkicu zużywa też limit treści. Publikacja jest osobnym krokiem.",
  "chat.send": "Wyślij wiadomość",
  "chat.you": "Ty",
  "chat.messages": "Wiadomości w rozmowie",
  "chat.page": "Zadania {from}–{to} z {total}",
  "chat.latest": "Najnowsze wiadomości",
  "chat.sending": "Wysyłanie i sprawdzanie zapisanego stanu…",
  "chat.pending": "Zadanie zapisane; czeka na rozpoczęcie.",
  "chat.running": "Praca nad Twoim zadaniem…",
  "chat.completed": "Odpowiedź zapisana.",
  "chat.failed":
    "Ta próba została zatrzymana. Sprawdź zapisaną pracę przed wysłaniem kolejnego zadania.",
  "chat.unknown":
    "Nie udało się potwierdzić końcowego wyniku. Sprawdź zapisane wyniki przed ponownym rozpoczęciem.",
  "chat.cancelled": "Dalsza praca anulowana. Wysłana już operacja może się jeszcze zakończyć.",
  "chat.provider_unavailable":
    "Dostawca AI nie jest skonfigurowany dla tego konta. Skontaktuj się z administratorem.",
  "chat.usage_limit":
    "Limit AI Twojego konta nie pozwala na kolejny krok. Sprawdź zużycie przed kontynuowaniem.",
  "chat.budget_unavailable":
    "Wydatki na AI są niedostępne przy obecnych ustawieniach budżetu. Poproś administratora o ich sprawdzenie.",
  "chat.unavailable":
    "Nie udało się potwierdzić dostępu lub zapisanego stanu rozmowy. Odśwież przed kontynuowaniem.",
  "chat.sendUnconfirmed":
    "Nie udało się potwierdzić tego zadania. Odzyskaj pierwotne zadanie lub sprawdź historię przed wysłaniem go jako nowego.",
  "chat.recover": "Odzyskaj pierwotne zadanie",
  "chat.resume": "Rozpocznij zapisane zadanie",
  "chat.stop": "Zatrzymaj dalszą pracę",
  "chat.stopHelp":
    "Zatrzymanie blokuje kolejne kroki. Wysłane już zadanie może się jeszcze zakończyć i zużyć Twój limit.",
  "chat.evidenceSaved": "Wynik zapisany w tej rozmowie.",
  "chat.toolUnavailable": "Ta operacja jest niedostępna przy obecnej roli lub uprawnieniach.",
  "chat.partialHistory":
    "Specjalista otrzymał skróconą część zapisanej historii. Powtórz brakujące wymagania.",
  "chat.tool.project_brief": "Kontekst projektu",
  "chat.tool.draft_read": "Przegląd zapisanego szkicu",
  "chat.tool.draft_seo_review": "Sprawdzenie struktury zapisanego szkicu",
  "chat.tool.project_knowledge": "Wiedza o projekcie",
  "chat.tool.weekly_preparation": "Stan przygotowania tygodnia",
  "chat.tool.saved_audit": "Przegląd zapisanego audytu",
  "chat.tool.draft_generation": "Generowanie szkicu",
  "chat.tool.technical_evidence": "Zapisane kontrole techniczne",
  "chat.tool.visibility_evidence": "Zapisane dowody z odpowiedzi AI i logów",
  "chat.tool.authority_evidence": "Zapisane monitorowanie linków zwrotnych",
  "chat.tool.google_index_inspection": "Inspekcja indeksu Google",
  "chat.tool.performance_test": "Test szybkości strony",
  "chat.tool.site_crawl": "Skanowanie witryny",
  "chat.allowProviderChecks":
    "Zezwól w tym zadaniu na maksymalnie dwa sprawdzenia witryny (inspekcja indeksu Google, szybkość strony lub jedno skanowanie witryny) dla witryny tego projektu. Korzysta z połączonych usług i obecnych limitów sprawdzeń właściciela projektu, a wyniki zapisuje razem z kontrolami technicznymi projektu.",
  "chat.providerChecksEnabled": "Sprawdzenia witryny dozwolone dla tego zadania.",
};
const sv: Copy = {
  "chat.account.title": "Dina samtal",
  "chat.account.description":
    "Alla privata samtal med Milo som du har startat, i alla projekt. Bara du kan se den här listan.",
  "chat.account.manage": "Hantera alla samtal",
  "chat.account.error":
    "Dina samtal kunde inte bekräftas. Titlarna förblir dolda tills de har kontrollerats igen.",
  "chat.account.retry": "Kontrollera igen",
  "chat.account.empty": "Du har inga sparade samtal.",
  "chat.account.more": "Visa fler samtal",
  "chat.account.started": "Startat {date}",
  "chat.account.unavailable":
    "Åtkomsten till projektet har upphört, så titeln och meddelandena förblir dolda. Du kan fortfarande ta bort samtalet.",
  "chat.account.eraseAccess":
    "Borttagningen återställer eller ändrar inte din åtkomst till projektet.",
  "chat.export": "Exportera samtal",
  "chat.exportHelp":
    "Hämtar sparade meddelanden, kvittenser och historiska förslag som en JSON-fil. Länkade filer är separata.",
  "chat.exporting": "Förbereder hela samtalet…",
  "chat.exportFailed":
    "Exporten kunde inte slutföras. Vänta tills pågående arbete är klart och försök igen.",
  "chat.erase": "Ta bort samtal",
  "chat.eraseTitle": "Ta bort det här samtalet permanent?",
  "chat.eraseHelp":
    "Tar bort meddelanden och förslag permanent. Sparade utkast, resultat och faktureringsuppgifter finns kvar. Redan skickat arbete kan slutföras och använda din kvot. Poster som förhindrar dubbelarbete finns kvar.",
  "chat.erasing": "Tar bort samtalet…",
  "chat.eraseUnconfirmed":
    "Borttagningen kunde inte bekräftas. Meddelandena förblir dolda här. Försök ta bort igen för att bekräfta resultatet.",
  "chat.eraseRetry": "Försök ta bort igen",
  "chat.erased": "Samtalet har tagits bort.",
  "chat.tool.draft_metadata_proposal": "Förslag på ändrade metadata för utkastet",
  "chat.proposal.review": "Granska föreslagna ändringar",
  "chat.proposal.before": "Före",
  "chat.proposal.after": "Förslag",
  "chat.proposal.ready":
    "När du sparar återgår utkastet till granskning och dess tidigare publiceringsgodkännande återkallas.",
  "chat.proposal.waiting":
    "Vänta tills uppgiften är klar innan du sparar de föreslagna ändringarna.",
  "chat.proposal.unavailable":
    "Det här förslaget kan inte längre sparas. Be om ett nytt förslag utifrån det aktuella utkastet.",
  "chat.proposal.applied": "Ändringarna har sparats. Senare redigeringar kan ha ändrat innehållet.",
  "chat.proposal.unconfirmed":
    "Det gick inte att bekräfta att ändringarna sparades. Kontrollera den sparade statusen innan du försöker igen.",
  "chat.proposal.empty": "(tomt)",
  "chat.title": "Prata med Milo",
  "chat.openContext": "Öppna projektvyn",
  "chat.description":
    "Berätta för Milo vad du vill förbättra. Rätt AI-specialist fortsätter här med projektets sparade sammanhang.",
  "chat.chooseProject": "Kund eller projekt",
  "chat.ownProjects": "Dina projekt",
  "chat.history": "Samtal",
  "chat.new": "Nytt samtal",
  "chat.welcome": "Vad ska vi arbeta med?",
  "chat.private": "Ditt privata samtal i det här projektet.",
  "chat.sharedPrivate":
    "Ditt privata samtal i ett delat projekt. Dina nuvarande teambehörigheter gäller.",
  "chat.reviewPrompt": "Granska SEO-strukturen i mina sparade utkast.",
  "chat.knowledgePrompt": "Vad kan du berätta utifrån projektets sparade sammanhang?",
  "chat.messageFor": "Meddelande för {project}",
  "chat.placeholder": "Beskriv uppgiften och resultatet du behöver…",
  "chat.keyboard": "Ctrl / ⌘ + Enter skickar meddelandet. Enter skapar en ny rad.",
  "chat.tooLong": "Meddelandet är för långt. Korta det innan du skickar.",
  "chat.full": "Samtalet har nått gränsen. Starta ett nytt samtal för att fortsätta.",
  "chat.allowGeneration":
    "Tillåt ett utkast för ett befintligt ämne i den här uppgiften. Använder innehållskvoten och sparar resultatet för granskning.",
  "chat.generationEnabled": "Utkastgenerering är tillåten för den här uppgiften.",
  "chat.usage":
    "Svar använder kontots AI-kvot. Utkastgenerering använder även innehållskvoten. Publicering är ett separat steg.",
  "chat.send": "Skicka meddelande",
  "chat.you": "Du",
  "chat.messages": "Samtalets meddelanden",
  "chat.page": "Uppgifter {from}–{to} av {total}",
  "chat.latest": "Senaste meddelanden",
  "chat.sending": "Skickar och kontrollerar sparad status…",
  "chat.pending": "Uppgiften är sparad och väntar på att starta.",
  "chat.running": "Arbetar med din uppgift…",
  "chat.completed": "Svaret är sparat.",
  "chat.failed":
    "Det här försöket stoppades. Granska sparat arbete innan du skickar en ny uppgift.",
  "chat.unknown":
    "Det slutliga resultatet kunde inte bekräftas. Kontrollera sparade resultat innan du startar igen.",
  "chat.cancelled": "Fortsatt arbete avbrutet. En redan skickad åtgärd kan fortfarande slutföras.",
  "chat.provider_unavailable":
    "AI-leverantören är inte konfigurerad för kontot. Kontakta administratören.",
  "chat.usage_limit":
    "Kontots AI-kvot tillåter inte ytterligare ett steg. Kontrollera användningen innan du fortsätter.",
  "chat.budget_unavailable":
    "AI-utgifter är inte tillgängliga med nuvarande budgetinställningar. Be administratören kontrollera dem.",
  "chat.unavailable":
    "Åtkomsten eller samtalets sparade status kunde inte bekräftas. Uppdatera innan du fortsätter.",
  "chat.sendUnconfirmed":
    "Uppgiften kunde inte bekräftas. Återställ den ursprungliga uppgiften eller kontrollera historiken innan du skickar den som en ny.",
  "chat.recover": "Återställ ursprunglig uppgift",
  "chat.resume": "Starta sparad uppgift",
  "chat.stop": "Stoppa fortsatt arbete",
  "chat.stopHelp":
    "Stopp hindrar senare steg. En redan skickad uppgift kan fortfarande slutföras och använda din kvot.",
  "chat.evidenceSaved": "Resultatet är sparat i det här samtalet.",
  "chat.toolUnavailable": "Åtgärden är inte tillgänglig med nuvarande roll eller behörighet.",
  "chat.partialHistory":
    "Specialisten fick en förkortad del av den sparade historiken. Upprepa eventuella krav som saknas.",
  "chat.tool.project_brief": "Projektets sammanhang",
  "chat.tool.draft_read": "Granskning av sparat utkast",
  "chat.tool.draft_seo_review": "Kontroll av det sparade utkastets struktur",
  "chat.tool.project_knowledge": "Projektkunskap",
  "chat.tool.weekly_preparation": "Veckoförberedelsens status",
  "chat.tool.saved_audit": "Granskning av sparad analys",
  "chat.tool.draft_generation": "Utkastgenerering",
  "chat.tool.technical_evidence": "Sparade tekniska kontroller",
  "chat.tool.visibility_evidence": "Sparat underlag från AI-svar och loggar",
  "chat.tool.authority_evidence": "Sparad bevakning av inkommande länkar",
  "chat.tool.google_index_inspection": "Google-indexinspektion",
  "chat.tool.performance_test": "Test av sidhastighet",
  "chat.tool.site_crawl": "Genomsökning av webbplatsen",
  "chat.allowProviderChecks":
    "Tillåt upp till två webbplatskontroller i den här uppgiften (Google-indexinspektion, sidhastighet eller en genomsökning av webbplatsen) för projektets webbplats. Använder projektägarens anslutna tjänster och befintliga kontrollgränser, och sparar resultaten bland projektets tekniska kontroller.",
  "chat.providerChecksEnabled": "Webbplatskontroller är tillåtna för den här uppgiften.",
};
const da: Copy = {
  "chat.account.title": "Dine samtaler",
  "chat.account.description":
    "Alle private samtaler med Milo, som du har startet, på tværs af projekter. Kun du kan se denne liste.",
  "chat.account.manage": "Administrer alle samtaler",
  "chat.account.error":
    "Dine samtaler kunne ikke bekræftes. Titlerne forbliver skjulte, indtil de er kontrolleret igen.",
  "chat.account.retry": "Kontrollér igen",
  "chat.account.empty": "Du har ingen gemte samtaler.",
  "chat.account.more": "Vis flere samtaler",
  "chat.account.started": "Startet {date}",
  "chat.account.unavailable":
    "Adgangen til projektet er ophørt, så titlen og beskederne forbliver skjulte. Du kan stadig slette denne samtale.",
  "chat.account.eraseAccess": "Sletning genopretter eller ændrer ikke din adgang til projektet.",
  "chat.export": "Eksportér samtale",
  "chat.exportHelp":
    "Henter gemte beskeder, kvitteringer og historiske forslag som en JSON-fil. Tilknyttede filer er separate.",
  "chat.exporting": "Forbereder hele samtalen…",
  "chat.exportFailed":
    "Eksporten kunne ikke fuldføres. Vent på, at igangværende arbejde afsluttes, og prøv igen.",
  "chat.erase": "Slet samtale",
  "chat.eraseTitle": "Slet denne samtale permanent?",
  "chat.eraseHelp":
    "Sletter beskeder og forslag permanent. Gemte kladder, resultater og faktureringsoplysninger bevares. Allerede sendt arbejde kan afsluttes og bruge din kvote. Registreringer, der forhindrer dobbeltarbejde, bevares.",
  "chat.erasing": "Sletter samtalen…",
  "chat.eraseUnconfirmed":
    "Sletningen kunne ikke bekræftes. Beskederne forbliver skjult her. Prøv at slette igen for at bekræfte resultatet.",
  "chat.eraseRetry": "Prøv at slette igen",
  "chat.erased": "Samtalen er slettet.",
  "chat.tool.draft_metadata_proposal": "Forslag til ændrede metadata for kladden",
  "chat.proposal.review": "Gennemgå foreslåede ændringer",
  "chat.proposal.before": "Før",
  "chat.proposal.after": "Forslag",
  "chat.proposal.ready":
    "Når du gemmer, går kladden tilbage til gennemgang, og dens tidligere godkendelse til publicering trækkes tilbage.",
  "chat.proposal.waiting": "Vent, til opgaven er færdig, før du gemmer de foreslåede ændringer.",
  "chat.proposal.unavailable":
    "Dette forslag kan ikke længere gemmes. Bed om et nyt forslag baseret på den aktuelle kladde.",
  "chat.proposal.applied": "Ændringerne er gemt. Senere redigeringer kan have ændret indholdet.",
  "chat.proposal.unconfirmed":
    "Det kunne ikke bekræftes, at ændringerne blev gemt. Kontrollér den gemte status, før du prøver igen.",
  "chat.proposal.empty": "(tom)",
  "chat.title": "Tal med Milo",
  "chat.openContext": "Åbn projektvisning",
  "chat.description":
    "Fortæl Milo, hvad du vil forbedre. Den rette AI-specialist fortsætter her med projektets gemte kontekst.",
  "chat.chooseProject": "Kunde eller projekt",
  "chat.ownProjects": "Dine projekter",
  "chat.history": "Samtaler",
  "chat.new": "Ny samtale",
  "chat.welcome": "Hvad skal vi arbejde med?",
  "chat.private": "Din private samtale i dette projekt.",
  "chat.sharedPrivate":
    "Din private samtale i et delt projekt. Dine nuværende teamrettigheder gælder.",
  "chat.reviewPrompt": "Gennemgå SEO-strukturen i mine gemte kladder.",
  "chat.knowledgePrompt": "Hvad kan du fortælle ud fra projektets gemte kontekst?",
  "chat.messageFor": "Besked om {project}",
  "chat.placeholder": "Beskriv opgaven og det resultat, du har brug for…",
  "chat.keyboard": "Ctrl / ⌘ + Enter sender beskeden. Enter starter en ny linje.",
  "chat.tooLong": "Beskeden er for lang. Forkort den, før du sender.",
  "chat.full": "Samtalen har nået grænsen. Start en ny samtale for at fortsætte.",
  "chat.allowGeneration":
    "Tillad én kladde til et eksisterende emne i denne opgave. Bruger indholdskvoten og gemmer resultatet til gennemgang.",
  "chat.generationEnabled": "Generering af en kladde er tilladt for denne opgave.",
  "chat.usage":
    "Svar bruger kontoens AI-kvote. Generering af kladder bruger også indholdskvoten. Udgivelse er et separat trin.",
  "chat.send": "Send besked",
  "chat.you": "Dig",
  "chat.messages": "Samtalens beskeder",
  "chat.page": "Opgaver {from}–{to} af {total}",
  "chat.latest": "Seneste beskeder",
  "chat.sending": "Sender og kontrollerer gemt status…",
  "chat.pending": "Opgaven er gemt og venter på at starte.",
  "chat.running": "Arbejder på din opgave…",
  "chat.completed": "Svaret er gemt.",
  "chat.failed":
    "Dette forsøg blev stoppet. Gennemgå det gemte arbejde, før du sender en ny opgave.",
  "chat.unknown":
    "Det endelige resultat kunne ikke bekræftes. Kontrollér gemte resultater, før du starter igen.",
  "chat.cancelled":
    "Videre arbejde annulleret. En allerede sendt handling kan stadig blive færdig.",
  "chat.provider_unavailable":
    "AI-udbyderen er ikke konfigureret til kontoen. Kontakt administratoren.",
  "chat.usage_limit":
    "Kontoens AI-kvote tillader ikke endnu et trin. Kontrollér forbruget, før du fortsætter.",
  "chat.budget_unavailable":
    "AI-udgifter er ikke tilgængelige med de nuværende budgetindstillinger. Bed administratoren kontrollere dem.",
  "chat.unavailable":
    "Adgangen eller samtalens gemte status kunne ikke bekræftes. Opdater, før du fortsætter.",
  "chat.sendUnconfirmed":
    "Opgaven kunne ikke bekræftes. Gendan den oprindelige opgave, eller kontrollér historikken, før du sender den som en ny.",
  "chat.recover": "Gendan oprindelig opgave",
  "chat.resume": "Start gemt opgave",
  "chat.stop": "Stop videre arbejde",
  "chat.stopHelp":
    "Stop forhindrer senere trin. En allerede sendt opgave kan stadig blive færdig og bruge din kvote.",
  "chat.evidenceSaved": "Resultatet er gemt i denne samtale.",
  "chat.toolUnavailable": "Handlingen er ikke tilgængelig med den nuværende rolle eller adgang.",
  "chat.partialHistory":
    "Specialisten modtog en forkortet del af den gemte historik. Gentag eventuelle manglende krav.",
  "chat.tool.project_brief": "Projektkontekst",
  "chat.tool.draft_read": "Gennemgang af gemt kladde",
  "chat.tool.draft_seo_review": "Kontrol af den gemte kladdes struktur",
  "chat.tool.project_knowledge": "Projektviden",
  "chat.tool.weekly_preparation": "Status for ugeforberedelse",
  "chat.tool.saved_audit": "Gennemgang af gemt analyse",
  "chat.tool.draft_generation": "Generering af kladde",
  "chat.tool.technical_evidence": "Gemte tekniske kontroller",
  "chat.tool.visibility_evidence": "Gemt dokumentation fra AI-svar og logfiler",
  "chat.tool.authority_evidence": "Gemt overvågning af indgående links",
  "chat.tool.google_index_inspection": "Google-indeksinspektion",
  "chat.tool.performance_test": "Test af sidehastighed",
  "chat.tool.site_crawl": "Gennemsøgning af webstedet",
  "chat.allowProviderChecks":
    "Tillad op til to webstedskontroller i denne opgave (Google-indeksinspektion, sidehastighed eller én gennemsøgning af webstedet) for projektets websted. Bruger projektejerens forbundne tjenester og eksisterende kontrolgrænser og gemmer resultaterne sammen med projektets tekniske kontroller.",
  "chat.providerChecksEnabled": "Webstedskontroller er tilladt for denne opgave.",
};
export const conversationCopy = { en, pl, sv, da } as const;
