import type { OnboardingLanguage } from "@/lib/types";

/** Current acceptance wording. Historical Paddle key names remain compatible
 * with existing screens; this copy does not switch payment providers. */
export const launchReadinessCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "billing.paddleNote":
      "Live payment setup and verification are incomplete. Contact support before choosing a paid plan.",
    "launch.item.paddlePending": "Live payment verification pending",
    "launch.item.paddlePending.desc":
      "Stripe is the selected replacement for Paddle. Sandbox setup and real payment lifecycle checks remain outstanding.",
    "launch.qa.paddle": "Legacy Paddle configured",
    "beta.intro":
      "These notes track remaining setup and acceptance work. A guided demo must use verified flows; checklist completion alone does not establish readiness for a paid self-service launch.",
    "beta.reassure":
      "Choose demo flows from verified evidence. Keep untested integrations and paid launch prerequisites visible.",
    "beta.limit.paddle":
      "Live payments are not ready for a general paid launch. Stripe sandbox configuration and real payment lifecycle checks remain outstanding.",
    "beta.limit.images":
      "Publishing can include reviewed image references. Image transfer, featured images and the final layout still require real-site checks for each connector.",
    "beta.demo.payments":
      "Explain that Stripe is the selected payment provider and setup and payment lifecycle verification remain incomplete. Do not present payments as live.",
  },
  pl: {
    "billing.paddleNote":
      "Konfiguracja i weryfikacja płatności rzeczywistych nie są ukończone. Przed wyborem płatnego planu skontaktuj się z pomocą.",
    "launch.item.paddlePending": "Weryfikacja płatności rzeczywistych w toku",
    "launch.item.paddlePending.desc":
      "Stripe ma zastąpić Paddle. Konfiguracja środowiska testowego i sprawdzenie rzeczywistego cyklu płatności pozostają do wykonania.",
    "launch.qa.paddle": "Starsza integracja Paddle skonfigurowana",
    "beta.intro":
      "Te notatki pokazują pozostałe prace konfiguracyjne i odbiorowe. Demo z asystą musi korzystać ze zweryfikowanych ścieżek; samo ukończenie listy nie potwierdza gotowości do płatnego uruchomienia samoobsługowego.",
    "beta.reassure":
      "Wybieraj ścieżki demonstracyjne na podstawie zweryfikowanych dowodów. Wyraźnie wskazuj nieprzetestowane integracje i warunki płatnego uruchomienia.",
    "beta.limit.paddle":
      "Płatności rzeczywiste nie są gotowe do ogólnego płatnego uruchomienia. Konfiguracja środowiska testowego Stripe i sprawdzenie rzeczywistego cyklu płatności pozostają do wykonania.",
    "beta.limit.images":
      "Publikacja może zawierać sprawdzone odwołania do obrazów. Transfer obrazów, obrazy wyróżniające i końcowy układ nadal wymagają sprawdzenia na rzeczywistej stronie dla każdej integracji.",
    "beta.demo.payments":
      "Wyjaśnij, że wybranym dostawcą płatności jest Stripe, a konfiguracja i weryfikacja cyklu płatności nie są ukończone. Nie przedstawiaj płatności jako uruchomionych.",
  },
  sv: {
    "billing.paddleNote":
      "Konfiguration och verifiering av riktiga betalningar är inte klara. Kontakta supporten innan du väljer en betalplan.",
    "launch.item.paddlePending": "Verifiering av riktiga betalningar återstår",
    "launch.item.paddlePending.desc":
      "Stripe är den valda ersättaren för Paddle. Konfiguration av testmiljön och kontroller av det verkliga betalningsförloppet återstår.",
    "launch.qa.paddle": "Äldre Paddle-integration konfigurerad",
    "beta.intro":
      "Dessa anteckningar visar återstående konfiguration och acceptansarbete. En guidad demo måste använda verifierade flöden; en färdig checklista visar inte i sig att en betald självbetjäningslansering är redo.",
    "beta.reassure":
      "Välj demoflöden utifrån verifierade belägg. Visa tydligt vilka integrationer som inte har testats och vilka krav som återstår inför en betald lansering.",
    "beta.limit.paddle":
      "Riktiga betalningar är inte redo för en bred betald lansering. Konfiguration av Stripes testmiljö och kontroller av det verkliga betalningsförloppet återstår.",
    "beta.limit.images":
      "Publicering kan innehålla granskade bildreferenser. Bildöverföring, utvalda bilder och den slutliga layouten behöver fortfarande kontrolleras på en verklig webbplats för varje anslutning.",
    "beta.demo.payments":
      "Förklara att Stripe är den valda betalningsleverantören och att konfiguration och verifiering av betalningsförloppet inte är klara. Framställ inte betalningarna som driftsatta.",
  },
  da: {
    "billing.paddleNote":
      "Opsætning og verificering af rigtige betalinger er ikke færdige. Kontakt support, før du vælger et betalt abonnement.",
    "launch.item.paddlePending": "Verificering af rigtige betalinger udestår",
    "launch.item.paddlePending.desc":
      "Stripe er valgt som afløser for Paddle. Opsætning af testmiljøet og kontrol af det faktiske betalingsforløb udestår.",
    "launch.qa.paddle": "Ældre Paddle-integration konfigureret",
    "beta.intro":
      "Disse noter viser den resterende opsætning og acceptkontrol. En guidet demo skal bruge verificerede forløb; en færdig tjekliste dokumenterer ikke i sig selv, at en betalt selvbetjeningslancering er klar.",
    "beta.reassure":
      "Vælg demoforløb ud fra verificerede beviser. Vis tydeligt, hvilke integrationer der ikke er testet, og hvilke krav der udestår før en betalt lancering.",
    "beta.limit.paddle":
      "Rigtige betalinger er ikke klar til en bred betalt lancering. Opsætning af Stripes testmiljø og kontrol af det faktiske betalingsforløb udestår.",
    "beta.limit.images":
      "Publicering kan omfatte gennemgåede billedreferencer. Billedoverførsel, fremhævede billeder og det endelige layout skal stadig kontrolleres på et rigtigt websted for hver forbindelse.",
    "beta.demo.payments":
      "Forklar, at Stripe er den valgte betalingsudbyder, og at opsætning og verificering af betalingsforløbet ikke er færdige. Præsenter ikke betalingerne som sat i drift.",
  },
};
