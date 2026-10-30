/** First use of the Milo conversation (CG-01A): compact start, suggestions and
 * per-message permission summaries. The full consent wording stays in `chat.*`
 * and is shown unchanged behind each summary's details control. */
const en = {
  "conversationStart.manage": "Manage",
  "conversationStart.ownedIntro": "Milo uses this project's saved information.",
  "conversationStart.sharedIntro": "Shared project: your team role decides what Milo can do here.",
  "conversationStart.suggestions": "Ways to start",
  "conversationStart.suggestionHint": "A suggestion only fills in the message; nothing is sent.",
  "conversationStart.suggest.businessGaps": "What is missing from my saved business information?",
  "conversationStart.suggest.goal": "Help me choose one clear goal and a first step.",
  "conversationStart.suggest.draftReview": "Review my draft “{title}” and suggest improvements.",
  "conversationStart.suggest.sharedOverview": "What has been saved in this project so far?",
  "conversationStart.consent.title": "Permissions for this message",
  "conversationStart.consent.note": "Off by default. Applies to this message only.",
  "conversationStart.consent.generationLabel": "Allow one draft",
  "conversationStart.consent.generationSummary":
    "One draft for an existing topic, saved for review. Uses the content allowance. Publishing is a separate step.",
  "conversationStart.consent.generationDetails": "More about draft generation",
  "conversationStart.consent.checksLabel": "Allow site checks",
  "conversationStart.consent.checksSummary":
    "Up to 2 checks of this project's website, within the project owner's connected services and check limits.",
  "conversationStart.consent.checksDetails": "More about site checks",
} as const;
type Copy = Record<keyof typeof en, string>;
const pl: Copy = {
  "conversationStart.manage": "Zarządzaj",
  "conversationStart.ownedIntro": "Milo korzysta z zapisanych informacji projektu.",
  "conversationStart.sharedIntro":
    "Projekt udostępniony: możliwości Milo zależą od Twojej roli w zespole.",
  "conversationStart.suggestions": "Propozycje na start",
  "conversationStart.suggestionHint": "Propozycja tylko wpisuje treść; nic nie zostaje wysłane.",
  "conversationStart.suggest.businessGaps":
    "Czego brakuje w zapisanych informacjach o mojej firmie?",
  "conversationStart.suggest.goal": "Pomóż mi wybrać jeden jasny cel i pierwszy krok.",
  "conversationStart.suggest.draftReview": "Przejrzyj mój szkic „{title}” i zaproponuj poprawki.",
  "conversationStart.suggest.sharedOverview": "Co do tej pory zapisano w tym projekcie?",
  "conversationStart.consent.title": "Zgody dla tej wiadomości",
  "conversationStart.consent.note": "Domyślnie wyłączone. Dotyczą tylko tej wiadomości.",
  "conversationStart.consent.generationLabel": "Zezwól na jeden szkic",
  "conversationStart.consent.generationSummary":
    "Jeden szkic dla istniejącego tematu, zapisany do przeglądu. Zużywa limit treści. Publikacja jest osobnym krokiem.",
  "conversationStart.consent.generationDetails": "Więcej o generowaniu szkicu",
  "conversationStart.consent.checksLabel": "Zezwól na sprawdzenia witryny",
  "conversationStart.consent.checksSummary":
    "Do 2 sprawdzeń witryny tego projektu, w ramach połączonych usług i limitów sprawdzeń właściciela projektu.",
  "conversationStart.consent.checksDetails": "Więcej o sprawdzeniach witryny",
};
const sv: Copy = {
  "conversationStart.manage": "Hantera",
  "conversationStart.ownedIntro": "Milo använder projektets sparade information.",
  "conversationStart.sharedIntro": "Delat projekt: din roll i teamet avgör vad Milo kan göra här.",
  "conversationStart.suggestions": "Förslag att börja med",
  "conversationStart.suggestionHint": "Ett förslag fyller bara i meddelandet; inget skickas.",
  "conversationStart.suggest.businessGaps": "Vad saknas i min sparade företagsinformation?",
  "conversationStart.suggest.goal": "Hjälp mig välja ett tydligt mål och ett första steg.",
  "conversationStart.suggest.draftReview":
    "Granska mitt utkast ”{title}” och föreslå förbättringar.",
  "conversationStart.suggest.sharedOverview": "Vad har sparats i det här projektet hittills?",
  "conversationStart.consent.title": "Tillstånd för det här meddelandet",
  "conversationStart.consent.note": "Avstängt som standard. Gäller bara det här meddelandet.",
  "conversationStart.consent.generationLabel": "Tillåt ett utkast",
  "conversationStart.consent.generationSummary":
    "Ett utkast för ett befintligt ämne, sparat för granskning. Använder innehållskvoten. Publicering är ett separat steg.",
  "conversationStart.consent.generationDetails": "Mer om utkastgenerering",
  "conversationStart.consent.checksLabel": "Tillåt webbplatskontroller",
  "conversationStart.consent.checksSummary":
    "Upp till 2 kontroller av projektets webbplats, inom projektägarens anslutna tjänster och kontrollgränser.",
  "conversationStart.consent.checksDetails": "Mer om webbplatskontroller",
};
const da: Copy = {
  "conversationStart.manage": "Administrer",
  "conversationStart.ownedIntro": "Milo bruger projektets gemte oplysninger.",
  "conversationStart.sharedIntro":
    "Delt projekt: din rolle i teamet afgør, hvad Milo kan gøre her.",
  "conversationStart.suggestions": "Forslag til at komme i gang",
  "conversationStart.suggestionHint": "Et forslag udfylder kun beskeden; intet bliver sendt.",
  "conversationStart.suggest.businessGaps": "Hvad mangler der i mine gemte virksomhedsoplysninger?",
  "conversationStart.suggest.goal": "Hjælp mig med at vælge ét klart mål og et første skridt.",
  "conversationStart.suggest.draftReview":
    "Gennemgå min kladde »{title}«, og foreslå forbedringer.",
  "conversationStart.suggest.sharedOverview": "Hvad er der indtil videre gemt i dette projekt?",
  "conversationStart.consent.title": "Tilladelser for denne besked",
  "conversationStart.consent.note": "Slået fra som standard. Gælder kun denne besked.",
  "conversationStart.consent.generationLabel": "Tillad én kladde",
  "conversationStart.consent.generationSummary":
    "Én kladde til et eksisterende emne, gemt til gennemgang. Bruger indholdskvoten. Udgivelse er et separat trin.",
  "conversationStart.consent.generationDetails": "Mere om generering af kladder",
  "conversationStart.consent.checksLabel": "Tillad webstedskontroller",
  "conversationStart.consent.checksSummary":
    "Op til 2 kontroller af projektets websted inden for projektejerens forbundne tjenester og kontrolgrænser.",
  "conversationStart.consent.checksDetails": "Mere om webstedskontroller",
};
export const firstUseCopy = { en, pl, sv, da } as const;
