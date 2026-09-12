/** Slovak authoring only; not registered in the runtime or language picker. */
export const skSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "{field} musí začínať na http:// alebo https://",
  "setupScreen.missing": "Vyplňte povinné polia: {fields}",
  "setupScreen.additional": "Ďalšie jazyky obsahu",
  "setupScreen.sellingPoints": "Jedinečné predajné výhody",
  "setupScreen.publishing": "Publikovanie",
  "setupScreen.mode": "Režim publikovania",
  "setupScreen.mode.draft": "Iba návrhy",
  "setupScreen.mode.manual": "Ručné zverejňovanie",
  "setupScreen.endpoint": "Koncový bod doručovania návrhov",
  "setupScreen.liveEndpoint": "Koncový bod zverejňovania",
  "setupScreen.liveHelp":
    "Samostatný koncový bod na zverejnenie skontrolovaného návrhu. Používa rovnaký tajný kľúč na publikovanie.",
  "setupScreen.secret": "Tajný kľúč na publikovanie",
  "setupScreen.secretHelp":
    "Nové tajné kľúče ukladá server a odosiela ich nastavenému cieľu v hlavičke požiadavky. Na tomto cieli nastavte zodpovedajúci tajný kľúč.",
  "setupScreen.destination": "Predvolený cieľ",
  "setupScreen.faq": "Sekcia častých otázok",
  "setupScreen.approvalHelp":
    "Schválenie označí článok ako pripravený. Zverejnenie vyžaduje samostatnú akciu: zverejniť teraz alebo naplánovať čas zverejnenia. Pred zverejnením skontrolujte obsah a tvrdenia.",
  "setupScreen.disclaimer": "Upozornenie k obsahu vytvorenému AI",
  "setupScreen.retiredTitle": "Automatické zverejnenie po schválení bolo odstránené.",
  "setupScreen.retiredHelp":
    "Tento projekt teraz používa režim {mode}. Schválenie označí článok ako pripravený; zverejnenie stále vyžaduje samostatnú akciu alebo naplánovanie. Už schválené články môžu byť stále návrhmi. Pred naplánovaním novej práce skontrolujte ich stav.",
  "setupScreen.saving": "Ukladáme…",
  "setupScreen.save": "Uložiť nastavenia publikovania",
  "setupScreen.saved": "Nastavenia publikovania boli uložené",
  "setupScreen.failed": "Nastavenia publikovania sa nepodarilo uložiť",
  "setupScreen.tagsExample": "seo, rast",
};
