/** Slovak authoring only; not registered in the runtime or language picker. */
export const skAuditScreen: Readonly<Record<string, string>> = {
  "auditScreen.title": "Kontrola stránky",
  "auditScreen.subtitle":
    "Skontrolujte obsah úvodnej stránky a údaje o firme spolu so samostatnými dôkazmi z technického prehľadávania, indexovania a merania výkonu.",
  "auditScreen.complete": "Kontrola stránky bola dokončená",
  "auditScreen.failed": "Kontrola zlyhala. Skúste to znova.",
  "auditScreen.bulkCreated": "Príležitosti vytvorené z prioritných zistení: {count}",
  "auditScreen.setupHelp":
    "Pred spustením kontroly stránky vytvorte projekt s údajmi o firme a webom.",
  "auditScreen.website": "URL webu",
  "auditScreen.inputHelp":
    "Skontrolujte {business}{location} pomocou čitateľného textu zo zadanej URL úvodnej stránky, ak je dostupný, a údajov o firme. Ak stránku nemožno načítať, hodnotenie používa iba vami poskytnutý kontext firmy. Táto akcia nespúšťa samostatné technické prehľadávanie.",
  "auditScreen.running": "Prebieha kontrola…",
  "auditScreen.rerun": "Zopakovať kontrolu",
  "auditScreen.run": "Spustiť kontrolu",
  "auditScreen.incomplete": "Kontrola sa nedokončila",
  "auditScreen.first": "Spustiť prvú kontrolu stránky",
  "auditScreen.emptyHelp":
    "Milo hodnotí dostupný text úvodnej stránky a údaje o firme z hľadiska zrozumiteľnosti, základov SEO, miestnej viditeľnosti, pripravenosti na odpovede AI, konverzií a dôvery. Skontrolujte odporúčania zoradené podľa priority a vyberte, ktoré sa stanú príležitosťami v Pláne. Táto akcia pokrýva jednu stránku a poskytnutý kontext; technické prehľadávanie má vlastné ovládacie prvky vyššie.",
  "auditScreen.readProof":
    "Zo zadanej URL úvodnej stránky bol získaný čitateľný text. Táto kontrola hodnotí tento text spolu s údajmi o firme. Skóre predstavujú hodnotenia, nie namerané technické metriky ani prehľadanie celého webu.",
  "auditScreen.unreadFallback":
    "Stránku sa nepodarilo načítať; táto kontrola používa vami poskytnuté údaje o firme.",
  "auditScreen.unreadHelp":
    "Tieto skóre sú orientačnými hodnoteniami vašich vstupov, nie meraniami aktuálneho webu.",
  "auditScreen.indicative": "Orientačné · stránka nebola načítaná",
  "auditScreen.overall": "Celkovo",
  "auditScreen.estimate": "odhad",
  "auditScreen.topFixes": "Prioritné odporúčania",
  "auditScreen.createTop": "Vytvoriť príležitosti z najviac 5 prioritných zistení",
  "auditScreen.noneRemaining":
    "Nezostali žiadne zistenia s vysokou alebo strednou prioritou, ktoré ešte neboli prevedené na príležitosti.",
  "auditScreen.scoreHelp":
    "Vyššie skóre znamená lepšie hodnotenie. Nemeria aktuálne pozície vo vyhľadávaní ani technický výkon.",
  "auditScreen.category.Business Clarity": "Zrozumiteľnosť podnikania",
  "auditScreen.category.SEO Basics": "Základy SEO",
  "auditScreen.category.Local Visibility": "Miestna viditeľnosť",
  "auditScreen.category.AI Readiness": "Pripravenosť pre AI",
  "auditScreen.category.Conversion & Trust": "Konverzie a dôvera",
};
